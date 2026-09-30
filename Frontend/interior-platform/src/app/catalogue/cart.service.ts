import { Injectable, computed, inject, signal } from '@angular/core';
import type { CatalogueProduct } from './catalogue-products';
import { ProductService } from './product.service';

export interface CartLine {
  product: CatalogueProduct;
  qty: number;
  subtotal: number;
}

/**
 * Cart store: quantities by product id.
 *
 * Signal-based local state — no backend, no persistence. Product details
 * come from ProductService (single source of truth for product data); only
 * ids/quantities live here. Unknown ids are ignored in the derived lines so
 * the cart can never desync from the catalogue, and stored quantities survive
 * product-list changes (lines reappear once matching products arrive).
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly items = signal<Record<string, number>>({});
  private readonly productService = inject(ProductService);

  readonly lines = computed<CartLine[]>(() => {
    const bag = this.items();
    const products = this.productService.products();
    return Object.keys(bag)
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is CatalogueProduct => !!p)
      .map((product) => ({
        product,
        qty: bag[product.id] ?? 0,
        subtotal: product.price * (bag[product.id] ?? 0),
      }))
      .filter((l) => l.qty > 0);
  });

  readonly totalQty = computed(() => this.lines().reduce((sum, l) => sum + l.qty, 0));

  readonly subtotal = computed(() => this.lines().reduce((sum, l) => sum + l.subtotal, 0));

  qtyOf(id: string): number {
    return this.items()[id] ?? 0;
  }

  /** Adds qty (min 1). Same product increases quantity — never duplicates. */
  add(id: string, qty = 1): void {
    if (!this.productService.products().some((p) => p.id === id)) return;
    const q = Math.max(1, Math.floor(qty) || 1);
    this.items.update((bag) => ({ ...bag, [id]: (bag[id] ?? 0) + q }));
  }

  increment(id: string): void {
    this.add(id, 1);
  }

  /** Decreases quantity but never below 1 — use remove() to drop the line. */
  decrement(id: string): void {
    this.items.update((bag) => {
      const cur = bag[id] ?? 0;
      if (cur <= 0) return bag;
      return { ...bag, [id]: Math.max(1, cur - 1) };
    });
  }

  remove(id: string): void {
    this.items.update((bag) => {
      if (!(id in bag)) return bag;
      const next = { ...bag };
      delete next[id];
      return next;
    });
  }

  clear(): void {
    this.items.set({});
  }
}
