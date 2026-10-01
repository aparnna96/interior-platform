import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth.service';

/** One backend cart line (GET /api/cart `items[]` entry). */
export interface CartLine {
  id: string;
  productId: string;
  slug: string;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
  imageUrl: string;
  isAvailable: boolean;
}

/** Backend cart shape (GET /api/cart response). */
export interface CartDto {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
}

const CART_URL = `${environment.apiBaseUrl}/api/cart`;
const CART_ITEMS_URL = `${CART_URL}/items`;
const MAX_QTY = 99;

/**
 * Cart store backed by the persistent Cart API.
 *
 * The backend response is the source of truth: totals, prices and counts are
 * never computed authoritatively here. Calls carry `Authorization: Bearer`
 * from AuthService; unauthenticated callers never reach the API — mutations
 * set a login notice instead. On 401 the stored token is dropped (it is no
 * longer valid) and local cart state is cleared.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly linesState = signal<CartLine[]>([]);
  private readonly itemCountState = signal(0);
  private readonly subtotalState = signal(0);

  /** Backend cart lines for the authenticated user (empty when logged out). */
  readonly lines = this.linesState.asReadonly();
  /** Backend `itemCount` — drives the cart badge. */
  readonly totalQty = this.itemCountState.asReadonly();
  /** Backend `subtotal` — the authoritative cart total. */
  readonly subtotal = this.subtotalState.asReadonly();

  readonly loading = signal(false);
  /** Last API failure message, or null. */
  readonly error = signal<string | null>(null);
  /** Login hint for gated actions (e.g. add while logged out), or null. */
  readonly notice = signal<string | null>(null);

  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());

  constructor() {
    // A persisted token means a previous session: pick up that user's cart.
    // No token → stay empty and issue no requests.
    if (this.auth.isAuthenticated()) {
      this.load();
    }
  }

  /** Quantity of one product in the current cart (0 when absent). */
  qtyOf(productId: string): number {
    return this.linesState().find((l) => l.productId === productId)?.quantity ?? 0;
  }

  /** GET /api/cart — no-op while logged out or while a load is in flight. */
  load(): void {
    if (!this.auth.isAuthenticated() || this.loading()) return;
    this.loading.set(true);
    this.http.get<CartDto>(CART_URL, { headers: this.authHeaders() }).subscribe({
      next: (cart) => {
        this.applyCart(cart);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.handleError(err);
      },
    });
  }

  /**
   * POST /api/cart/items — sends only productId + quantity. The backend
   * merges duplicates and enforces limits; local state is replaced with the
   * returned cart. Logged-out callers get a login notice, never an API call.
   */
  add(productId: string, qty = 1): void {
    if (!this.requireAuth()) return;
    const quantity = Math.min(MAX_QTY, Math.max(1, Math.floor(qty) || 1));
    this.http
      .post<CartDto>(CART_ITEMS_URL, { productId, quantity }, { headers: this.authHeaders() })
      .subscribe({
        next: (cart) => this.applyCart(cart),
        error: (err) => this.handleError(err),
      });
  }

  /** PUT …/items/{itemId} with quantity + 1 (no-op past the 99 cap). */
  increment(itemId: string): void {
    const line = this.linesState().find((l) => l.id === itemId);
    if (!line || !this.requireAuth()) return;
    if (line.quantity >= MAX_QTY) return;
    this.setQuantity(itemId, line.quantity + 1);
  }

  /** PUT …/items/{itemId} with quantity − 1 (min 1 — remove drops the line). */
  decrement(itemId: string): void {
    const line = this.linesState().find((l) => l.id === itemId);
    if (!line || !this.requireAuth()) return;
    if (line.quantity <= 1) return;
    this.setQuantity(itemId, line.quantity - 1);
  }

  /** PUT /api/cart/items/{itemId} — backend remains authoritative. */
  setQuantity(itemId: string, quantity: number): void {
    if (!this.requireAuth()) return;
    if (!Number.isFinite(quantity)) return;
    this.http
      .put<CartDto>(`${CART_ITEMS_URL}/${itemId}`, { quantity }, { headers: this.authHeaders() })
      .subscribe({
        next: (cart) => this.applyCart(cart),
        error: (err) => this.handleError(err),
      });
  }

  /** DELETE /api/cart/items/{itemId} — then reloads the cart (204 has no body). */
  remove(itemId: string): void {
    if (!this.requireAuth()) return;
    this.http
      .delete<void>(`${CART_ITEMS_URL}/${itemId}`, { headers: this.authHeaders() })
      .subscribe({
        next: () => this.reload(),
        error: (err) => this.handleError(err),
      });
  }

  /** Resets local state: logout transitions and tests. Issues no requests. */
  clear(): void {
    this.linesState.set([]);
    this.itemCountState.set(0);
    this.subtotalState.set(0);
    this.loading.set(false);
    this.error.set(null);
    this.notice.set(null);
  }

  private reload(): void {
    this.loading.set(true);
    this.http.get<CartDto>(CART_URL, { headers: this.authHeaders() }).subscribe({
      next: (cart) => {
        this.applyCart(cart);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.handleError(err);
      },
    });
  }

  private applyCart(cart: CartDto): void {
    this.linesState.set(cart?.items ?? []);
    this.itemCountState.set(cart?.itemCount ?? 0);
    this.subtotalState.set(cart?.subtotal ?? 0);
    this.error.set(null);
    this.notice.set(null);
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.token();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  /** False + login notice when logged out (callers must then do nothing). */
  private requireAuth(): boolean {
    if (this.auth.isAuthenticated()) return true;
    this.notice.set('Please log in to use your saved cart.');
    return false;
  }

  private handleError(err: unknown): void {
    const status = (err as { status?: number })?.status;
    if (status === 401) {
      // The token is no longer valid: drop it so one user's cart can never
      // linger into another session, and ask for a fresh login.
      this.auth.logout();
      this.clear();
      this.error.set('Your session has expired. Please log in again.');
      return;
    }
    this.error.set(this.describeError(err, status));
  }

  private describeError(err: unknown, status?: number): string {
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
    if (status === 400) return 'That change is not valid (quantity must be 1–99).';
    if (status === 404) return 'That item is no longer available.';
    return 'Something went wrong. Please try again.';
  }
}
