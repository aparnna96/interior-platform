import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RevealDirective } from '../shared/reveal.directive';
import { LeadFormComponent } from '../leads/lead-form.component';
import type { CatalogueProduct } from './catalogue-products';

export interface AddToCartEvent {
  id: string;
  qty: number;
}

/**
 * Dedicated Furniture Product Details view (Pillar 2).
 *
 * Pure presentational component: renders one CatalogueProduct from
 * existing catalogue data. Quantity and visualizer hint are local-only
 * prototype state — no backend, no shared visualizer state.
 */
@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [CommonModule, LeadFormComponent, RevealDirective],
  templateUrl: './product-details.component.html',
  styleUrl: './product-details.component.css',
})
export class ProductDetailsComponent implements OnChanges {
  @Input({ required: true }) product!: CatalogueProduct;
  /** How many of this product are already in the catalogue cart (display only). */
  @Input() cartQty = 0;

  @Output() back = new EventEmitter<void>();
  @Output() addToCart = new EventEmitter<AddToCartEvent>();
  /** Sends the product's category so the shell can place the matching piece in the Visualizer. */
  @Output() addToVisualizer = new EventEmitter<string>();

  /** Local purchase quantity. Always >= 1. */
  quantity = signal(1);
  /** Whether the product enquiry form is shown. */
  showEnquiry = signal(false);
  /** Confirmation shown after sending the piece to the Visualizer. */
  visualizerNote = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product']) {
      this.quantity.set(1);
      this.visualizerNote.set(null);
      this.showEnquiry.set(false);
    }
  }

  increment(): void {
    this.quantity.update((q) => q + 1);
  }

  decrement(): void {
    this.quantity.update((q) => Math.max(1, q - 1));
  }

  /** Direct input edits stay >= 1; empty / non-numeric keystrokes are ignored. */
  onQtyInput(raw: string): void {
    if (raw == null || String(raw).trim() === '') return;
    const v = Math.floor(Number(raw));
    if (!Number.isFinite(v)) return;
    this.quantity.set(Math.max(1, v));
  }

  handleAddToCart(): void {
    this.addToCart.emit({ id: this.product.id, qty: this.quantity() });
  }

  /** Places the matching piece in the room plan: the shell adds it and opens the Visualizer. */
  handleAddToVisualizer(): void {
    this.visualizerNote.set('Added to the Visualizer.');
    this.addToVisualizer.emit(this.product.category);
  }

  toggleEnquiry(): void {
    this.showEnquiry.update((v) => !v);
  }

  goBack(): void {
    this.back.emit();
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN');
  }
}
