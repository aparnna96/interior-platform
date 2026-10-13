import { Component, OnInit, computed, effect, inject, output, untracked } from '@angular/core';
import { CartService } from './cart.service';
import { ProductService } from './product.service';
import { WishlistService } from './wishlist.service';

/**
 * Saved pieces: the products the visitor hearted, kept in this browser
 * (see WishlistService). Works logged out. Adding to the cart still needs a
 * login, exactly as on the Furniture page.
 */
@Component({
  selector: 'app-wishlist',
  standalone: true,
  imports: [],
  templateUrl: './wishlist.component.html',
  styleUrl: './wishlist.component.css',
})
export class WishlistComponent implements OnInit {
  readonly wishlist = inject(WishlistService);
  readonly productService = inject(ProductService);
  private readonly cart = inject(CartService);

  /** Back to the Furniture catalogue. */
  browse = output<void>();
  /** A saved piece was chosen; the id of the piece to open. */
  openProduct = output<string>();
  /** Asks the shell to open the login panel (logged-out visitor tried to add to the cart). */
  loginRequested = output<void>();

  /** Placeholder tiles shown while the catalogue is loading. */
  readonly skeletons = [1, 2, 3];

  /** Saved pieces that are still for sale, newest save first. */
  readonly saved = computed(() => {
    const byId = new Map(this.productService.products().map((p) => [p.id, p]));
    return this.wishlist.ids().flatMap((id) => byId.get(id) ?? []);
  });

  /** Login hint set when a logged-out visitor tries to add to the cart. */
  readonly cartNotice = computed(() => this.cart.notice());

  constructor() {
    // Once the catalogue is known, forget saved pieces the shop no longer sells.
    effect(() => {
      const products = this.productService.products();
      if (products.length === 0 || this.productService.loading()) return;
      untracked(() => this.wishlist.retain(new Set(products.map((p) => p.id))));
    });
  }

  ngOnInit(): void {
    this.productService.load();
  }

  qtyOf(id: string): number {
    return this.cart.qtyOf(id);
  }

  addToCart(id: string): void {
    this.cart.add(id, 1);
  }

  requestLogin(): void {
    this.cart.notice.set(null);
    this.loginRequested.emit();
  }

  dismissNotice(): void {
    this.cart.notice.set(null);
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN');
  }
}
