import { Component, computed, input } from '@angular/core';
import { ChartDatum, colorAt, plainNumber } from './chart-utils';

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Visible gap between segments, in circumference units. */
const GAP = 1.6;

/**
 * Donut chart with the total in the middle and a legend that prints every
 * share, so the segments never rely on colour alone. Segments are drawn as
 * stroked circle arcs; an empty chart shows a plain ring and "No data".
 */
@Component({
  selector: 'app-donut-chart',
  standalone: true,
  template: `
    <div class="adm-donut">
      <svg class="adm-chart adm-donut-svg" viewBox="0 0 120 120" role="img" [attr.aria-label]="summary()" focusable="false">
        <title>{{ summary() }}</title>
        <circle cx="60" cy="60" [attr.r]="radius" fill="none" stroke="#eef1f6" stroke-width="16" />
        @for (s of segments(); track s.label) {
          <circle
            cx="60" cy="60" [attr.r]="radius" fill="none" stroke-width="16"
            [attr.stroke]="s.color"
            [attr.stroke-dasharray]="s.dash"
            [attr.stroke-dashoffset]="s.offset"
            transform="rotate(-90 60 60)"
          >
            <title>{{ s.label }}: {{ s.text }} ({{ s.percent }})</title>
          </circle>
        }
        <text x="60" y="58" text-anchor="middle" font-size="19" font-weight="700" fill="currentColor" style="fill: var(--ink)">{{ totalText() }}</text>
        <text x="60" y="73" text-anchor="middle" font-size="9.5" style="fill: var(--muted)">{{ total() === 0 ? 'No data' : centerLabel() }}</text>
      </svg>
      <ul class="adm-legend">
        @for (s of legend(); track s.label) {
          <li>
            <span class="adm-legend-swatch" [style.background]="s.color"></span>
            <span class="adm-legend-label">{{ s.label }}</span>
            <span class="adm-legend-value">{{ s.text }}</span>
            <span class="adm-hint">{{ s.percent }}</span>
          </li>
        }
      </ul>
    </div>
  `,
})
export class DonutChartComponent {
  readonly data = input.required<readonly ChartDatum[]>();
  /** What the chart shows, e.g. "Orders by status". */
  readonly heading = input.required<string>();
  /** Small caption under the total ("orders"). */
  readonly centerLabel = input('total');
  readonly format = input<(n: number) => string>(plainNumber);

  readonly radius = RADIUS;

  readonly total = computed(() => this.data().reduce((n, d) => n + Math.max(0, d.value), 0));
  readonly totalText = computed(() => this.format()(this.total()));

  readonly legend = computed(() => {
    const total = this.total();
    const fmt = this.format();
    return this.data().map((d, i) => ({
      label: d.label,
      text: fmt(d.value),
      percent: total > 0 ? `${Math.round((d.value / total) * 100)}%` : '0%',
      color: colorAt(i, d),
    }));
  });

  readonly segments = computed(() => {
    const total = this.total();
    if (total <= 0) return [];
    const fmt = this.format();
    let consumed = 0;
    const out: { label: string; color: string; dash: string; offset: number; text: string; percent: string }[] = [];
    this.data().forEach((d, i) => {
      if (d.value <= 0) return;
      const length = (d.value / total) * CIRCUMFERENCE;
      // A lone segment is a full ring: no gap to cut.
      const shown = this.data().filter((x) => x.value > 0).length > 1 ? Math.max(0.5, length - GAP) : length;
      out.push({
        label: d.label,
        color: colorAt(i, d),
        dash: `${shown.toFixed(2)} ${(CIRCUMFERENCE - shown).toFixed(2)}`,
        offset: -consumed,
        text: fmt(d.value),
        percent: `${Math.round((d.value / total) * 100)}%`,
      });
      consumed += length;
    });
    return out;
  });

  readonly summary = computed(() => {
    const rows = this.legend();
    if (rows.length === 0) return `${this.heading()}: no data`;
    return `${this.heading()}. ${rows.map((r) => `${r.label} ${r.text} (${r.percent})`).join(', ')}.`;
  });
}
