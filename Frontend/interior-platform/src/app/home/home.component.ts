import { Component, OnDestroy, OnInit, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RevealDirective } from '../shared/reveal.directive';
import {
  PRODUCTS,
  type CatalogueProduct,
} from '../catalogue/catalogue-products';
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
  private static readonly SLIDE_MS = 5000;
  spaces = SPACES;
  showcase = SHOWCASE;
  designImage = DESIGN_IMAGE;
  designSteps = DESIGN_STEPS;
  journey = JOURNEY;

  /** Featured pieces resolved live from catalogue data — never duplicated. */
  featured: CatalogueProduct[] = FEATURED_PRODUCT_IDS.map((id) =>
    PRODUCTS.find((p) => p.id === id)
  ).filter((p): p is CatalogueProduct => !!p);

  go(d: HomeDestination): void {
    this.navigate.emit(d);
  }

  ngOnInit(): void {
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
    if (this.prefersReducedMotion()) return;
    this.startAutoplay();
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN');
  }
}
