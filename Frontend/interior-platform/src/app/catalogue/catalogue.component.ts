import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ROOMS,
  PRODUCTS,
  FEATURED_COLLECTION,
  filterProducts,
  type CatalogueProduct,
  type RoomFilter,
} from './catalogue-products';
import { ProductDetailsComponent, type AddToCartEvent } from './product-details.component';

@Component({
  selector: 'app-catalogue',
  standalone: true,
  imports: [CommonModule, ProductDetailsComponent],
  templateUrl: './catalogue.component.html',
  styleUrl: './catalogue.component.css',
})
export class CatalogueComponent {
  rooms = ROOMS;
  featured = FEATURED_COLLECTION;

  search = signal('');
  room = signal<RoomFilter>('All');
  quantities = signal<Record<string, number>>({});
  /** Dedicated details view selection. Null = listing; set = details replaces listing. */
  selectedId = signal<string | null>(null);

  filtered = computed(() => filterProducts(PRODUCTS, this.search(), this.room()));

  cartCount = computed(() =>
    Object.values(this.quantities()).reduce((sum, q) => sum + q, 0)
  );

  selected = computed<CatalogueProduct | null>(
    () => PRODUCTS.find((p) => p.id === this.selectedId()) ?? null
  );

  setSearch(raw: string): void {
    this.search.set(raw);
  }

  setRoom(r: RoomFilter): void {
    this.room.set(r);
  }

  /** Number of demo pieces in a room (used for the room navigation counts). */
  countFor(r: RoomFilter): number {
    return r === 'All' ? PRODUCTS.length : PRODUCTS.filter((p) => p.room === r).length;
  }

  qtyOf(id: string): number {
    return this.quantities()[id] ?? 0;
  }

  addToCart(id: string): void {
    this.quantities.update((q) => ({ ...q, [id]: (q[id] ?? 0) + 1 }));
  }

  /** Details-view add: honours the selected quantity (min 1). */
  addToCartQty(event: AddToCartEvent): void {
    const qty = Math.max(1, Math.floor(event.qty) || 1);
    this.quantities.update((q) => ({ ...q, [event.id]: (q[event.id] ?? 0) + qty }));
  }

  viewDetails(id: string): void {
    this.selectedId.set(id);
  }

  closeDetails(): void {
    this.selectedId.set(null);
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN');
  }
}
