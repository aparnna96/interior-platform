import { Component, OnInit, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RevealDirective } from '../shared/reveal.directive';
import {
  ROOMS,
  filterProducts,
  type CatalogueProduct,
  type RoomFilter,
} from './catalogue-products';
import { CartService } from './cart.service';
import { ProductService } from './product.service';
import { ProductDetailsComponent, type AddToCartEvent } from './product-details.component';

@Component({
  selector: 'app-catalogue',
  standalone: true,
  imports: [CommonModule, ProductDetailsComponent, RevealDirective],
  templateUrl: './catalogue.component.html',
  styleUrl: './catalogue.component.css',
})
export class CatalogueComponent implements OnInit {
  rooms = ROOMS;

  private readonly cart = inject(CartService);
  readonly productService = inject(ProductService);

  /**
   * Product id from a /furniture/:id address. The shell owns the address bar;
   * when it changes (deep link, Back/Forward) the details page follows.
   */
  productId = input<string | null>(null);

  /** Tells the shell a details page was opened (id) or closed (null) so the address follows. */
  productRoute = output<string | null>();

  private lastRouteId: string | null = null;

  constructor() {
    effect(() => {
      const id = this.productId();
      untracked(() => {
        if (id !== this.lastRouteId) {
          this.lastRouteId = id;
          this.selectedId.set(id);
        }
      });
    });
  }

  /** Asks the shell to place a piece of this category in the Visualizer and open it. */
  visualizerRequested = output<string>();

  /** Requests the shell to open the Cart view. */
  openCart = output<void>();

  /** Asks the shell to open the login panel (logged-out visitor tried to use the cart). */
  loginRequested = output<void>();

  search = signal('');
  room = signal<RoomFilter>('All');
  /** Dedicated details view selection. Null = listing; set = details replaces listing. */
  selectedId = signal<string | null>(null);

  ngOnInit(): void {
    this.productService.load();
  }

  filtered = computed(() =>
    filterProducts(this.productService.products(), this.search(), this.room())
  );

  cartCount = computed(() => this.cart.totalQty());

  /** Login hint set when a logged-out visitor tries a cart action. */
  cartNotice = computed(() => this.cart.notice());

  selected = computed<CatalogueProduct | null>(
    () =>
      this.productService.products().find((p) => p.id === this.selectedId()) ??
      null
  );

  setSearch(raw: string): void {
    this.search.set(raw);
  }

  setRoom(r: RoomFilter): void {
    this.room.set(r);
  }

  /** Number of loaded pieces in a room (used for the room navigation counts). */
  countFor(r: RoomFilter): number {
    const products = this.productService.products();
    return r === 'All' ? products.length : products.filter((p) => p.room === r).length;
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

  requestVisualizer(category: string): void {
    this.visualizerRequested.emit(category);
  }

  goToCart(): void {
    this.openCart.emit();
  }

  requestLogin(): void {
    this.dismissNotice();
    this.loginRequested.emit();
  }

  dismissNotice(): void {
    this.cart.notice.set(null);
  }

  viewDetails(id: string): void {
    this.selectedId.set(id);
    this.productRoute.emit(id);
  }

  closeDetails(): void {
    this.selectedId.set(null);
    this.productRoute.emit(null);
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN');
  }
}
