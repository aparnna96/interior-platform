import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService } from '../auth.service';
import {
  OrderService,
  orderStatusLabel,
  type AdminOrderDetailDto,
  type AdminOrderSummaryDto,
} from '../orders/order.service';
import { AdminAttentionService } from '../shared/admin/admin-attention.service';
import { AdminPagerComponent } from '../shared/admin/admin-pager.component';
import { AdminStateComponent } from '../shared/admin/admin-state.component';
import { BadgeComponent, orderTone } from '../shared/admin/badge.component';
import { SortHeaderComponent } from '../shared/admin/sort-header.component';
import { TableState } from '../shared/admin/table-state';

/** Order status filter: every order, or one backend status number. */
export type OrderFilter = 'all' | number;

/** The statuses the filter offers, in the order an order moves through them. */
const STATUS_OPTIONS: readonly number[] = [0, 1, 2, 3, 4];

/**
 * Internal Admin-only order operations over GET /api/admin/orders(+/{id}).
 * Visible only to Admin sessions; the backend remains the authorization
 * boundary, so anyone else issues no requests and sees an access-denied /
 * login state instead. The one write is the order status: the detail page offers only
 * the moves the server lists in allowedNextStatuses, Cancel asks for a second
 * click, and the server's answer (including a 409 for a move that is no longer
 * legal) is what the page shows.
 *
 * The list is a table that searches, filters by status, sorts and pages over
 * the loaded rows (the endpoint returns all of them, newest first). An order
 * has its own address: the shell passes `recordId` from /admin/orders/:id and
 * hears about opening or closing an order through `recordChange`, so a refresh
 * or a shared link reopens the same order. Used on its own (no shell) it
 * still works, keeping the open order in `selectedId`.
 *
 * List state and detail state are separate: selecting an order clears the
 * previous detail first so stale data is never shown while the next record
 * loads. Item names and prices render straight from the order snapshots —
 * the Product API is never consulted, so history stays accurate even after
 * catalogue changes.
 */
@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [DatePipe, AdminPagerComponent, AdminStateComponent, BadgeComponent, SortHeaderComponent],
  templateUrl: './admin-orders.component.html',
  styleUrl: './admin-orders.component.css',
})
export class AdminOrdersComponent {
  private readonly auth = inject(AuthService);
  private readonly orders = inject(OrderService);
  private readonly attention = inject(AdminAttentionService);

  /** The order the address names (/admin/orders/:id), or null on the list. */
  readonly recordId = input<string | null>(null);
  /** The Admin opened (id) or closed (null) an order: the shell mirrors it in the address. */
  readonly recordChange = output<string | null>();

  /** Admin-only gate; anyone else never loads admin data. */
  readonly canAccess = computed(() => this.auth.isAdmin());
  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());

  readonly list = signal<AdminOrderSummaryDto[] | null>(null);
  readonly listLoading = signal(false);
  readonly listError = signal<string | null>(null);
  readonly forbidden = signal(false);

  readonly statusFilter = signal<OrderFilter>('all');
  readonly statusOptions = STATUS_OPTIONS;

  readonly table = new TableState<AdminOrderSummaryDto>(() => this.list() ?? [], {
    searchText: (o) => `${o.id} ${o.customerEmail ?? ''} ${o.userId} ${orderStatusLabel(o.status)}`,
    filter: () => {
      const f = this.statusFilter();
      return f === 'all' ? null : (o) => o.status === f;
    },
    sorters: {
      id: (o) => o.id,
      customer: (o) => (o.customerEmail ?? o.userId).toLowerCase(),
      date: (o) => Date.parse(o.createdAt),
      items: (o) => o.itemCount,
      status: (o) => o.status,
      total: (o) => o.subtotal,
    },
  });

  readonly selectedId = signal<string | null>(null);
  readonly selected = signal<AdminOrderDetailDto | null>(null);
  readonly detailLoading = signal(false);
  readonly detailNotFound = signal(false);
  readonly detailError = signal<string | null>(null);
  readonly detailForbidden = signal(false);

  /** Status number being saved for the open order, or null. Blocks double clicks. */
  readonly updatingStatus = signal<number | null>(null);
  /** Status waiting for a second click (Cancel only), or null. */
  readonly confirmingStatus = signal<number | null>(null);
  readonly statusError = signal<string | null>(null);
  readonly statusNotice = signal<string | null>(null);

  constructor() {
    if (this.auth.isAdmin()) {
      this.loadOrders();
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
        this.loadOrders();
      }
    });
    // The address names an order (or no longer does): show it.
    effect(() => {
      const id = this.recordId();
      untracked(() => {
        if (!this.auth.isAdmin() || id === this.selectedId()) return;
        if (id) this.openRecord(id);
        else this.closeRecord();
      });
    });
  }

  statusLabel(status: number): string {
    return orderStatusLabel(status);
  }

  tone(status: number) {
    return orderTone(status);
  }

  setStatusFilter(value: string): void {
    this.statusFilter.set(value === 'all' ? 'all' : Number(value));
    this.table.resetPage();
  }

  clearFilters(): void {
    this.statusFilter.set('all');
    this.table.reset();
  }

  /** True when a search or a status filter is narrowing the list. */
  hasFilters(): boolean {
    return this.statusFilter() !== 'all' || this.table.query().trim() !== '';
  }

  /** Moves the server allows for the open order (empty when the order is final). */
  nextStatuses(order: AdminOrderDetailDto): number[] {
    return order.allowedNextStatuses ?? [];
  }

  /** Button text for a target status. */
  actionLabel(status: number): string {
    switch (status) {
      case 1: return 'Confirm order';
      case 2: return 'Start processing';
      case 3: return 'Mark completed';
      case 4: return 'Cancel order';
      default: return orderStatusLabel(status);
    }
  }

  /** Cancelling is the one move that asks for a second click. */
  needsConfirm(status: number): boolean {
    return status === 4;
  }

  /**
   * Starts a status change. Cancel first asks for confirmation; everything else
   * is sent straight away. Duplicate clicks while a change is in flight are ignored.
   */
  changeStatus(status: number): void {
    if (this.updatingStatus() !== null) return;
    if (this.needsConfirm(status) && this.confirmingStatus() !== status) {
      this.confirmingStatus.set(status);
      this.statusError.set(null);
      this.statusNotice.set(null);
      return;
    }
    this.sendStatus(status);
  }

  cancelConfirm(): void {
    this.confirmingStatus.set(null);
  }

  retryStatus(): void {
    const status = this.confirmingStatus();
    if (status !== null) this.changeStatus(status);
  }

  /** PATCH /api/admin/orders/{id}/status — Admin only. */
  private sendStatus(status: number): void {
    const id = this.selectedId();
    if (!this.auth.isAdmin() || id === null) return;
    this.updatingStatus.set(status);
    this.statusError.set(null);
    this.statusNotice.set(null);
    this.orders.updateAdminOrderStatus(id, status).subscribe({
      next: (order) => {
        this.updatingStatus.set(null);
        this.confirmingStatus.set(null);
        if (this.selectedId() !== id) return;
        this.selected.set(order);
        this.statusNotice.set(`Order is now ${orderStatusLabel(order.status)}.`);
        // Keep the list row in step without refetching everything.
        this.list.update((rows) =>
          rows === null ? rows : rows.map((r) => (r.id === order.id ? { ...r, status: order.status } : r))
        );
        this.reportAttention();
      },
      error: (err: unknown) => {
        this.updatingStatus.set(null);
        this.handleStatusError(err, id);
      },
    });
  }

  private handleStatusError(err: unknown, id: string): void {
    const status = (err as { status?: number })?.status;
    if (status === 401) {
      this.auth.logout();
      this.resetAll();
      this.listError.set('Your session has expired. Please log in again.');
      return;
    }
    if (status === 403) {
      this.statusError.set("You don't have access to change orders.");
      return;
    }
    if (status === 409) {
      // Someone else moved the order first: show the server's reason and reload the truth.
      this.statusError.set(this.describeError(err));
      this.confirmingStatus.set(null);
      this.viewDetailKeepingError(id);
      return;
    }
    this.statusError.set(this.describeError(err));
  }

  /** Reloads the open order after a conflict without clearing the error message. */
  private viewDetailKeepingError(id: string): void {
    this.orders.getAdminOrder(id).subscribe({
      next: (order) => {
        if (this.selectedId() === id) this.selected.set(order);
      },
      error: () => undefined,
    });
  }

  orderItemCount(order: AdminOrderDetailDto): number {
    return order.items.reduce((n, i) => n + i.quantity, 0);
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN');
  }

  /** Short recognizable identifier for list rows; the full id lives in detail. */
  shortId(id: string): string {
    return id.length > 8 ? id.slice(0, 8) : id;
  }

  /** GET /api/admin/orders — Admin only; no-op otherwise or while loading. */
  loadOrders(): void {
    if (!this.auth.isAdmin() || this.listLoading()) return;
    this.listLoading.set(true);
    this.listError.set(null);
    this.forbidden.set(false);
    this.orders.getAdminOrders().subscribe({
      next: (orders) => {
        this.list.set(orders ?? []);
        this.listLoading.set(false);
        this.reportAttention();
      },
      error: (err: unknown) => {
        this.listLoading.set(false);
        this.handleListError(err);
      },
    });
  }

  /** The sidebar badge follows the list this page shows. */
  private reportAttention(): void {
    const rows = this.list();
    if (rows !== null) this.attention.reportOrders(rows);
  }

  /** The Admin chose an order in the list: open it and let the shell put it in the address. */
  viewDetails(id: string): void {
    if (!this.auth.isAdmin()) return;
    this.openRecord(id);
    this.recordChange.emit(id);
  }

  /** GET /api/admin/orders/{id} — Admin only; clears the previous detail first. */
  private openRecord(id: string): void {
    this.clearStatusUi();
    this.selectedId.set(id);
    this.selected.set(null);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.detailForbidden.set(false);
    this.detailLoading.set(true);
    this.orders.getAdminOrder(id).subscribe({
      next: (order) => {
        if (this.selectedId() !== id) return;
        this.selected.set(order);
        this.detailLoading.set(false);
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
    this.clearStatusUi();
    this.selectedId.set(null);
    this.selected.set(null);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.detailForbidden.set(false);
    this.detailLoading.set(false);
  }

  retryDetail(): void {
    const id = this.selectedId();
    if (id) {
      this.openRecord(id);
    }
  }

  private clearStatusUi(): void {
    this.updatingStatus.set(null);
    this.confirmingStatus.set(null);
    this.statusError.set(null);
    this.statusNotice.set(null);
  }

  private resetAll(): void {
    this.clearStatusUi();
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
    this.statusFilter.set('all');
    this.table.reset();
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
    if (status === 404) return 'That order could not be found.';
    return 'Something went wrong. Please try again.';
  }
}
