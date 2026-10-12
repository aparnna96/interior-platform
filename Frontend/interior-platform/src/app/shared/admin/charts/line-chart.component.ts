import { Component, computed, input } from '@angular/core';
import { ChartDatum, niceTicks, plainNumber } from './chart-utils';

const WIDTH = 520;
const HEIGHT = 210;
const PAD = { left: 46, right: 14, top: 14, bottom: 30 };

/**
 * Line chart with a soft area under it, for a value over time.
 * The chart is a role="img" with a text summary; the points carry tooltips
 * and the full data is also available as a visually hidden table.
 */
@Component({
  selector: 'app-line-chart',
  standalone: true,
  template: `
    <div class="adm-chart-scroll">
      <svg class="adm-chart adm-line-chart" [attr.viewBox]="'0 0 ' + width + ' ' + height" role="img" [attr.aria-label]="summary()" focusable="false">
        <title>{{ summary() }}</title>
        @for (t of geometry().yTicks; track t.value) {
          <line class="adm-grid-line" [attr.x1]="pad.left" [attr.x2]="width - pad.right" [attr.y1]="t.y" [attr.y2]="t.y" />
          <text class="adm-axis-text" [attr.x]="pad.left - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.text }}</text>
        }
        @for (l of geometry().xLabels; track l.x) {
          <text class="adm-axis-text" [attr.x]="l.x" [attr.y]="height - 8" [attr.text-anchor]="l.anchor">{{ l.text }}</text>
        }
        @if (geometry().area) {
          <path [attr.d]="geometry().area" [attr.fill]="color()" fill-opacity="0.1" />
          <path [attr.d]="geometry().line" fill="none" [attr.stroke]="color()" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round" />
        }
        @for (p of geometry().dots; track p.x) {
          <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3.25" [attr.fill]="color()" stroke="#fff" stroke-width="1.5">
            <title>{{ p.tip }}</title>
          </circle>
        }
      </svg>
    </div>
    <table class="adm-sr-only">
      <caption>{{ summary() }}</caption>
      <thead><tr><th scope="col">{{ axisLabel() }}</th><th scope="col">Value</th></tr></thead>
      <tbody>
        @for (d of data(); track $index) {
          <tr><th scope="row">{{ d.label }}</th><td>{{ format()(d.value) }}</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class LineChartComponent {
  readonly data = input.required<readonly ChartDatum[]>();
  /** What the chart shows, e.g. "Orders per day, last 14 days". */
  readonly heading = input.required<string>();
  readonly axisLabel = input('Date');
  readonly color = input('#0b2447');
  readonly format = input<(n: number) => string>(plainNumber);

  readonly width = WIDTH;
  readonly height = HEIGHT;
  readonly pad = PAD;

  readonly summary = computed(() => {
    const rows = this.data();
    if (rows.length === 0) return `${this.heading()}: no data`;
    const fmt = this.format();
    const total = rows.reduce((n, d) => n + d.value, 0);
    const peak = rows.reduce((a, b) => (b.value > a.value ? b : a));
    return `${this.heading()}. Total ${fmt(total)}. Highest ${fmt(peak.value)} on ${peak.label}.`;
  });

  readonly geometry = computed(() => {
    const rows = this.data();
    const fmt = this.format();
    const max = rows.reduce((m, d) => Math.max(m, d.value), 0);
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1];
    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const yOf = (v: number) => PAD.top + innerH - (v / top) * innerH;
    const xOf = (i: number) => (rows.length <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (rows.length - 1)) * innerW);
    const dots = rows.map((d, i) => ({ x: xOf(i), y: yOf(d.value), tip: `${d.label}: ${fmt(d.value)}` }));
    const line = dots.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const baseline = yOf(0).toFixed(1);
    const area =
      dots.length > 1
        ? `${line} L${dots[dots.length - 1].x.toFixed(1)} ${baseline} L${dots[0].x.toFixed(1)} ${baseline} Z`
        : '';
    // About six labels along the bottom: every n-th point plus the last, skipping one that would crowd the last.
    const every = Math.max(1, Math.ceil(rows.length / 6));
    const labelled: number[] = [];
    for (let i = 0; i < rows.length - 1; i += every) {
      if (rows.length - 1 - i >= every * 0.7) labelled.push(i);
    }
    if (rows.length > 0) labelled.push(rows.length - 1);
    const xLabels = labelled.map((i) => ({
      x: xOf(i),
      text: rows[i].label,
      anchor: rows.length > 1 && i === 0 ? 'start' : rows.length > 1 && i === rows.length - 1 ? 'end' : 'middle',
    }));
    return {
      yTicks: ticks.map((value) => ({ value, y: yOf(value), text: fmt(value) })),
      xLabels,
      dots,
      line,
      area,
    };
  });
}
