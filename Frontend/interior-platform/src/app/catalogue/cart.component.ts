import { Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartService } from './cart.service';
import { AuthService } from '../auth.service';
import {
  OrderService,
  orderStatusLabel,
  type CreateOrderRequest,
  type OrderDetailDto,
} from '../orders/order.service';

/** The eight delivery fields, in form order. */
type DeliveryField = keyof CreateOrderRequest;

/** What each field shows the customer when it is wrong. Same rules the server enforces. */
const DELIVERY_RULES: Record<DeliveryField, { label: string; required: boolean; min: number; max: number }> = {
  fullName: { label: 'Full name', required: true, min: 2, max: 100 },
  phone: { label: 'Phone', required: true, min: 0, max: 20 },
  addressLine1: { label: 'Address line 1', required: true, min: 1, max: 200 },
  addressLine2: { label: 'Address line 2', required: false, min: 0, max: 200 },
  city: { label: 'City', required: true, min: 1, max: 100 },
  state: { label: 'State', required: true, min: 1, max: 100 },
  pincode: { label: 'Pincode', required: true, min: 0, max: 20 },
  deliveryNotes: { label: 'Delivery notes', required: false, min: 0, max: 500 },
};

const DELIVERY_FIELDS = Object.keys(DELIVERY_RULES) as DeliveryField[];

const emptyDelivery = (): CreateOrderRequest => ({
  fullName: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  deliveryNotes: '',
});

/**
 * Checks one delivery field the way the server does (trim first). Returns the
 * message to show, or null when the value is acceptable. Exported for tests.
 */
export function deliveryFieldError(field: DeliveryField, raw: string): string | null {
  const rule = DELIVERY_RULES[field];
  const value = (raw ?? '').trim();
  if (value.length === 0) return rule.required ? `${rule.label} is required.` : null;
  if (field === 'phone') {
    let digits = value.replace(/[ -]/g, '');
    if (digits.startsWith('+91')) digits = digits.slice(3);
    return /^[0-9]{10}$/.test(digits) ? null : 'Phone must be a 10 digit mobile number.';
  }
  if (field === 'pincode') return /^[0-9]{6}$/.test(value) ? null : 'Pincode must be 6 digits.';
  if (value.length < rule.min || value.length > rule.max) {
    return rule.min > 1
      ? `${rule.label} must be ${rule.min} to ${rule.max} characters.`
      : `${rule.label} must be at most ${rule.max} characters.`;
  }
  return null;
}

/**
 * Cart view over the persistent Cart API, plus ordering.
 *
 * Reads shared CartService state (backend cart is the source of truth).
 * "Place Order" opens a delivery-details step on this same page; "Confirm order"
 * then converts the cart via POST /api/orders (delivery details only) and shows an
 * in-place confirmation; the backend empties the cart in the same
 * transaction, so success just resets local cart state — no per-item
 * DELETEs. Failures keep the cart visible with a retry.
 */
@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.css',
})
export class CartComponent {
  readonly cart = inject(CartService);
  private readonly auth = inject(AuthService);
  private readonly orders = inject(OrderService);

  /** Requests returning to the existing Furniture catalogue. */
  browse = output<void>();

  /** Asks the shell to open the login panel (logged-out visitor on the Cart page). */
  loginRequested = output<void>();

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

  // -- delivery details step (no new route: it replaces the cart grid in place) --

  readonly deliveryFields = DELIVERY_FIELDS;
  /** True while the delivery form is shown instead of the cart lines. */
  readonly checkingOut = signal(false);
  readonly delivery = signal<CreateOrderRequest>(emptyDelivery());
  /** Fields the customer has left (or tried to submit), so errors show only after interaction. */
  private readonly touched = signal<ReadonlySet<DeliveryField>>(new Set());

  /** Current message per field, or null. Recomputed whenever a value changes. */
  readonly deliveryErrors = computed(() => {
    const d = this.delivery();
    const out = {} as Record<DeliveryField, string | null>;
    for (const f of DELIVERY_FIELDS) out[f] = deliveryFieldError(f, d[f]);
    return out;
  });

  readonly deliveryValid = computed(() => DELIVERY_FIELDS.every((f) => this.deliveryErrors()[f] === null));

  /** Confirm is offered only for a valid form, an orderable cart and no request in flight. */
  readonly canConfirmOrder = computed(
    () => this.checkingOut() && this.deliveryValid() && this.canPlaceOrder()
  );

  /** The message to display under a field, once the customer has touched it. */
  showError(field: DeliveryField): string | null {
    return this.touched().has(field) ? this.deliveryErrors()[field] : null;
  }

  setDelivery(field: DeliveryField, value: string): void {
    this.delivery.update((d) => ({ ...d, [field]: value }));
  }

  touch(field: DeliveryField): void {
    this.touched.update((s) => new Set(s).add(field));
  }

  /** Cart -> Delivery details. Nothing is sent to the server yet. */
  startCheckout(): void {
    if (!this.canPlaceOrder()) return;
    this.orderError.set(null);
    this.checkingOut.set(true);
  }

  /** Back to the cart lines; what was typed is kept. */
  backToCart(): void {
    if (this.placingOrder()) return;
    this.orderError.set(null);
    this.checkingOut.set(false);
  }

  private resetCheckout(): void {
    this.checkingOut.set(false);
    this.delivery.set(emptyDelivery());
    this.touched.set(new Set());
  }

  goBrowse(): void {
    this.browse.emit();
  }

  requestLogin(): void {
    this.loginRequested.emit();
  }

  statusLabel(status: number): string {
    return orderStatusLabel(status);
  }

  orderItemCount(order: OrderDetailDto): number {
    return order.items.reduce((n, i) => n + i.quantity, 0);
  }

  /** "Place Order" on the cart: opens the delivery step. */
  placeOrder(): void {
    this.startCheckout();
  }

  /** "Confirm order": validates, then POSTs exactly the 8 delivery fields (trimmed). */
  confirmOrder(): void {
    if (this.placingOrder() || !this.canPlaceOrder()) return;
    this.touched.set(new Set(DELIVERY_FIELDS));
    if (!this.deliveryValid()) return;
    const d = this.delivery();
    const body: CreateOrderRequest = {
      fullName: d.fullName.trim(),
      phone: d.phone.trim(),
      addressLine1: d.addressLine1.trim(),
      addressLine2: d.addressLine2.trim(),
      city: d.city.trim(),
      state: d.state.trim(),
      pincode: d.pincode.trim(),
      deliveryNotes: d.deliveryNotes.trim(),
    };
    this.placingOrder.set(true);
    this.orderError.set(null);
    this.orders.createOrder(body).subscribe({
      next: (order) => {
        this.placingOrder.set(false);
        this.placedOrder.set(order);
        this.resetCheckout();
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
          this.resetCheckout();
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
