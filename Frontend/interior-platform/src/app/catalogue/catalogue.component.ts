import { Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RevealDirective } from '../shared/reveal.directive';
import {
  ROOMS,
  PRODUCTS,
  FEATURED_COLLECTION,
  filterProducts,
  type CatalogueProduct,
  type RoomFilter,
} from './catalogue-products';
import { CartService } from './cart.service';
import { ProductDetailsComponent, type AddToCartEvent } from './product-details.component';

@Component({
  selector: 'app-catalogue',
  standalone: true,
  imports: [CommonModule, ProductDetailsComponent, RevealDirective],
  templateUrl: './catalogue.component.html',
  styleUrl: './catalogue.component.css',
})
export class CatalogueComponent {
  rooms = ROOMS;
  featured = FEATURED_COLLECTION;

  private readonly cart = inject(CartService);

  /** Requests the shell to open the Cart view. No routing. */
  openCart = output<void>();

  search = signal('');
  room = signal<RoomFilter>('All');
  /** Dedicated details view selection. Null = listing; set = details replaces listing. */
  selectedId = signal<string | null>(null);

  filtered = computed(() => filterProducts(PRODUCTS, this.search(), this.room()));

  cartCount = computed(() => this.cart.totalQty());

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
    return this.cart.qtyOf(id);
  }

  addToCart(id: string): void {
    this.cart.add(id, 1);
  }

  /** Details-view add: honours the selected quantity (min 1). */
  addToCartQty(event: AddToCartEvent): void {
    this.cart.add(event.id, event.qty);
  }

  goToCart(): void {
    this.openCart.emit();
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
