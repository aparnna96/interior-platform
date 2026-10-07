/**
 * Picks where a newly added piece goes in the room plan.
 *
 * Framework-free and pure, like the geometry helper: explicit inputs, no DOM,
 * no state. Positions use the plan's own convention: `x` / `y` are the percent
 * of the room width / length to the piece's top-left corner, and `w` / `l`
 * are feet across and down.
 *
 * The caller passes the spot it would have used before (`preferred`). That
 * spot is kept whenever it is free, so existing behaviour is unchanged where
 * it already worked. If something is in the way, the room is scanned in
 * reading order (top to bottom, left to right, every quarter foot) for the
 * first place where the new piece clears every existing piece by a small gap,
 * then for edge-snapped positions that sit exactly clear of a neighbour (so
 * tight fits the grid steps over are still found). If the room is too crowded
 * for a gap, touching is accepted; if there is no free place at all, the
 * position with the least overlap is returned and `free` is false, so a full
 * room never breaks adding a piece.
 */

export interface PlacementBox {
  x: number;
  y: number;
  w: number;
  l: number;
}

export interface PlacementSpot {
  x: number;
  y: number;
  /** True when the piece does not overlap anything at this position. */
  free: boolean;
}

/** How far apart candidate positions are, in feet. */
export const PLACEMENT_STEP_FT = 0.25;
/** Clear space asked for between pieces on the first pass, in feet. */
export const PLACEMENT_GAP_FT = 0.25;
/**
 * Most positions ever tried along one axis. Only absurd room sizes reach it;
 * the scan step is coarsened instead so the candidate list stays bounded.
 */
const MAX_AXIS_POSITIONS = 240;
/** Lowest and highest position (percent) a piece may be given; matches the plan's clamp. */
const MIN_PCT = 1;
const MAX_PCT = 99;
const EPSILON = 1e-6;

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface FeetBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Positions to try along one axis: 1%, then every step, ending exactly at the furthest allowed position. */
function axisPositions(max: number, stepPct: number): number[] {
  const top = Math.floor(max * 10) / 10;
  let step = stepPct;
  if (!isNum(step) || step <= 0) step = top - MIN_PCT;
  if (step > 0) {
    const count = Math.ceil((top - MIN_PCT) / step) + 1;
    if (count > MAX_AXIS_POSITIONS) step = (top - MIN_PCT) / (MAX_AXIS_POSITIONS - 1);
  }
  if (!(step > 0)) return [MIN_PCT, top].filter((v, i, a) => a.indexOf(v) === i);
  const out: number[] = [];
  for (let v = MIN_PCT; v < top - EPSILON; v += step) {
    out.push(Math.min(Math.round(v * 10) / 10, top));
  }
  out.push(top);
  return out;
}

export function findFreeSpot(
  size: { w: number; l: number },
  room: { width: number; length: number },
  existing: readonly PlacementBox[],
  preferred: { x: number; y: number }
): PlacementSpot {
  const px = isNum(preferred?.x) ? preferred.x : MIN_PCT;
  const py = isNum(preferred?.y) ? preferred.y : MIN_PCT;
  const roomOk = isNum(room?.width) && room.width > 0 && isNum(room?.length) && room.length > 0;
  const sizeOk = isNum(size?.w) && size.w > 0 && isNum(size?.l) && size.l > 0;
  // Nothing sensible to compute: hand the preferred spot back untouched.
  if (!roomOk || !sizeOk) return { x: px, y: py, free: false };

  const rw = room.width;
  const rl = room.length;
  const maxX = Math.max(MIN_PCT, MAX_PCT - (size.w / rw) * 100);
  const maxY = Math.max(MIN_PCT, MAX_PCT - (size.l / rl) * 100);

  const others: FeetBox[] = [];
  for (const b of Array.isArray(existing) ? existing : []) {
    if (!b || !isNum(b.x) || !isNum(b.y) || !isNum(b.w) || !isNum(b.l) || b.w <= 0 || b.l <= 0) continue;
    const x0 = (b.x / 100) * rw;
    const y0 = (b.y / 100) * rl;
    others.push({ x0, y0, x1: x0 + b.w, y1: y0 + b.l });
  }

  /** Overlapping area (sq ft) with every other piece, each grown by `gap` feet on all sides. */
  const overlap = (x: number, y: number, gap: number): number => {
    const x0 = (x / 100) * rw;
    const y0 = (y / 100) * rl;
    const x1 = x0 + size.w;
    const y1 = y0 + size.l;
    let area = 0;
    for (const o of others) {
      const ox = Math.min(x1, o.x1 + gap) - Math.max(x0, o.x0 - gap);
      const oy = Math.min(y1, o.y1 + gap) - Math.max(y0, o.y0 - gap);
      if (ox > EPSILON && oy > EPSILON) area += ox * oy;
    }
    return area;
  };

  const want = { x: clamp(px, MIN_PCT, maxX), y: clamp(py, MIN_PCT, maxY) };
  const xs = axisPositions(maxX, (PLACEMENT_STEP_FT / rw) * 100);
  const ys = axisPositions(maxY, (PLACEMENT_STEP_FT / rl) * 100);

  /**
   * Positions that sit exactly clear of one neighbour (piece edge against the
   * neighbour's grown edge). These catch tight fits the grid steps over, e.g.
   * a piece that only fits in the un-gapped strip between two others.
   */
  const edgeSpots = (gap: number): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (const o of others) {
      const leftFt = [o.x0 - gap - size.w, o.x1 + gap];
      const topFt = [o.y0 - gap - size.l, o.y1 + gap];
      for (const fx of leftFt) {
        const x = clamp((fx / rw) * 100, MIN_PCT, maxX);
        for (const fy of topFt) {
          out.push({ x, y: clamp((fy / rl) * 100, MIN_PCT, maxY) });
        }
      }
    }
    return out;
  };

  for (const gap of [PLACEMENT_GAP_FT, 0]) {
    if (overlap(want.x, want.y, gap) === 0) return { ...want, free: true };
    for (const y of ys) {
      for (const x of xs) {
        if (overlap(x, y, gap) === 0) return { x, y, free: true };
      }
    }
    for (const spot of edgeSpots(gap)) {
      if (overlap(spot.x, spot.y, gap) === 0) return { ...spot, free: true };
    }
  }

  // No free place: least overlap wins, the preferred spot first and then reading order.
  let best = { ...want };
  let bestArea = overlap(want.x, want.y, 0);
  for (const y of ys) {
    for (const x of xs) {
      const area = overlap(x, y, 0);
      if (area < bestArea - EPSILON) {
        best = { x, y };
        bestArea = area;
      }
    }
  }
  return { ...best, free: false };
}
