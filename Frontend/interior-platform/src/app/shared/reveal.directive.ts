import { Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';

/**
 * Restrained scroll-reveal for public content: adds `.reveal` once the
 * element is rendered, then `.in` (once) when it enters the viewport.
 *
 * - No-JS / no-render-hook environments never get `.reveal`, so content
 *   stays fully visible and accessible.
 * - `prefers-reduced-motion` reveals instantly with no transition.
 * - Optional `[revealDelay]` staggers related elements (milliseconds).
 *
 * Usage: <section reveal>…</section>
 *        <article reveal [revealDelay]="i * 70">…</article>
 */
@Directive({
  selector: '[reveal]',
  standalone: true,
})
export class RevealDirective {
  /** Stagger delay in milliseconds. Keep small (0–400). */
  readonly delay = input<number>(0, { alias: 'revealDelay' });

  private readonly el = inject(ElementRef<HTMLElement>);

  constructor() {
    afterNextRender(() => {
      const node = this.el.nativeElement;
      node.classList.add('reveal');
      const delay = this.delay();
      if (delay > 0) {
        node.style.setProperty('--reveal-delay', `${delay}ms`);
      }
      if (
        typeof IntersectionObserver === 'undefined' ||
        (typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      ) {
        node.classList.add('in');
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('in');
              io.disconnect();
            }
          }
        },
        { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
      );
      io.observe(node);
    });
  }
}
