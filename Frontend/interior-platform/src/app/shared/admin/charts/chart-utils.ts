/** Shared helpers for the hand-built SVG charts. */

export interface ChartDatum {
  readonly label: string;
  readonly value: number;
  /** Optional fill; defaults come from {@link CHART_COLORS}. */
  readonly color?: string;
}

/**
 * Chart colours. The first two are the brand navy and gold; the rest are
 * chosen to stay apart from them and from each other, and every one keeps at
 * least 3:1 contrast on a white card (WCAG graphics). Meaning is never carried
 * by colour alone: each chart also prints labels and values.
 */
export const CHART_COLORS: readonly string[] = [
  '#0b2447', // navy
  '#b07d1f', // gold
  '#2f7f79', // teal
  '#3b6fb6', // blue
  '#a64a3a', // clay
  '#6b7a99', // slate
];

/** Colours for order statuses, matching the status badge tones. */
export const ORDER_STATUS_COLORS: Readonly<Record<number, string>> = {
  0: '#b07d1f', // pending: gold (needs action)
  1: '#3b6fb6', // confirmed: blue
  2: '#2f7f79', // processing: teal
  3: '#2e8b57', // completed: green
  4: '#a64a3a', // cancelled: clay red
};

export function colorAt(index: number, datum?: ChartDatum): string {
  return datum?.color ?? CHART_COLORS[index % CHART_COLORS.length];
}

/** Whole-number-friendly axis ticks from 0 up to a rounded maximum (about 4 intervals). */
export function niceTicks(max: number, intervals = 4): number[] {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const rough = safeMax / intervals;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / magnitude;
  // Counts and rupees are whole numbers: never a step below 1 (no "0.5 orders").
  const step = Math.max(1, (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10) * magnitude);
  const top = Math.ceil(safeMax / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** "₹1.2L", "₹3.4Cr", "₹850": short money for axes and tight spaces (Indian units). */
export function compactRupees(n: number): string {
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  const trim = (v: number) => String(Math.round(v * 10) / 10);
  if (abs >= 1e7) return `₹${trim(n / 1e7)}Cr`;
  if (abs >= 1e5) return `₹${trim(n / 1e5)}L`;
  if (abs >= 1e3) return `₹${trim(n / 1e3)}k`;
  return `₹${Math.round(n)}`;
}

export function plainNumber(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString('en-IN') : '';
}
