import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { EstimateService, type EstimateDto, type EstimateSummaryDto } from './estimate.service';
import { ProposalService, type ProposalDetailDto } from '../proposal/proposal.service';

/**
 * Saved-estimates list + detail over GET /api/estimates(+/{id}).
 *
 * List state and detail state are separate: selecting an estimate clears
 * the previous detail first so stale data is never shown while the next
 * record loads. History renders from the server snapshots only — the
 * visualizer calculator and the Product API are never consulted.
 * Unauthenticated visitors issue no requests; a 401 drops the session
 * (existing logout behavior) and resets this view.
 *
 * Each saved estimate can spawn a customer proposal via POST
 * /api/proposals with exactly `{ estimateId }`: ownership, dimensions,
 * prices, totals, status and timestamps all derive server-side. Creation
 * never mutates the saved estimate, the cart, or the visualizer state;
 * success emits `proposalCreated` so the shell can open the new detail.
 */
@Component({
  selector: 'app-saved-estimates',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './saved-estimates.component.html',
  styleUrl: './saved-estimates.component.css',
})
export class SavedEstimatesComponent {
  private readonly auth = inject(AuthService);
  private readonly estimates = inject(EstimateService);
  private readonly proposals = inject(ProposalService);

  /** Emits the server-created proposal so the shell can open its detail. */
  readonly proposalCreated = output<ProposalDetailDto>();

  readonly list = signal<EstimateSummaryDto[] | null>(null);
  readonly listLoading = signal(false);
  readonly listError = signal<string | null>(null);

  readonly selectedId = signal<string | null>(null);
  readonly selected = signal<EstimateDto | null>(null);
  readonly detailLoading = signal(false);
  readonly detailNotFound = signal(false);
  readonly detailError = signal<string | null>(null);

  /** Estimate id with a POST /api/proposals in flight, or null. */
  readonly creatingProposalFor = signal<string | null>(null);
  readonly createProposalError = signal<string | null>(null);
  readonly createProposalErrorFor = signal<string | null>(null);
  readonly createProposalSuccess = signal<string | null>(null);

  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());

  constructor() {
    if (this.auth.isAuthenticated()) {
      this.loadEstimates();
    }
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        // Never show one user's estimates to another session.
        this.resetAll();
      } else if (this.list() === null && !this.listLoading() && !this.listError()) {
        this.loadEstimates();
      }
    });
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN');
  }

  /** GET /api/estimates — no-op while logged out or while loading. */
  loadEstimates(): void {
    if (!this.auth.isAuthenticated() || this.listLoading()) return;
    this.listLoading.set(true);
    this.listError.set(null);
    this.estimates.getEstimates().subscribe({
      next: (estimates) => {
        this.list.set(estimates ?? []);
        this.listLoading.set(false);
      },
      error: (err: unknown) => {
        this.listLoading.set(false);
        this.handleListError(err);
      },
    });
  }

  /** GET /api/estimates/{id} — clears the previous detail before requesting. */
  viewDetails(id: string): void {
    if (!this.auth.isAuthenticated()) return;
    this.selectedId.set(id);
    this.selected.set(null);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.detailLoading.set(true);
    this.estimates.getEstimate(id).subscribe({
      next: (estimate) => {
        this.selected.set(estimate);
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
    this.detailLoading.set(false);
  }

  retryDetail(): void {
    const id = this.selectedId();
    if (id) {
      this.viewDetails(id);
    }
  }

  /**
   * POST /api/proposals with exactly `{ estimateId }` — no-op while logged
   * out or while a creation is already in flight (duplicate clicks collapse
   * into the single request). The saved estimate, the cart and the
   * visualizer are never touched: success only announces the new snapshot
   * via `proposalCreated`, and failure leaves everything intact for retry.
   */
  createProposal(estimateId: string): void {
    if (this.creatingProposalFor() !== null) return;
    if (!this.auth.isAuthenticated()) {
      this.createProposalError.set('Please log in to create a proposal.');
      this.createProposalErrorFor.set(estimateId);
      return;
    }
    this.creatingProposalFor.set(estimateId);
    this.createProposalError.set(null);
    this.createProposalErrorFor.set(null);
    this.createProposalSuccess.set(null);
    this.proposals.createProposal(estimateId).subscribe({
      next: (proposal) => {
        this.creatingProposalFor.set(null);
        this.createProposalSuccess.set('Proposal created successfully.');
        this.proposalCreated.emit(proposal);
      },
      error: (err: unknown) => {
        this.creatingProposalFor.set(null);
        this.handleCreateProposalError(err, estimateId);
      },
    });
  }

  retryCreateProposal(): void {
    const id = this.createProposalErrorFor();
    if (id) {
      this.createProposal(id);
    }
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
    this.creatingProposalFor.set(null);
    this.createProposalError.set(null);
    this.createProposalErrorFor.set(null);
    this.createProposalSuccess.set(null);
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

  private handleCreateProposalError(err: unknown, estimateId: string): void {
    if ((err as { status?: number })?.status === 401) {
      this.auth.logout();
      this.resetAll();
      this.listError.set('Your session has expired. Please log in again.');
      return;
    }
    // The saved estimate stays intact: only the creation error is surfaced,
    // with the source id retained so the user can retry.
    this.createProposalError.set(this.describeError(err));
    this.createProposalErrorFor.set(estimateId);
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
    if (status === 404) return 'That estimate could not be found.';
    return 'Something went wrong. Please try again.';
  }
}
