import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import {
  ProposalService,
  ProposalPaymentStatus,
  proposalStatusLabel,
  type CreateProposalPaymentResponse,
  type ProposalDetailDto,
  type ProposalSummaryDto,
  type VerifyProposalPaymentResponse,
} from './proposal.service';
import { RazorpayCheckoutService } from './razorpay-checkout.service';
import type {
  RazorpayCheckoutInstance,
  RazorpayCheckoutResponse,
} from './razorpay-checkout';

/**
 * Customer-facing token payment states for one open proposal. The backend
 * verification response alone decides success: `verified` is entered only
 * after POST /api/payments/verify reports Verified. Nothing is persisted to
 * localStorage — reopening a proposal always restarts from `idle` because
 * the open detail endpoint carries no payment state (a retry then safely
 * reuses the backend's open order or reports the verified payment).
 */
export type ProposalPaymentState =
  | 'idle'
  | 'creating'
  | 'checkout-open'
  | 'verifying'
  | 'verified'
  | 'failed'
  | 'cancelled'
  | 'unavailable';

/** Razorpay Checkout takes the smallest currency unit (paise for INR). */
function toCheckoutPaise(amountMajorUnits: number): number {
  return Math.round(amountMajorUnits * 100);
}

/**
 * Customer proposal history over GET /api/proposals + GET /api/proposals/{id}.
 *
 * List state and detail state are separate: selecting a proposal clears the
 * previous detail first so stale data is never shown while the next record
 * loads. History renders from the proposal snapshots only — the Product API
 * is never consulted. Unauthenticated visitors issue no requests; a 401
 * drops the session (existing logout behavior) and resets this view.
 *
 * Newly created proposals arrive via the `createdDetail` input (set by the
 * saved-estimate creation flow): the detail opens immediately from that
 * snapshot with no extra fetch, and the list refresh still comes from the
 * server. Each snapshot is applied once (tracked by id); the parent clears
 * the input when leaving the view.
 *
 * Token payments run per open proposal through Razorpay Checkout (TEST
 * mode): Pay Token → backend order → Checkout → backend verification.
 * Checkout success alone never counts — only a Verified backend response
 * shows success.
 */
@Component({
  selector: 'app-proposals',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './proposals.component.html',
  styleUrl: './proposals.component.css',
})
export class ProposalsComponent {
  private readonly auth = inject(AuthService);
  private readonly proposals = inject(ProposalService);
  private readonly checkout = inject(RazorpayCheckoutService);

  /** Requests returning to the existing Furniture catalogue. */
  browse = output<void>();

  /** Server-created proposal snapshot to open without refetching. */
  readonly createdDetail = input<ProposalDetailDto | null>(null);

  readonly list = signal<ProposalSummaryDto[] | null>(null);
  readonly listLoading = signal(false);
  readonly listError = signal<string | null>(null);

  readonly selectedId = signal<string | null>(null);
  readonly selected = signal<ProposalDetailDto | null>(null);
  readonly detailLoading = signal(false);
  readonly detailNotFound = signal(false);
  readonly detailError = signal<string | null>(null);

  /** Transient confirmation shown after a creation flow opens its detail. */
  readonly notice = signal<string | null>(null);

  /** True while GET /api/proposals/{id}/pdf is in flight — blocks duplicates. */
  readonly pdfDownloading = signal(false);
  readonly pdfError = signal<string | null>(null);

  /** Token payment flow state for the open proposal (runtime only). */
  readonly paymentState = signal<ProposalPaymentState>('idle');
  /** Last backend payment-order response (holds the authoritative amount). */
  readonly paymentOrder = signal<CreateProposalPaymentResponse | null>(null);
  /** Backend verification outcome, set only after a Verified response. */
  readonly verifiedPayment = signal<VerifyProposalPaymentResponse | null>(null);
  readonly paymentError = signal<string | null>(null);
  /** False after a 409: retrying a verified payment is pointless. */
  readonly paymentRetryAllowed = signal(true);

  /** Id of the last applied `createdDetail`, so each snapshot opens once. */
  private appliedCreatedId: string | null = null;

  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());

  constructor() {
    if (this.auth.isAuthenticated()) {
      this.loadProposals();
    }
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        // Never show one user's proposals to another session.
        this.resetAll();
      } else if (this.list() === null && !this.listLoading() && !this.listError()) {
        this.loadProposals();
      }
    });
    effect(() => {
      const created = this.createdDetail();
      if (created && this.auth.isAuthenticated() && this.appliedCreatedId !== created.id) {
        this.appliedCreatedId = created.id;
        this.showCreated(created);
      }
    });
  }

  goBrowse(): void {
    this.browse.emit();
  }

  statusLabel(status: number): string {
    return proposalStatusLabel(status);
  }

  proposalItemCount(proposal: ProposalDetailDto): number {
    return proposal.items.reduce((n, i) => n + i.quantity, 0);
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN');
  }

  /** GET /api/proposals — no-op while logged out or while a load is in flight. */
  loadProposals(): void {
    if (!this.auth.isAuthenticated() || this.listLoading()) return;
    this.listLoading.set(true);
    this.listError.set(null);
    this.proposals.getProposals().subscribe({
      next: (proposals) => {
        this.list.set(proposals ?? []);
        this.listLoading.set(false);
      },
      error: (err: unknown) => {
        this.listLoading.set(false);
        this.handleListError(err);
      },
    });
  }

  /** GET /api/proposals/{id} — clears the previous detail before requesting. */
  viewDetails(id: string): void {
    if (!this.auth.isAuthenticated()) return;
    this.selectedId.set(id);
    this.selected.set(null);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.detailLoading.set(true);
    this.resetPaymentState();
    this.proposals.getProposal(id).subscribe({
      next: (proposal) => {
        this.selected.set(proposal);
        this.detailLoading.set(false);
      },
      error: (err: unknown) => {
        this.detailLoading.set(false);
        this.handleDetailError(err);
      },
    });
  }

  /**
   * Opens an already-fetched created proposal: no detail GET is issued.
   * The summary is prepended to a loaded list when absent; a pending server
   * list refresh already covers the not-yet-loaded case.
   */
  showCreated(detail: ProposalDetailDto): void {
    if (!this.auth.isAuthenticated()) return;
    this.appliedCreatedId = detail.id;
    const current = this.list();
    if (current !== null && !current.some((p) => p.id === detail.id)) {
      this.list.set([
        {
          id: detail.id,
          estimateId: detail.estimateId,
          status: detail.status,
          createdAt: detail.createdAt,
          area: detail.area,
          estimatedAmount: detail.estimatedAmount,
        },
        ...current,
      ]);
    }
    this.selectedId.set(detail.id);
    this.selected.set(detail);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.detailLoading.set(false);
    this.resetPaymentState();
    this.notice.set('Proposal created successfully.');
  }

  backToProposals(): void {
    this.selectedId.set(null);
    this.selected.set(null);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.detailLoading.set(false);
    this.notice.set(null);
    this.pdfDownloading.set(false);
    this.pdfError.set(null);
    this.resetPaymentState();
  }

  retryDetail(): void {
    const id = this.selectedId();
    if (id) {
      this.viewDetails(id);
    }
  }

  /** Sensible download name for the rendered proposal document. */
  pdfFileName(id: string): string {
    return `proposal-${id}.pdf`;
  }

  /**
   * GET /api/proposals/{id}/pdf for the open proposal and save the returned
   * blob — no-op while logged out or while a download is already in flight.
   * The document bytes come from the server snapshot; no ProductService
   * data is involved.
   */
  downloadPdf(): void {
    const proposal = this.selected();
    if (this.pdfDownloading() || proposal === null) return;
    if (!this.auth.isAuthenticated()) return;
    this.pdfDownloading.set(true);
    this.pdfError.set(null);
    this.proposals.downloadProposalPdf(proposal.id).subscribe({
      next: (blob) => {
        this.pdfDownloading.set(false);
        this.saveBlob(blob, this.pdfFileName(proposal.id));
      },
      error: (err: unknown) => {
        this.pdfDownloading.set(false);
        this.handlePdfError(err);
      },
    });
  }

  retryPdf(): void {
    if (this.selected() !== null) {
      this.downloadPdf();
    }
  }

  /** True while a payment step is in flight — the Pay action stays parked. */
  paymentBusy(): boolean {
    const state = this.paymentState();
    return state === 'creating' || state === 'checkout-open' || state === 'verifying';
  }

  /**
   * Starts the token payment for the open proposal: POSTs the backend order
   * (no amount leaves the client), then opens Razorpay Checkout with the
   * backend-returned key, paise amount, currency and order id. Duplicate
   * clicks collapse into the single in-flight attempt.
   */
  payToken(): void {
    const proposal = this.selected();
    if (proposal === null || !this.auth.isAuthenticated() || this.paymentBusy()) return;
    this.paymentState.set('creating');
    this.paymentError.set(null);
    this.paymentRetryAllowed.set(true);
    this.verifiedPayment.set(null);
    this.proposals.createProposalPayment(proposal.id).subscribe({
      next: (order) => {
        this.paymentOrder.set(order);
        void this.openCheckout(order);
      },
      error: (err: unknown) => {
        this.handleCreatePaymentError(err);
      },
    });
  }

  /** Re-attempts the payment order after a retryable failure. */
  retryPayment(): void {
    if (this.selected() !== null && !this.paymentBusy()) {
      this.payToken();
    }
  }

  private async openCheckout(order: CreateProposalPaymentResponse): Promise<void> {
    // The user may have navigated away while the order was created: never
    // open Checkout for a stale detail.
    if (this.selected()?.id !== order.proposalId) {
      this.resetPaymentState();
      return;
    }
    let loaded = false;
    try {
      loaded = await this.checkout.load();
    } catch {
      loaded = false;
    }
    if (this.selected()?.id !== order.proposalId) {
      this.resetPaymentState();
      return;
    }
    if (!loaded) {
      this.paymentState.set('unavailable');
      this.paymentError.set('Payments are currently unavailable. Please check your connection and try again.');
      this.paymentRetryAllowed.set(true);
      return;
    }
    let instance: RazorpayCheckoutInstance | null = null;
    try {
      instance = this.checkout.open({
        key: order.providerKeyId,
        amount: toCheckoutPaise(order.amount),
        currency: order.currency,
        order_id: order.providerOrderId,
        name: 'Confident Group',
        description: 'Interior proposal token payment',
        theme: { color: '#1C1917' },
        modal: { ondismiss: () => this.onCheckoutDismissed() },
        handler: (response) => this.onCheckoutSuccess(order, response),
      });
      if (instance === null) {
        this.paymentState.set('unavailable');
        this.paymentError.set('Payments are currently unavailable. Please try again later.');
        this.paymentRetryAllowed.set(true);
        return;
      }
      instance.on('payment.failed', () => this.onCheckoutPaymentFailed());
      this.paymentState.set('checkout-open');
      instance.open();
    } catch {
      this.paymentState.set('failed');
      this.paymentError.set('Could not start the payment. Please try again.');
      this.paymentRetryAllowed.set(true);
    }
  }

  /**
   * Checkout returned a successful-looking result. This proves nothing yet:
   * the result goes to POST /api/payments/verify and only a Verified
   * backend response shows success.
   */
  private onCheckoutSuccess(
    order: CreateProposalPaymentResponse,
    response: RazorpayCheckoutResponse
  ): void {
    if (this.paymentState() === 'verifying') return;
    if (this.selected()?.id !== order.proposalId) return;
    this.paymentState.set('verifying');
    this.paymentError.set(null);
    this.proposals
      .verifyProposalPayment({
        paymentId: order.paymentId,
        razorpayOrderId: response.razorpay_order_id,
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
      })
      .subscribe({
        next: (outcome) => {
          if (outcome.status === ProposalPaymentStatus.Verified) {
            this.verifiedPayment.set(outcome);
            this.paymentState.set('verified');
            this.paymentError.set(null);
          } else {
            this.paymentState.set('failed');
            this.paymentError.set('Payment verification failed. You can try again.');
            this.paymentRetryAllowed.set(true);
          }
        },
        error: (err: unknown) => {
          this.handleVerifyError(err);
        },
      });
  }

  /**
   * The user closed Checkout without paying: not a backend failure, so no
   * verification call and no success claim. Late dismissals after a
   * completed flow are ignored.
   */
  private onCheckoutDismissed(): void {
    if (this.paymentState() !== 'checkout-open') return;
    this.paymentState.set('cancelled');
    this.paymentError.set(null);
  }

  /** Razorpay reported the charge itself as failed: no signature to verify. */
  private onCheckoutPaymentFailed(): void {
    if (this.paymentState() !== 'checkout-open') return;
    this.paymentState.set('failed');
    this.paymentError.set('The payment did not go through. You can try again.');
    this.paymentRetryAllowed.set(true);
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  private resetAll(): void {
    this.list.set(null);
    this.listLoading.set(false);
    this.listError.set(null);
    this.selectedId.set(null);
    this.selected.set(null);
    this.detailLoading.set(false);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.notice.set(null);
    this.pdfDownloading.set(false);
    this.pdfError.set(null);
    this.resetPaymentState();
    this.appliedCreatedId = null;
  }

  /** Returns the payment flow to its initial state (never persisted). */
  private resetPaymentState(): void {
    this.paymentState.set('idle');
    this.paymentOrder.set(null);
    this.verifiedPayment.set(null);
    this.paymentError.set(null);
    this.paymentRetryAllowed.set(true);
  }

  private handleListError(err: unknown): void {
    if ((err as { status?: number })?.status === 401) {
      this.auth.logout();
      this.resetAll();
      this.listError.set('Your session has expired. Please log in again.');
      return;
    }
    this.listError.set(this.describeError(err));
  }

  private handleDetailError(err: unknown): void {
    const status = (err as { status?: number })?.status;
    if (status === 401) {
      this.auth.logout();
      this.resetAll();
      this.listError.set('Your session has expired. Please log in again.');
      return;
    }
    if (status === 404) {
      this.detailNotFound.set(true);
      return;
    }
    this.detailError.set(this.describeError(err));
  }

  private handlePdfError(err: unknown): void {
    const status = (err as { status?: number })?.status;
    if (status === 401) {
      this.auth.logout();
      this.resetAll();
      this.listError.set('Your session has expired. Please log in again.');
      return;
    }
    if (status === 404) {
      this.pdfError.set('That proposal could not be found.');
      return;
    }
    this.pdfError.set(this.describeError(err));
  }

  private handleCreatePaymentError(err: unknown): void {
    const status = (err as { status?: number })?.status;
    if (status === 401) {
      this.auth.logout();
      this.resetAll();
      this.listError.set('Your session has expired. Please log in again.');
      return;
    }
    if (status === 409) {
      // The backend reports an existing verified payment: surface its
      // message and withhold retry — re-paying is pointless.
      this.paymentState.set('failed');
      this.paymentError.set(this.describeError(err));
      this.paymentRetryAllowed.set(false);
      return;
    }
    this.paymentState.set('failed');
    this.paymentError.set(this.describeError(err));
    this.paymentRetryAllowed.set(true);
  }

  private handleVerifyError(err: unknown): void {
    const status = (err as { status?: number })?.status;
    if (status === 401) {
      this.auth.logout();
      this.resetAll();
      this.listError.set('Your session has expired. Please log in again.');
      return;
    }
    this.paymentState.set('failed');
    this.paymentError.set(this.describeError(err));
    this.paymentRetryAllowed.set(true);
  }

  private describeError(err: unknown): string {
    const status = (err as { status?: number })?.status;
    const body = (err as { error?: unknown })?.error;
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      const title = record['title'];
      if (typeof title === 'string' && title) return title;
      const errors = record['errors'];
      if (errors && typeof errors === 'object') {
        const first = Object.values(errors as Record<string, unknown>)
          .flat()
          .map(String)
          .find((m) => m);
        if (first) return first;
      }
    }
    if (typeof body === 'string' && body) return body;
    if (status === 404) return 'That proposal could not be found.';
    return 'Something went wrong. Please try again.';
  }
}
