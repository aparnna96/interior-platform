import { Component, OnDestroy, OnInit, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RevealDirective } from '../shared/reveal.directive';
import type { CatalogueProduct } from '../catalogue/catalogue-products';
import { ProductService } from '../catalogue/product.service';
import {
  HERO,
  SPACES,
  SHOWCASE,
  DESIGN_IMAGE,
  DESIGN_STEPS,
  JOURNEY,
  FEATURED_PRODUCT_IDS,
  type HomeDestination,
} from './home-data';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RevealDirective],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit, OnDestroy {
  /** Requests the shell to switch to an existing view. No routing. */
  navigate = output<HomeDestination>();

  hero = HERO;
  slides = HERO.slides;
  /** Local carousel state — text and CTAs stay fixed while this changes. */
  slideIndex = signal(0);
  private autoplay: ReturnType<typeof setInterval> | null = null;
  /** Autoplay is held only while a hero control has keyboard focus (never for a mouse or touch). */
  private focusPaused = false;
  private swipeStart: { x: number; y: number } | null = null;
  /** Smallest horizontal travel (px) that counts as a swipe. */
  private static readonly SWIPE_MIN_PX = 40;
  private static readonly SLIDE_MS = 5000;
  spaces = SPACES;
  showcase = SHOWCASE;
  designImage = DESIGN_IMAGE;
  designSteps = DESIGN_STEPS;
  journey = JOURNEY;

  private readonly productService = inject(ProductService);

  /** Featured pieces resolved from ProductService in curated FEATURED_PRODUCT_IDS order. */
  readonly featured = computed<CatalogueProduct[]>(() => {
    const products = this.productService.products();
    return FEATURED_PRODUCT_IDS.map((id) =>
      products.find((p) => p.id === id)
    ).filter((p): p is CatalogueProduct => !!p);
  });

  go(d: HomeDestination): void {
    this.navigate.emit(d);
  }

  ngOnInit(): void {
    // Reuse the shared load: skipped when products are already present,
    // deduplicated while a request is in flight by ProductService.load().
    if (this.productService.products().length === 0) {
      this.productService.load();
    }
    if (this.prefersReducedMotion()) return;
    this.startAutoplay();
  }

  ngOnDestroy(): void {
    this.stopAutoplay();
  }

  goToSlide(i: number): void {
    const n = this.slides.length;
    this.slideIndex.set(((i % n) + n) % n);
    this.restartAutoplay();
  }

  prevSlide(): void {
    this.goToSlide(this.slideIndex() - 1);
  }

  nextSlide(): void {
    this.goToSlide(this.slideIndex() + 1);
  }

  /** Left / Right arrow keys move between slides (focus is on a hero control). */
  onHeroKey(ev: KeyboardEvent): void {
    if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      this.prevSlide();
    } else if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      this.nextSlide();
    }
  }

  /** Touch / pen swipe. A mouse uses the arrows and dots instead, so text selection is untouched. */
  onHeroPointerDown(ev: PointerEvent): void {
    this.swipeStart = ev.pointerType === 'mouse' || !ev.isPrimary ? null : { x: ev.clientX, y: ev.clientY };
  }

  onHeroPointerUp(ev: PointerEvent): void {
    const start = this.swipeStart;
    this.swipeStart = null;
    if (!start || ev.pointerType === 'mouse') return;
    const dx = ev.clientX - start.x;
    const dy = ev.clientY - start.y;
    // Mostly horizontal and long enough; a vertical scroll or a tap does nothing.
    if (Math.abs(dx) < HomeComponent.SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) this.nextSlide();
    else this.prevSlide();
  }

  onHeroPointerCancel(): void {
    this.swipeStart = null;
  }

  onHeroFocusIn(ev: FocusEvent): void {
    const target = ev.target as HTMLElement | null;
    // Only keyboard focus pauses; tapping a control on a phone must not stop the slideshow for good.
    if (!target || typeof target.matches !== 'function' || !target.matches(':focus-visible')) return;
    this.focusPaused = true;
    this.stopAutoplay();
  }

  onHeroFocusOut(): void {
    this.focusPaused = false;
    this.restartAutoplay();
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private startAutoplay(): void {
    this.stopAutoplay();
    this.autoplay = setInterval(() => {
      this.slideIndex.update((i) => (i + 1) % this.slides.length);
    }, HomeComponent.SLIDE_MS);
  }

  private stopAutoplay(): void {
    if (this.autoplay !== null) {
      clearInterval(this.autoplay);
      this.autoplay = null;
    }
  }

  private restartAutoplay(): void {
    if (this.focusPaused || this.prefersReducedMotion()) return;
    this.startAutoplay();
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN');
  }
}
