import {
  PLACEMENT_GAP_FT,
  PlacementBox,
  findFreeSpot,
} from './furniture-placement';

const ROOM = { width: 12, length: 15 };
const SOFA: PlacementBox = { x: 20, y: 8, w: 7, l: 3 };
const TABLE: PlacementBox = { x: 34, y: 44, w: 4, l: 2.5 };
const BED = { w: 6.5, l: 5 };
const WARDROBE = { w: 6, l: 2 };
const CHAIR = { w: 2.5, l: 2.5 };

/** Shortest distance in feet between two boxes (0 when they touch or overlap). */
function distance(a: PlacementBox, b: PlacementBox, room = ROOM): number {
  const ax0 = (a.x / 100) * room.width, ax1 = ax0 + a.w, ay0 = (a.y / 100) * room.length, ay1 = ay0 + a.l;
  const bx0 = (b.x / 100) * room.width, bx1 = bx0 + b.w, by0 = (b.y / 100) * room.length, by1 = by0 + b.l;
  const dx = Math.max(bx0 - ax1, ax0 - bx1, 0);
  const dy = Math.max(by0 - ay1, ay0 - by1, 0);
  return Math.hypot(dx, dy);
}

function overlaps(a: PlacementBox, b: PlacementBox, room = ROOM): boolean {
  const ax0 = (a.x / 100) * room.width, ay0 = (a.y / 100) * room.length;
  const bx0 = (b.x / 100) * room.width, by0 = (b.y / 100) * room.length;
  return Math.min(ax0 + a.w, bx0 + b.w) - Math.max(ax0, bx0) > 1e-6 && Math.min(ay0 + a.l, by0 + b.l) - Math.max(ay0, by0) > 1e-6;
}

function inside(b: PlacementBox, room = ROOM): boolean {
  return b.x >= 1 - 1e-9 && b.y >= 1 - 1e-9 && b.x + (b.w / room.width) * 100 <= 99 + 1e-6 && b.y + (b.l / room.length) * 100 <= 99 + 1e-6;
}

/** Mirrors the Visualizer's old formula, so the tests exercise the same preferred spots. */
function preferredFor(count: number): { x: number; y: number } {
  return { x: 6 + ((count * 13) % 60), y: 6 + ((count * 17) % 55) };
}

describe('findFreeSpot', () => {
  it('keeps the preferred spot in an empty room', () => {
    expect(findFreeSpot(BED, ROOM, [], { x: 6, y: 6 })).toEqual({ x: 6, y: 6, free: true });
  });

  it('keeps the preferred spot when nothing is in the way', () => {
    const spot = findFreeSpot(CHAIR, ROOM, [SOFA], { x: 6, y: 60 });
    expect(spot).toEqual({ x: 6, y: 60, free: true });
  });

  it('moves away from a piece that covers the preferred spot', () => {
    const spot = findFreeSpot(BED, ROOM, [SOFA, TABLE], { x: 32, y: 40 }); // the old formula put the bed on the table
    const placed = { ...BED, x: spot.x, y: spot.y };
    expect(spot.free).toBe(true);
    expect(overlaps(placed, SOFA)).toBe(false);
    expect(overlaps(placed, TABLE)).toBe(false);
    expect(inside(placed)).toBe(true);
  });

  it('leaves a clear gap around the pieces it avoids when the room allows it', () => {
    const spot = findFreeSpot(BED, ROOM, [SOFA, TABLE], { x: 32, y: 40 });
    const placed = { ...BED, x: spot.x, y: spot.y };
    expect(distance(placed, SOFA)).toBeGreaterThanOrEqual(PLACEMENT_GAP_FT - 1e-6);
    expect(distance(placed, TABLE)).toBeGreaterThanOrEqual(PLACEMENT_GAP_FT - 1e-6);
  });

  it('gives every piece type a free spot next to the default sofa and table', () => {
    for (const size of [BED, WARDROBE, CHAIR, { w: 7, l: 3 }, { w: 4, l: 2.5 }]) {
      const spot = findFreeSpot(size, ROOM, [SOFA, TABLE], preferredFor(2));
      const placed = { ...size, x: spot.x, y: spot.y };
      expect(spot.free).toBe(true);
      expect(overlaps(placed, SOFA)).toBe(false);
      expect(overlaps(placed, TABLE)).toBe(false);
      expect(inside(placed)).toBe(true);
    }
  });

  it('keeps pieces apart when several are added one after another', () => {
    const placed: PlacementBox[] = [SOFA, TABLE];
    for (const size of [BED, WARDROBE, CHAIR, CHAIR]) {
      const spot = findFreeSpot(size, ROOM, placed, preferredFor(placed.length));
      expect(spot.free).toBe(true);
      placed.push({ ...size, x: spot.x, y: spot.y });
    }
    for (let i = 0; i < placed.length; i++) {
      expect(inside(placed[i])).toBe(true);
      for (let j = i + 1; j < placed.length; j++) expect(overlaps(placed[i], placed[j])).toBe(false);
    }
  });

  it('accepts touching pieces when the room is too tight for a gap', () => {
    const room = { width: 10, length: 6 };
    const wall: PlacementBox = { x: 1, y: 1, w: 4.7, l: 5.7 }; // nearly fills the length, ends at 4.8 ft
    const spot = findFreeSpot({ w: 5, l: 5.7 }, room, [wall], { x: 1, y: 1 });
    const placed = { w: 5, l: 5.7, x: spot.x, y: spot.y };
    expect(spot.free).toBe(true);
    expect(overlaps(placed, wall, room)).toBe(false);
    expect(distance(placed, wall, room)).toBeLessThan(PLACEMENT_GAP_FT);
  });

  it('a full room never fails: it returns an in-bounds spot and says it is not free', () => {
    const room = { width: 4, length: 4 };
    const first = findFreeSpot(CHAIR, room, [], { x: 6, y: 6 });
    expect(first.free).toBe(true);
    const existing: PlacementBox[] = [{ ...CHAIR, x: first.x, y: first.y }];
    const second = findFreeSpot(CHAIR, room, existing, { x: 19, y: 23 });
    expect(second.free).toBe(false);
    expect(Number.isFinite(second.x) && Number.isFinite(second.y)).toBe(true);
    expect(inside({ ...CHAIR, x: second.x, y: second.y }, room)).toBe(true);
  });

  it('a full room gives the position with the least overlap, not an arbitrary one', () => {
    const room = { width: 4, length: 4 };
    const blocker: PlacementBox = { x: 1, y: 1, w: 3, l: 3 };
    const spot = findFreeSpot(CHAIR, room, [blocker], { x: 50, y: 50 });
    const worst = findFreeSpot(CHAIR, room, [blocker], { x: 1, y: 1 });
    expect(spot.free).toBe(false);
    // whichever spot is chosen, it must not overlap more than the preferred (fully covered) spot would
    const area = (s: { x: number; y: number }) => {
      const ox = Math.min((s.x / 100) * 4 + 2.5, 0.04 + 3) - Math.max((s.x / 100) * 4, 0.04);
      const oy = Math.min((s.y / 100) * 4 + 2.5, 0.04 + 3) - Math.max((s.y / 100) * 4, 0.04);
      return Math.max(ox, 0) * Math.max(oy, 0);
    };
    expect(area(spot)).toBeLessThanOrEqual(area(worst) + 1e-9);
  });

  it('is deterministic', () => {
    const a = findFreeSpot(BED, ROOM, [SOFA, TABLE], { x: 32, y: 40 });
    const b = findFreeSpot(BED, ROOM, [SOFA, TABLE], { x: 32, y: 40 });
    expect(a).toEqual(b);
  });

  it('does not change the pieces it is given', () => {
    const existing = [{ ...SOFA }, { ...TABLE }];
    const before = JSON.stringify(existing);
    findFreeSpot(BED, ROOM, existing, { x: 32, y: 40 });
    expect(JSON.stringify(existing)).toBe(before);
  });

  it('ignores malformed entries in the list of existing pieces', () => {
    const messy = [null, undefined, { x: NaN, y: 1, w: 1, l: 1 }, { x: 1, y: 1, w: 0, l: 1 }, { x: 1, y: 1, w: 1, l: -2 }, SOFA] as unknown as PlacementBox[];
    const spot = findFreeSpot(CHAIR, ROOM, messy, { x: 20, y: 8 });
    expect(spot.free).toBe(true);
    expect(overlaps({ ...CHAIR, x: spot.x, y: spot.y }, SOFA)).toBe(false);
  });

  it('a missing list is treated as an empty room', () => {
    expect(findFreeSpot(CHAIR, ROOM, undefined as unknown as PlacementBox[], { x: 6, y: 6 })).toEqual({ x: 6, y: 6, free: true });
  });

  it('returns the preferred spot untouched for an unusable room or piece size', () => {
    for (const [size, room] of [
      [BED, { width: NaN, length: 15 }],
      [BED, { width: 12, length: Infinity }],
      [BED, { width: 0, length: 15 }],
      [BED, { width: -4, length: 15 }],
      [{ w: 0, l: 5 }, ROOM],
      [{ w: 6, l: NaN }, ROOM],
    ] as [{ w: number; l: number }, { width: number; length: number }][]) {
      expect(findFreeSpot(size, room, [SOFA], { x: 12, y: 34 })).toEqual({ x: 12, y: 34, free: false });
    }
  });

  it('falls back to the top-left corner when the preferred spot is not a number', () => {
    const spot = findFreeSpot(CHAIR, ROOM, [], { x: NaN, y: undefined as unknown as number });
    expect(spot).toEqual({ x: 1, y: 1, free: true });
  });

  it('clamps a preferred spot that lies outside the room', () => {
    const spot = findFreeSpot(CHAIR, ROOM, [], { x: 500, y: -40 });
    expect(spot.free).toBe(true);
    expect(inside({ ...CHAIR, x: spot.x, y: spot.y })).toBe(true);
  });

  it('handles the smallest and the largest rooms, and pieces bigger than the room', () => {
    const tiny = findFreeSpot({ w: 7, l: 3 }, { width: 4, length: 4 }, [], { x: 6, y: 6 });
    expect(tiny).toEqual({ x: 1, y: 6, free: true }); // too wide: pinned to the left edge; y is still free
    const huge = { width: 50, length: 50 };
    const crowd: PlacementBox[] = [];
    for (let i = 0; i < 12; i++) {
      const spot = findFreeSpot(BED, huge, crowd, preferredFor(crowd.length));
      expect(spot.free).toBe(true);
      expect(Number.isFinite(spot.x) && Number.isFinite(spot.y)).toBe(true);
      crowd.push({ ...BED, x: spot.x, y: spot.y });
    }
    expect(crowd.every((c) => inside(c, huge))).toBe(true);
  });

  it('never returns NaN or Infinity across awkward inputs', () => {
    const awkward = [-1e9, -1, 0, 0.0001, 3.99, 4, 12, 50, 50.5, 1e9, NaN, Infinity, -Infinity];
    for (const w of awkward) {
      for (const l of awkward) {
        for (const size of [BED, { w, l }]) {
          const s = findFreeSpot(size, { width: w, length: l }, [SOFA, TABLE], { x: w, y: l });
          expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
        }
      }
    }
  });
});
