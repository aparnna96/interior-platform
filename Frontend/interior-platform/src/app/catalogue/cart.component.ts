import { Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CartService } from './cart.service';
import { AuthService } from '../auth.service';
import { OrderService, orderStatusLabel, type OrderDetailDto } from '../orders/order.service';

/**
 * Cart view over the persistent Cart API, plus ordering.
 *
 * Reads shared CartService state (backend cart is the source of truth).
 * "Place Order" converts the cart via POST /api/orders and shows an
 * in-place confirmation; the backend empties the cart in the same
 * transaction, so success just resets local cart state — no per-item
 * DELETEs. Failures keep the cart visible with a retry.
 */
@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.css',
})
export class CartComponent {
  readonly cart = inject(CartService);
  private readonly auth = inject(AuthService);
  private readonly orders = inject(OrderService);

  /** Requests returning to the existing Furniture catalogue. */
  browse = output<void>();

  /** True while POST /api/orders is in flight — blocks duplicate submits. */
  readonly placingOrder = signal(false);
  /** Last order failure message, or null. */
  readonly orderError = signal<string | null>(null);
  /** Created order shown in the confirmation state, or null. */
  readonly placedOrder = signal<OrderDetailDto | null>(null);

  /** Place Order is offered only for a non-empty, fully available cart. */
  readonly canPlaceOrder = computed(
    () =>
      this.cart.isAuthenticated() &&
      !this.placingOrder() &&
      !this.cart.loading() &&
      this.cart.lines().length > 0 &&
      this.cart.lines().every((l) => l.isAvailable)
  );

  readonly hasUnavailable = computed(() => this.cart.lines().some((l) => !l.isAvailable));

  goBrowse(): void {
    this.browse.emit();
  }

  statusLabel(status: number): string {
    return orderStatusLabel(status);
  }

  orderItemCount(order: OrderDetailDto): number {
    return order.items.reduce((n, i) => n + i.quantity, 0);
  }

  placeOrder(): void {
    if (this.placingOrder() || !this.canPlaceOrder()) return;
    this.placingOrder.set(true);
    this.orderError.set(null);
    this.orders.createOrder().subscribe({
      next: (order) => {
        this.placingOrder.set(false);
        this.placedOrder.set(order);
        // The backend cleared the cart in the same transaction: mirror that
        // locally. No per-item DELETEs, no extra GET needed.
        this.cart.clear();
      },
      error: (err: unknown) => {
        this.placingOrder.set(false);
        const status = (err as { status?: number })?.status;
        if (status === 401) {
          // Consistent with cart 401s: the session is over.
          this.auth.logout();
          this.cart.clear();
          this.orderError.set('Your session has expired. Please log in again.');
          return;
        }
        this.orderError.set(this.describeOrderError(err, status));
      },
    });
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN');
  }

  private describeOrderError(err: unknown, status?: number): string {
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
    if (status === 400) return 'Your cart cannot be ordered as it stands.';
    return 'Something went wrong. Please try again.';
  }
}
