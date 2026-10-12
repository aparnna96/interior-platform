import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RevealDirective } from '../shared/reveal.directive';
import { LeadFormComponent } from '../leads/lead-form.component';
import type { CatalogueProduct } from './catalogue-products';

export interface AddToCartEvent {
  id: string;
  qty: number;
}

/** How many pieces the "Complete the look" row shows. */
const LOOK_LIMIT = 4;

/**
 * Picks pieces that go with `product` from the catalogue: other categories in the
 * same room first (a sofa goes with a table, not another sofa), then the same
 * room's remaining pieces, then the rest. The product itself is never listed.
 */
export function completeTheLook(product: CatalogueProduct, all: readonly CatalogueProduct[]): CatalogueProduct[] {
  const others = all.filter((p) => p.id !== product.id);
  const rank = (p: CatalogueProduct): number =>
    p.room === product.room ? (p.category !== product.category ? 0 : 1) : 2;
  // Array.prototype.sort is stable, so catalogue order is kept inside each rank.
  return [...others].sort((a, b) => rank(a) - rank(b)).slice(0, LOOK_LIMIT);
}

/**
 * Dedicated Furniture Product Details view (Pillar 2).
 *
 * Renders one CatalogueProduct from existing catalogue data. Quantity and
 * visualizer hint are local-only state — no backend, no shared visualizer
 * state. "Complete the look" is built from the other loaded catalogue
 * pieces, so it never shows anything that is not for sale.
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
  /** The whole loaded catalogue, used to suggest pieces for "Complete the look". */
  @Input() catalogue: readonly CatalogueProduct[] = [];
  /** How many of this product are already in the catalogue cart (display only). */
  @Input() cartQty = 0;

  @Output() back = new EventEmitter<void>();
  @Output() addToCart = new EventEmitter<AddToCartEvent>();
  /** Sends the product's category so the shell can place the matching piece in the Visualizer. */
  @Output() addToVisualizer = new EventEmitter<string>();
  /** A "Complete the look" piece was chosen; the id of the piece to open. */
  @Output() openProduct = new EventEmitter<string>();

  /** Local purchase quantity. Always >= 1. */
  quantity = signal(1);
  /** Whether the product enquiry form is shown. */
  showEnquiry = signal(false);
  /** Hover zoom (mouse only). Touch screens use the browser's own pinch zoom. */
  zoomed = signal(false);
  zoomOrigin = signal('50% 50%');

  onMediaEnter(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    this.zoomed.set(true);
    this.onMediaMove(e);
  }

  /** Keeps the zoom centred under the pointer. */
  onMediaMove(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const x = Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100));
    this.zoomOrigin.set(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
  }

  onMediaLeave(): void {
    this.zoomed.set(false);
    this.zoomOrigin.set('50% 50%');
  }
  /** Confirmation shown after sending the piece to the Visualizer. */
  visualizerNote = signal<string | null>(null);
  /** Pieces that go with this one. */
  look = signal<CatalogueProduct[]>([]);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product']) {
      this.quantity.set(1);
      this.visualizerNote.set(null);
      this.showEnquiry.set(false);
      // Opening another piece from the row below keeps the page where it was; start at the top.
      if (!changes['product'].firstChange) window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (changes['product'] || changes['catalogue']) {
      this.look.set(completeTheLook(this.product, this.catalogue));
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
