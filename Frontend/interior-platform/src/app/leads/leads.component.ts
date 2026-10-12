import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
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
import { AdminAttentionService } from '../shared/admin/admin-attention.service';
import { AdminPagerComponent } from '../shared/admin/admin-pager.component';
import { AdminStateComponent } from '../shared/admin/admin-state.component';
import { BadgeComponent, leadTone } from '../shared/admin/badge.component';
import { SortHeaderComponent } from '../shared/admin/sort-header.component';
import { TableState } from '../shared/admin/table-state';

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
  imports: [DatePipe, AdminPagerComponent, AdminStateComponent, BadgeComponent, SortHeaderComponent],
  templateUrl: './leads.component.html',
  styleUrl: './leads.component.css',
})
export class LeadsComponent {
  private readonly auth = inject(AuthService);
  private readonly leads = inject(LeadService);
  private readonly products = inject(ProductService);
  private readonly attention = inject(AdminAttentionService);

  /** The lead the address names (/admin/leads/:id), or null on the list. Staff pages pass nothing. */
  readonly recordId = input<string | null>(null);
  /** The user opened (id) or closed (null) a lead: the Admin shell mirrors it in the address. */
  readonly recordChange = output<string | null>();

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

  readonly table = new TableState<LeadResponse>(() => this.filteredLeads(), {
    searchText: (l) =>
      `${l.name} ${l.phone} ${l.email ?? ''} ${l.source ?? ''} ${l.interestedProductId ?? ''} ${leadStatusLabel(l.status)}`,
    sorters: {
      name: (l) => l.name.toLowerCase(),
      date: (l) => Date.parse(l.createdAt),
      source: (l) => l.source?.toLowerCase() ?? null,
      status: (l) => l.status,
    },
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
    // The address names a lead (or no longer does): show it.
    effect(() => {
      const id = this.recordId();
      untracked(() => {
        if (!this.auth.isStaff() || id === this.selectedId()) return;
        if (id) this.openRecord(id);
        else this.closeRecord();
      });
    });
  }

  statusLabel(status: number): string {
    return leadStatusLabel(status);
  }

  tone(status: number) {
    return leadTone(status);
  }

  setFilter(filter: LeadFilter): void {
    this.filter.set(filter);
    this.table.resetPage();
  }

  clearFilters(): void {
    this.filter.set(LEAD_FILTER_ALL);
    this.table.reset();
  }

  /** True when a search or a status filter is narrowing the list. */
  hasFilters(): boolean {
    return this.filter() !== LEAD_FILTER_ALL || this.table.query().trim() !== '';
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
        this.attention.reportLeads(this.list() ?? []);
      },
      error: (err: unknown) => {
        this.listLoading.set(false);
        this.handleListError(err);
      },
    });
  }

  /** The user chose a lead in the list: open it and let the Admin shell put it in the address. */
  viewDetails(id: string): void {
    if (!this.auth.isStaff()) return;
    this.openRecord(id);
    this.recordChange.emit(id);
  }

  /** GET /api/leads/{id} — staff only; clears the previous detail first. */
  private openRecord(id: string): void {
    this.selectedId.set(id);
    this.selected.set(null);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.detailForbidden.set(false);
    this.clearSaveState();
    this.detailLoading.set(true);
    this.leads.getLead(id).subscribe({
      next: (lead) => {
        if (this.selectedId() !== id) return;
        this.selected.set(lead);
        this.detailLoading.set(false);
        this.maybeLoadProducts(lead.interestedProductId);
      },
      error: (err: unknown) => {
        if (this.selectedId() !== id) return;
        this.detailLoading.set(false);
        this.handleDetailError(err);
      },
    });
  }

  backToList(): void {
    this.closeRecord();
    this.recordChange.emit(null);
  }

  private closeRecord(): void {
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
      this.openRecord(id);
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
        this.attention.reportLeads(this.list() ?? []);
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
    this.table.reset();
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
