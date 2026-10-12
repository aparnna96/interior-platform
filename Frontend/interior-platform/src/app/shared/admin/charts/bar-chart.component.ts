import { Component, computed, input } from '@angular/core';
import { ChartDatum, colorAt, plainNumber } from './chart-utils';

const WIDTH = 360;
const ROW = 34;
const LABEL_W = 112;
const VALUE_W = 54;
const BAR_H = 14;

/**
 * Horizontal bar chart for comparing a few categories (lead pipeline,
 * payment states). Bars are scaled to the largest value; every bar prints
 * its value, so the chart still reads without colour. A zero value shows no
 * bar, only the "0".
 */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  template: `
    <svg class="adm-chart" [attr.viewBox]="'0 0 ' + width + ' ' + height()" role="img" [attr.aria-label]="summary()" focusable="false">
      <title>{{ summary() }}</title>
      @for (r of rows(); track r.label) {
        <text [attr.x]="0" [attr.y]="r.y + 4" font-size="12.5">{{ r.label }}</text>
        <rect [attr.x]="labelW" [attr.y]="r.y - barH / 2" [attr.width]="trackW" [attr.height]="barH" rx="3" fill="#eef1f6" />
        @if (r.w > 0) {
          <rect [attr.x]="labelW" [attr.y]="r.y - barH / 2" [attr.width]="r.w" [attr.height]="barH" rx="3" [attr.fill]="r.color">
            <title>{{ r.label }}: {{ r.text }}</title>
          </rect>
        }
        <text [attr.x]="width" [attr.y]="r.y + 4" text-anchor="end" font-size="12.5" font-weight="700">{{ r.text }}</text>
      }
    </svg>
  `,
})
export class BarChartComponent {
  readonly data = input.required<readonly ChartDatum[]>();
  /** What the chart shows, e.g. "Leads by status". */
  readonly heading = input.required<string>();
  readonly format = input<(n: number) => string>(plainNumber);

  readonly width = WIDTH;
  readonly labelW = LABEL_W;
  readonly barH = BAR_H;
  readonly trackW = WIDTH - LABEL_W - VALUE_W;

  readonly height = computed(() => Math.max(ROW, this.data().length * ROW));

  readonly rows = computed(() => {
    const data = this.data();
    const fmt = this.format();
    const max = data.reduce((m, d) => Math.max(m, d.value), 0);
    return data.map((d, i) => ({
      label: d.label,
      y: i * ROW + ROW / 2,
      w: max > 0 && d.value > 0 ? Math.max(3, (d.value / max) * this.trackW) : 0,
      text: fmt(d.value),
      color: colorAt(i, d),
    }));
  });

  readonly summary = computed(() => {
    const data = this.data();
    if (data.length === 0) return `${this.heading()}: no data`;
    const fmt = this.format();
    return `${this.heading()}. ${data.map((d) => `${d.label} ${fmt(d.value)}`).join(', ')}.`;
  });
}
