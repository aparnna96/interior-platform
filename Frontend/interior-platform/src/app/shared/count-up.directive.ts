import { Directive, ElementRef, afterNextRender, effect, inject, input, OnDestroy } from '@angular/core';

/**
 * Counts a number up from 0 the first time the element scrolls into view.
 *
 * - The element's own text is the final value until the directive is ready, so content stays
 *   correct without JS and when the value arrives late.
 * - `prefers-reduced-motion` (or no IntersectionObserver) shows the final value at once.
 * - If the value changes after the count has run, it eases from the shown number to the new one.
 *
 * Usage: <strong [countUp]="total()"></strong>
 */
@Directive({
  selector: '[countUp]',
  standalone: true,
})
export class CountUpDirective implements OnDestroy {
  readonly target = input<number>(0, { alias: 'countUp' });

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private ready = false;
  private visible = false;
  private shown = 0;
  private frame: number | null = null;
  private observer: IntersectionObserver | null = null;
  private readonly duration = 1100;

  constructor() {
    effect(() => {
      const value = this.target();
      if (!this.ready) {
        this.el.nativeElement.textContent = this.format(value);
        return;
      }
      if (this.visible) this.animateTo(value);
    });

    afterNextRender(() => {
      const reduced =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced || typeof IntersectionObserver === 'undefined') {
        this.shown = this.target();
        this.visible = true;
        this.ready = true;
        this.el.nativeElement.textContent = this.format(this.shown);
        return;
      }
      this.ready = true;
      this.el.nativeElement.textContent = this.format(0);
      this.observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          this.visible = true;
          this.observer?.disconnect();
          this.observer = null;
          this.animateTo(this.target());
        },
        { threshold: 0.4 }
      );
      this.observer.observe(this.el.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
  }

  private animateTo(value: number): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    const from = this.shown;
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / this.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.shown = Math.round(from + (value - from) * eased);
      this.el.nativeElement.textContent = this.format(this.shown);
      this.frame = t < 1 ? requestAnimationFrame(step) : null;
    };
    this.frame = requestAnimationFrame(step);
  }

  private format(n: number): string {
    return String(Math.max(0, Math.round(n)));
  }
}
