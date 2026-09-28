import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CartService } from './cart.service';

/**
 * Frontend-only Cart view (Pillar 2).
 *
 * Reads shared CartService state — the same store the catalogue and
 * product-details views write to. Checkout is UI-only for now.
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

  /** Requests returning to the existing Furniture catalogue. */
  browse = output<void>();

  goBrowse(): void {
    this.browse.emit();
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN');
  }
}
