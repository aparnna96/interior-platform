import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import {
  OrderService,
  orderStatusLabel,
  type OrderDetailDto,
  type OrderSummaryDto,
} from './order.service';

/**
 * Customer order history over GET /api/orders + GET /api/orders/{id}.
 *
 * List state and detail state are separate: selecting an order clears the
 * previous detail first so stale data is never shown while the next order
 * loads. History renders from the order snapshots only — the Product API
 * is never consulted. Unauthenticated visitors issue no requests; a 401
 * drops the session (existing logout behavior) and resets this view.
 */
@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css',
})
export class OrdersComponent {
  private readonly auth = inject(AuthService);
  private readonly orders = inject(OrderService);

  /** Requests returning to the existing Furniture catalogue. */
  browse = output<void>();

  readonly list = signal<OrderSummaryDto[] | null>(null);
  readonly listLoading = signal(false);
  readonly listError = signal<string | null>(null);

  readonly selectedId = signal<string | null>(null);
  readonly selected = signal<OrderDetailDto | null>(null);
  readonly detailLoading = signal(false);
  readonly detailNotFound = signal(false);
  readonly detailError = signal<string | null>(null);

  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());

  constructor() {
    if (this.auth.isAuthenticated()) {
      this.loadOrders();
    }
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        // Never show one user's orders to another session.
        this.resetAll();
      } else if (this.list() === null && !this.listLoading() && !this.listError()) {
        this.loadOrders();
      }
    });
  }

  goBrowse(): void {
    this.browse.emit();
  }

  statusLabel(status: number): string {
    return orderStatusLabel(status);
  }

  orderItemCount(order: OrderDetailDto): number {
    return order.items.reduce((n, i) => n + i.quantity, 0);
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN');
  }

  /** GET /api/orders — no-op while logged out or while a load is in flight. */
  loadOrders(): void {
    if (!this.auth.isAuthenticated() || this.listLoading()) return;
    this.listLoading.set(true);
    this.listError.set(null);
    this.orders.getOrders().subscribe({
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

  /** GET /api/orders/{id} — clears the previous detail before requesting. */
  viewDetails(id: string): void {
    if (!this.auth.isAuthenticated()) return;
    this.selectedId.set(id);
    this.selected.set(null);
    this.detailNotFound.set(false);
    this.detailError.set(null);
    this.detailLoading.set(true);
    this.orders.getOrder(id).subscribe({
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

  backToOrders(): void {
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

  private resetAll(): void {
    this.list.set(null);
    this.listLoading.set(false);
    this.listError.set(null);
    this.selectedId.set(null);
    this.selected.set(null);
    this.detailLoading.set(false);
    this.detailNotFound.set(false);
    this.detailError.set(null);
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
