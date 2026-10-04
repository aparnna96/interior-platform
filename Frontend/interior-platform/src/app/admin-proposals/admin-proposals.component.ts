import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import {
  ProposalService,
  proposalPaymentStatusLabel,
  proposalStatusLabel,
  type AdminProposalDetailDto,
  type AdminProposalSummaryDto,
} from '../proposal/proposal.service';

/**
 * Internal Admin-only proposal and payment operations over
 * GET /api/admin/proposals(+/{id}). Visible only to Admin sessions; the
 * backend remains the authorization boundary, so anyone else issues no
 * requests and sees an access-denied / login state instead. Everything is
 * read-only: proposals and payments can be inspected but never edited here.
 *
 * List state and detail state are separate: selecting a proposal clears the
 * previous detail first so stale data is never shown while the next record
 * loads. Item names and prices render straight from the proposal snapshots —
 * the Product API is never consulted, so history stays accurate even after
 * catalogue changes.
 *
 * The PDF download reuses the customer PDF endpoint, which independently
 * re-checks verified payment on every request: the button renders only when
 * the backend detail flag reports a verified payment, and the backend
 * remains authoritative.
 */
@Component({
  selector: 'app-admin-proposals',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-proposals.component.html',
  styleUrl: './admin-proposals.component.css',
})
export class AdminProposalsComponent {
  private readonly auth = inject(AuthService);
  private readonly proposals = inject(ProposalService);

  /** Admin-only gate; anyone else never loads admin data. */
  readonly canAccess = computed(() => this.auth.isAdmin());
  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());

  readonly list = signal<AdminProposalSummaryDto[] | null>(null);
  readonly listLoading = signal(false);
  readonly listError = signal<string | null>(null);
  readonly forbidden = signal(false);

  readonly selectedId = signal<string | null>(null);
  readonly selected = signal<AdminProposalDetailDto | null>(null);
  readonly detailLoading = signal(false);
  readonly detailNotFound = signal(false);
  readonly detailError = signal<string | null>(null);
  readonly detailForbidden = signal(false);

  /** True while GET /api/proposals/{id}/pdf is in flight — blocks duplicates. */
  readonly pdfDownloading = signal(false);
  readonly pdfError = signal<string | null>(null);

  constructor() {
    if (this.auth.isAdmin()) {
      this.loadProposals();
    }
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        // Never show one session's admin data to another session.
        this.resetAll();
      } else if (
        this.auth.isAdmin() &&
        this.list() === null &&
        !this.listLoading() &&
        !this.listError() &&
        !this.forbidden()
      ) {
        this.loadProposals();
      }
    });
  }

  statusLabel(status: number): string {
    return proposalStatusLabel(status);
  }

  paymentStatusLabel(status: number): string {
    return proposalPaymentStatusLabel(status);
  }

  /** List-row payment state derived from the backend flags (display only). */
  listPaymentLabel(proposal: AdminProposalSummaryDto): string {
    if (proposal.isPaymentVerified) {
      return 'Token Payment Verified';
    }
    if (proposal.paymentAttemptCount > 0) {
      return 'Payment Pending';
    }
    return 'No Payment Attempt';
  }

  proposalItemCount(proposal: AdminProposalDetailDto): number {
    return proposal.items.reduce((n, i) => n + i.quantity, 0);
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN');
  }

  /** Short recognizable identifier for list rows; the full id lives in detail. */
  shortId(id: string): string {
    return id.length > 8 ? id.slice(0, 8) : id;
  }

  /** Sensible download name for the rendered proposal document. */
  pdfFileName(id: string): string {
    return `proposal-${id}.pdf`;
  }

  /** GET /api/admin/proposals — Admin only; no-op otherwise or while loading. */
  loadProposals(): void {
    if (!this.auth.isAdmin() || this.listLoading()) return;
    this.listLoading.set(true);
    this.listError.set(null);
    this.forbidden.set(false);
    this.proposals.getAdminProposals().subscribe({
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

  /** GET /api/admin/proposals/{id} — Admin only; clears the previous detail first. */
  viewDetails(id: string): void {
    if (!this.auth.isAdmin()) return;
    this.selectedId.set(id);
    this.selected.set(null);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.detailForbidden.set(false);
    this.detailLoading.set(true);
    this.pdfDownloading.set(false);
    this.pdfError.set(null);
    this.proposals.getAdminProposal(id).subscribe({
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

  backToList(): void {
    this.selectedId.set(null);
    this.selected.set(null);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.detailForbidden.set(false);
    this.detailLoading.set(false);
    this.pdfDownloading.set(false);
    this.pdfError.set(null);
  }

  retryDetail(): void {
    const id = this.selectedId();
    if (id) {
      this.viewDetails(id);
    }
  }

  /**
   * GET /api/proposals/{id}/pdf for the open proposal and save the returned
   * blob — no-op while logged out, while a download is already in flight,
   * or while the backend flag reports no verified payment. The endpoint
   * re-checks verified payment server-side on every request regardless.
   */
  downloadPdf(): void {
    const proposal = this.selected();
    if (this.pdfDownloading() || proposal === null) return;
    if (!this.auth.isAdmin() || !proposal.isPaymentVerified) return;
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
    this.forbidden.set(false);
    this.selectedId.set(null);
    this.selected.set(null);
    this.detailLoading.set(false);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.detailForbidden.set(false);
    this.pdfDownloading.set(false);
    this.pdfError.set(null);
  }

  private handleListError(err: unknown): void {
    if ((err as { status?: number })?.status === 401) {
      this.auth.logout();
      this.resetAll();
      this.listError.set('Your session has expired. Please log in again.');
      return;
    }
    if ((err as { status?: number })?.status === 403) {
      this.forbidden.set(true);
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
    if (status === 403) {
      this.detailForbidden.set(true);
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
    if (status === 403) {
      this.pdfError.set('Complete and verify the token payment before downloading the proposal PDF.');
      return;
    }
    this.pdfError.set(this.describeError(err));
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
