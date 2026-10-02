import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import {
  LeadService,
  LEAD_STATUS_CLOSED,
  LEAD_STATUS_IN_PROGRESS,
  LEAD_STATUS_NEW,
  leadStatusLabel,
  type LeadResponse,
} from './lead.service';
import { ProductService } from '../catalogue/product.service';

/** Lead list filter: all records or one backend status number. */
export type LeadFilter = 'all' | number;

export const LEAD_FILTER_ALL = 'all' as const;

/**
 * Internal operations workspace over GET /api/leads(+/{id}) and
 * PATCH /api/leads/{id}/status. Visible only to FieldStaff/Admin sessions;
 * the backend remains the authorization boundary, so customers and anonymous
 * visitors issue no requests and see an access-denied/login state instead.
 *
 * List state and detail state are separate: selecting a lead clears the
 * previous detail first so stale data is never shown while the next record
 * loads. Filtering is client-side over the loaded records (the list endpoint
 * returns everything, newest first) and never reorders the server result.
 * Product names resolve lazily in the detail view only — never per list row.
 */
@Component({
  selector: 'app-leads',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leads.component.html',
  styleUrl: './leads.component.css',
})
export class LeadsComponent {
  private readonly auth = inject(AuthService);
  private readonly leads = inject(LeadService);
  private readonly products = inject(ProductService);

  /** Staff-only gate; customers and anonymous visitors never load data. */
  readonly canAccess = computed(() => this.auth.isStaff());
  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());

  readonly list = signal<LeadResponse[] | null>(null);
  readonly listLoading = signal(false);
  readonly listError = signal<string | null>(null);
  readonly forbidden = signal(false);

  readonly filter = signal<LeadFilter>(LEAD_FILTER_ALL);

  readonly selectedId = signal<string | null>(null);
  readonly selected = signal<LeadResponse | null>(null);
  readonly detailLoading = signal(false);
  readonly detailNotFound = signal(false);
  readonly detailError = signal<string | null>(null);
  readonly detailForbidden = signal(false);

  readonly savingStatus = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly saveNotice = signal<string | null>(null);
  /** Status number currently being saved, so its button can show progress. */
  readonly savingTo = signal<number | null>(null);
  private pendingStatus: number | null = null;

  readonly filteredLeads = computed(() => {
    const leads = this.list() ?? [];
    const filter = this.filter();
    if (filter === LEAD_FILTER_ALL) return leads;
    return leads.filter((l) => l.status === filter);
  });

  /** Product display name for the open detail (slug fallback while loading). */
  readonly detailProductName = computed(() => {
    const id = this.selected()?.interestedProductId;
    if (!id) return null;
    return this.products.products().find((p) => p.id === id)?.name ?? id;
  });

  readonly statusOptions = [
    { value: LEAD_STATUS_NEW, label: 'New' },
    { value: LEAD_STATUS_IN_PROGRESS, label: 'In Progress' },
    { value: LEAD_STATUS_CLOSED, label: 'Closed' },
  ];

  constructor() {
    if (this.auth.isStaff()) {
      this.loadLeads();
    }
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        // Never show one session's leads to another session.
        this.resetAll();
      } else if (
        this.auth.isStaff() &&
        this.list() === null &&
        !this.listLoading() &&
        !this.listError() &&
        !this.forbidden()
      ) {
        this.loadLeads();
      }
    });
  }

  statusLabel(status: number): string {
    return leadStatusLabel(status);
  }

  setFilter(filter: LeadFilter): void {
    this.filter.set(filter);
  }

  /** GET /api/leads — staff only; no-op otherwise or while loading. */
  loadLeads(): void {
    if (!this.auth.isStaff() || this.listLoading()) return;
    this.listLoading.set(true);
    this.listError.set(null);
    this.forbidden.set(false);
    this.leads.getLeads().subscribe({
      next: (leads) => {
        this.list.set(leads ?? []);
        this.listLoading.set(false);
      },
      error: (err: unknown) => {
        this.listLoading.set(false);
        this.handleListError(err);
      },
    });
  }

  /** GET /api/leads/{id} — staff only; clears the previous detail first. */
  viewDetails(id: string): void {
    if (!this.auth.isStaff()) return;
    this.selectedId.set(id);
    this.selected.set(null);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.detailForbidden.set(false);
    this.clearSaveState();
    this.detailLoading.set(true);
    this.leads.getLead(id).subscribe({
      next: (lead) => {
        this.selected.set(lead);
        this.detailLoading.set(false);
        this.maybeLoadProducts(lead.interestedProductId);
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
    this.clearSaveState();
  }

  retryDetail(): void {
    const id = this.selectedId();
    if (id) {
      this.viewDetails(id);
    }
  }

  /**
   * PATCH /api/leads/{id}/status — staff only. Duplicate taps collapse into
   * the single in-flight request. On success the detail and the list row
   * update together; on failure the previous status is preserved with a
   * retry path.
   */
  updateStatus(status: number): void {
    const lead = this.selected();
    if (!this.auth.isStaff() || lead === null || this.savingStatus()) return;
    this.savingStatus.set(true);
    this.savingTo.set(status);
    this.saveError.set(null);
    this.saveNotice.set(null);
    this.pendingStatus = status;
    this.leads.updateLeadStatus(lead.id, status).subscribe({
      next: (updated) => {
        this.savingStatus.set(false);
        this.savingTo.set(null);
        this.pendingStatus = null;
        this.selected.set(updated);
        this.list.update((rows) =>
          rows === null ? rows : rows.map((r) => (r.id === updated.id ? updated : r))
        );
        this.saveNotice.set(`Status updated to ${this.statusLabel(updated.status)}.`);
      },
      error: (err: unknown) => {
        this.savingStatus.set(false);
        this.savingTo.set(null);
        this.handleSaveError(err);
      },
    });
  }

  retryStatusUpdate(): void {
    if (this.pendingStatus !== null) {
      const status = this.pendingStatus;
      this.pendingStatus = null;
      this.updateStatus(status);
    }
  }

  /** Resolves detail product names without touching the list path. */
  private maybeLoadProducts(interestedProductId: string | null): void {
    if (!interestedProductId) return;
    if (this.products.products().some((p) => p.id === interestedProductId)) return;
    this.products.load();
  }

  private clearSaveState(): void {
    this.savingStatus.set(false);
    this.savingTo.set(null);
    this.saveError.set(null);
    this.saveNotice.set(null);
    this.pendingStatus = null;
  }

  private resetAll(): void {
    this.list.set(null);
    this.listLoading.set(false);
    this.listError.set(null);
    this.forbidden.set(false);
    this.filter.set(LEAD_FILTER_ALL);
    this.selectedId.set(null);
    this.selected.set(null);
    this.detailLoading.set(false);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.detailForbidden.set(false);
    this.clearSaveState();
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

  private handleSaveError(err: unknown): void {
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
    // The previous status stays on screen; only the error is surfaced.
    this.saveError.set(this.describeError(err));
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
    if (status === 404) return 'That lead could not be found.';
    return 'Something went wrong. Please try again.';
  }
}
