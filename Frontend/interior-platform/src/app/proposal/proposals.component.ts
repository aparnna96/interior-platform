import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import {
  ProposalService,
  proposalStatusLabel,
  type ProposalDetailDto,
  type ProposalSummaryDto,
} from './proposal.service';

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
    this.appliedCreatedId = null;
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
