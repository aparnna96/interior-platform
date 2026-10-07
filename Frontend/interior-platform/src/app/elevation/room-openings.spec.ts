import {
  DOOR_HEIGHT_FT,
  DOOR_WIDTH_FT,
  WINDOW_HEIGHT_FT,
  WINDOW_SILL_FT,
  WINDOW_WIDTH_FT,
  openingsForWall,
} from './room-openings';

describe('openingsForWall', () => {
  it('the top wall has one window, centred, at real size', () => {
    const [w, ...rest] = openingsForWall('top', 12, 9);
    expect(rest).toEqual([]);
    expect(w.kind).toBe('window');
    expect(w.widthFt).toBe(WINDOW_WIDTH_FT);
    expect(w.heightFt).toBe(WINDOW_HEIGHT_FT);
    expect(w.bottomFt).toBe(WINDOW_SILL_FT);
    expect(w.startFt).toBeCloseTo(4, 3); // (12 - 4) / 2
    expect(w.leftPct).toBeCloseTo(33.3333, 3);
    expect(w.widthPct).toBeCloseTo(33.3333, 3);
    expect(w.bottomPct).toBeCloseTo(33.3333, 3);
    expect(w.heightPct).toBeCloseTo(44.4444, 3);
  });

  it('the bottom wall has one door on the floor, 4% in from the left of the view', () => {
    const [d, ...rest] = openingsForWall('bottom', 12, 9);
    expect(rest).toEqual([]);
    expect(d.kind).toBe('door');
    expect(d.widthFt).toBe(DOOR_WIDTH_FT);
    expect(d.heightFt).toBe(DOOR_HEIGHT_FT);
    expect(d.bottomFt).toBe(0);
    expect(d.bottomPct).toBe(0);
    expect(d.startFt).toBeCloseTo(0.5, 3); // 4% of 12 ft is 0.48, kept at least 0.5 ft from the corner
  });

  it('the door moves in with the wall length on long walls', () => {
    expect(openingsForWall('bottom', 50, 9)[0].startFt).toBeCloseTo(2, 3);
  });

  it('the left and right walls are plain', () => {
    expect(openingsForWall('left', 15, 9)).toEqual([]);
    expect(openingsForWall('right', 15, 9)).toEqual([]);
  });

  it('a 4 ft wall keeps the window inside and the door inside', () => {
    const w = openingsForWall('top', 4, 9)[0];
    expect(w.widthFt).toBe(2); // half the wall
    expect(w.startFt).toBe(1);
    const d = openingsForWall('bottom', 4, 9)[0];
    expect(d.widthFt).toBe(3);
    expect(d.startFt).toBeCloseTo(0.5, 3);
    expect(d.startFt + d.widthFt).toBeLessThanOrEqual(4);
  });

  it('the lowest ceiling leaves room above the window and door', () => {
    const w = openingsForWall('top', 12, 7)[0];
    expect(w.bottomFt + w.heightFt).toBeLessThan(7);
    const d = openingsForWall('bottom', 12, 7)[0];
    expect(d.heightFt).toBe(6.5);
    expect(d.heightPct).toBeLessThan(100);
  });

  it('every opening stays inside its wall across walls, lengths and ceilings', () => {
    for (const wall of ['top', 'bottom'] as const) {
      for (const len of [4, 5, 12, 15, 50]) {
        for (const ceil of [7, 9, 14]) {
          for (const o of openingsForWall(wall, len, ceil)) {
            expect(o.leftPct).toBeGreaterThanOrEqual(0);
            expect(o.leftPct + o.widthPct).toBeLessThanOrEqual(100.0001);
            expect(o.bottomPct + o.heightPct).toBeLessThan(100);
            expect(o.heightFt).toBeGreaterThan(0);
            expect(o.widthFt).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('bad input gives no openings, never NaN', () => {
    for (const bad of [NaN, Infinity, -Infinity, 0, -5, undefined as unknown as number, '12' as unknown as number]) {
      expect(openingsForWall('top', bad, 9)).toEqual([]);
      expect(openingsForWall('bottom', bad, 9)).toEqual([]);
    }
    expect(openingsForWall('nowhere' as never, 12, 9)).toEqual([]);
  });

  it('a bad ceiling height is corrected to the 7 to 14 ft range', () => {
    const o = openingsForWall('top', 12, NaN)[0];
    expect(Number.isFinite(o.bottomPct)).toBe(true);
    expect(Number.isFinite(o.heightPct)).toBe(true);
    expect(o.heightPct).toBeCloseTo(44.4444, 3); // treated as 9 ft
    expect(openingsForWall('top', 12, 1000)[0].heightPct).toBeCloseTo((4 / 14) * 100, 3);
  });
});
