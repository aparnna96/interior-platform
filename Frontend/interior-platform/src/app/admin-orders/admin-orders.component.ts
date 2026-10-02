import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import {
  OrderService,
  orderStatusLabel,
  type AdminOrderDetailDto,
  type AdminOrderSummaryDto,
} from '../orders/order.service';

/**
 * Internal Admin-only order operations over GET /api/admin/orders(+/{id}).
 * Visible only to Admin sessions; the backend remains the authorization
 * boundary, so anyone else issues no requests and sees an access-denied /
 * login state instead. Status is read-only: no status-mutation API exists.
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
  imports: [CommonModule],
  templateUrl: './admin-orders.component.html',
  styleUrl: './admin-orders.component.css',
})
export class AdminOrdersComponent {
  private readonly auth = inject(AuthService);
  private readonly orders = inject(OrderService);

  /** Admin-only gate; anyone else never loads admin data. */
  readonly canAccess = computed(() => this.auth.isAdmin());
  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());

  readonly list = signal<AdminOrderSummaryDto[] | null>(null);
  readonly listLoading = signal(false);
  readonly listError = signal<string | null>(null);
  readonly forbidden = signal(false);

  readonly selectedId = signal<string | null>(null);
  readonly selected = signal<AdminOrderDetailDto | null>(null);
  readonly detailLoading = signal(false);
  readonly detailNotFound = signal(false);
  readonly detailError = signal<string | null>(null);
  readonly detailForbidden = signal(false);

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
  }

  statusLabel(status: number): string {
    return orderStatusLabel(status);
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
      },
      error: (err: unknown) => {
        this.listLoading.set(false);
        this.handleListError(err);
      },
    });
  }

  /** GET /api/admin/orders/{id} — Admin only; clears the previous detail first. */
  viewDetails(id: string): void {
    if (!this.auth.isAdmin()) return;
    this.selectedId.set(id);
    this.selected.set(null);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.detailForbidden.set(false);
    this.detailLoading.set(true);
    this.orders.getAdminOrder(id).subscribe({
      next: (order) => {
        this.selected.set(order);
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
  }

  retryDetail(): void {
    const id = this.selectedId();
    if (id) {
      this.viewDetails(id);
    }
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
