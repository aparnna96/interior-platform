import {
  DEFAULT_CEILING_HEIGHT_FT,
  DEFAULT_PIECE_HEIGHT_FT,
  DEFAULT_ROOM_LENGTH_FT,
  DEFAULT_ROOM_WIDTH_FT,
  ELEVATION_WALLS,
  ElevationGeometry,
  ElevationItemInput,
  ElevationWall,
  MAX_CEILING_HEIGHT_FT,
  MAX_ROOM_DIMENSION_FT,
  MIN_CEILING_HEIGHT_FT,
  MIN_ROOM_DIMENSION_FT,
  PIECE_HEIGHT_FT,
  buildElevationGeometry,
  clampCeilingHeight,
  clampRoomDimension,
} from './elevation-geometry';

/** Shorthand for a placed piece (x and y are percentages, like the 2D plan). */
function piece(uid: string, defId: string, w: number, l: number, x: number, y: number): ElevationItemInput {
  return { uid, defId, w, l, x, y };
}

/** The Visualizer's default scene: a 12 x 15 ft room with a sofa and a table. */
const SOFA = piece('f-sofa-1', 'sofa', 7, 3, 20, 8);
const TABLE = piece('f-table-1', 'table', 4, 2.5, 34, 44);

function build(
  width: number,
  length: number,
  items: ElevationItemInput[],
  wall: ElevationWall,
  ceiling?: number
): ElevationGeometry {
  return buildElevationGeometry(
    { roomWidthFt: width, roomLengthFt: length, ceilingHeightFt: ceiling, items },
    wall
  );
}

function expectAllFinite(g: ElevationGeometry): void {
  const top = [g.roomWidthFt, g.roomLengthFt, g.wallLengthFt, g.ceilingHeightFt, g.aspectRatio];
  for (const n of top) expect(Number.isFinite(n)).toBe(true);
  for (const p of g.pieces) {
    const nums = [
      p.startFt, p.endFt, p.spanFt, p.depthFt, p.distanceFromWallFt,
      p.heightFt, p.leftPct, p.widthPct, p.heightPct, p.order,
    ];
    for (const n of nums) expect(Number.isFinite(n)).toBe(true);
  }
}

describe('elevation geometry: wall list', () => {
  it('offers the four walls once each, in reading order', () => {
    expect(ELEVATION_WALLS.map((w) => w.id)).toEqual(['top', 'right', 'bottom', 'left']);
    expect(new Set(ELEVATION_WALLS.map((w) => w.id)).size).toBe(4);
  });
});

describe('elevation geometry: the four wall mappings (12 x 15 ft room, sofa 7 x 3 at 20% / 8%)', () => {
  // The sofa covers x 2.4 to 9.4 ft and y 1.2 to 4.2 ft of the room.
  it('top wall: runs along x, distance is the top edge', () => {
    const g = build(12, 15, [SOFA], 'top');
    const p = g.pieces[0];
    expect(g.wall).toBe('top');
    expect(g.wallLengthFt).toBe(12);
    expect(p.startFt).toBeCloseTo(2.4, 3);
    expect(p.endFt).toBeCloseTo(9.4, 3);
    expect(p.spanFt).toBeCloseTo(7, 3);
    expect(p.distanceFromWallFt).toBeCloseTo(1.2, 3);
    expect(p.depthFt).toBeCloseTo(3, 3);
    expect(p.leftPct).toBeCloseTo(20, 3);
    expect(p.widthPct).toBeCloseTo(58.3333, 3);
  });

  it('bottom wall: x is mirrored, distance is from the bottom edge', () => {
    const p = build(12, 15, [SOFA], 'bottom').pieces[0];
    expect(p.startFt).toBeCloseTo(2.6, 3); // 12 - 9.4
    expect(p.endFt).toBeCloseTo(9.6, 3); // 12 - 2.4
    expect(p.spanFt).toBeCloseTo(7, 3);
    expect(p.distanceFromWallFt).toBeCloseTo(10.8, 3); // 15 - 4.2
    expect(p.depthFt).toBeCloseTo(3, 3);
  });

  it('left wall: runs along the room length, mirrored, depth is the piece width', () => {
    const g = build(12, 15, [SOFA], 'left');
    const p = g.pieces[0];
    expect(g.wallLengthFt).toBe(15);
    expect(p.startFt).toBeCloseTo(10.8, 3); // 15 - 4.2
    expect(p.endFt).toBeCloseTo(13.8, 3); // 15 - 1.2
    expect(p.spanFt).toBeCloseTo(3, 3);
    expect(p.distanceFromWallFt).toBeCloseTo(2.4, 3);
    expect(p.depthFt).toBeCloseTo(7, 3);
    expect(p.leftPct).toBeCloseTo(72, 3);
    expect(p.widthPct).toBeCloseTo(20, 3);
  });

  it('right wall: runs along the room length, not mirrored, distance from the right edge', () => {
    const g = build(12, 15, [SOFA], 'right');
    const p = g.pieces[0];
    expect(g.wallLengthFt).toBe(15);
    expect(p.startFt).toBeCloseTo(1.2, 3);
    expect(p.endFt).toBeCloseTo(4.2, 3);
    expect(p.spanFt).toBeCloseTo(3, 3);
    expect(p.distanceFromWallFt).toBeCloseTo(2.6, 3); // 12 - 9.4
    expect(p.depthFt).toBeCloseTo(7, 3);
    expect(p.leftPct).toBeCloseTo(8, 3);
  });

  it('carries the room size, ceiling height and drawing ratio', () => {
    const top = build(12, 15, [SOFA], 'top');
    expect(top.roomWidthFt).toBe(12);
    expect(top.roomLengthFt).toBe(15);
    expect(top.ceilingHeightFt).toBe(9);
    expect(top.aspectRatio).toBeCloseTo(12 / 9, 3);
    expect(build(12, 15, [SOFA], 'left').aspectRatio).toBeCloseTo(15 / 9, 3);
  });

  it('uses the default scene heights as a share of the ceiling', () => {
    const g = build(12, 15, [SOFA, TABLE], 'top');
    const sofa = g.pieces.find((p) => p.uid === 'f-sofa-1')!;
    const table = g.pieces.find((p) => p.uid === 'f-table-1')!;
    expect(sofa.heightFt).toBe(3);
    expect(sofa.heightPct).toBeCloseTo(33.3333, 3);
    expect(table.heightFt).toBe(2.5);
    expect(table.heightPct).toBeCloseTo(27.7778, 3);
  });

  it('returns no pieces and a valid frame for an empty room', () => {
    const g = build(12, 15, [], 'top');
    expect(g.pieces).toEqual([]);
    expect(g.skippedCount).toBe(0);
    expect(g.inputsAdjusted).toBe(false);
  });
});

describe('elevation geometry: mirroring', () => {
  // A 2 x 2 ft piece in the top-left corner of a 10 x 10 ft room.
  const corner = [piece('c', 'chair', 2, 2, 0, 0)];

  it('a top-left piece sits at the left of the top wall and the right of the bottom wall', () => {
    expect(build(10, 10, corner, 'top').pieces[0].startFt).toBeCloseTo(0, 3);
    expect(build(10, 10, corner, 'bottom').pieces[0].startFt).toBeCloseTo(8, 3);
  });

  it('a top-left piece sits at the left of the right wall and the right of the left wall', () => {
    expect(build(10, 10, corner, 'right').pieces[0].startFt).toBeCloseTo(0, 3);
    expect(build(10, 10, corner, 'left').pieces[0].startFt).toBeCloseTo(8, 3);
  });

  it('a centred piece looks the same from opposite walls', () => {
    const centred = [piece('m', 'table', 4, 2, 30, 40)]; // 3 to 7 ft across a 10 ft room
    const top = build(10, 10, centred, 'top').pieces[0];
    const bottom = build(10, 10, centred, 'bottom').pieces[0];
    expect(top.startFt).toBeCloseTo(3, 3);
    expect(bottom.startFt).toBeCloseTo(3, 3);
  });

  it('opposite walls are exact mirror images along the wall', () => {
    const items = [SOFA, TABLE];
    const top = build(12, 15, items, 'top');
    const bottom = build(12, 15, items, 'bottom');
    const left = build(12, 15, items, 'left');
    const right = build(12, 15, items, 'right');
    for (const t of top.pieces) {
      const b = bottom.pieces.find((p) => p.uid === t.uid)!;
      expect(b.startFt).toBeCloseTo(12 - t.endFt, 3);
      expect(b.spanFt).toBeCloseTo(t.spanFt, 3);
      // the gaps to the top and bottom walls plus the piece itself fill the room length
      expect(t.distanceFromWallFt + t.depthFt + b.distanceFromWallFt).toBeCloseTo(15, 3);
    }
    for (const r of right.pieces) {
      const l = left.pieces.find((p) => p.uid === r.uid)!;
      expect(l.startFt).toBeCloseTo(15 - r.endFt, 3);
      expect(l.spanFt).toBeCloseTo(r.spanFt, 3);
      expect(r.distanceFromWallFt + r.depthFt + l.distanceFromWallFt).toBeCloseTo(12, 3);
    }
  });
});

describe('elevation geometry: rotation (the app swaps w and l)', () => {
  // 20 x 20 ft room, piece top-left corner at 2 ft, 2 ft.
  const wide = piece('w', 'wardrobe', 6, 2, 10, 10);
  const turned = piece('w', 'wardrobe', 2, 6, 10, 10); // the same wardrobe after rotating

  it('on the top wall a rotated piece swaps its width and depth', () => {
    const a = build(20, 20, [wide], 'top').pieces[0];
    const b = build(20, 20, [turned], 'top').pieces[0];
    expect(a.spanFt).toBe(6);
    expect(a.depthFt).toBe(2);
    expect(b.spanFt).toBe(2);
    expect(b.depthFt).toBe(6);
  });

  it('on the left and right walls the swap goes the other way', () => {
    for (const wall of ['left', 'right'] as const) {
      const a = build(20, 20, [wide], wall).pieces[0];
      const b = build(20, 20, [turned], wall).pieces[0];
      expect(a.spanFt).toBe(2);
      expect(a.depthFt).toBe(6);
      expect(b.spanFt).toBe(6);
      expect(b.depthFt).toBe(2);
    }
  });

  it('rotating twice gives the original geometry', () => {
    const twice = piece('w', 'wardrobe', 6, 2, 10, 10);
    for (const wall of ['top', 'bottom', 'left', 'right'] as const) {
      expect(build(20, 20, [twice], wall).pieces).toEqual(build(20, 20, [wide], wall).pieces);
    }
  });

  it('a rotated piece pushed against the far edge is kept inside the room', () => {
    const edge = piece('e', 'bed', 5, 6.5, 99, 99); // bed turned, placed beyond the edge
    const g = build(20, 20, [edge], 'top');
    const p = g.pieces[0];
    expect(p.endFt).toBeLessThanOrEqual(20);
    expect(p.startFt).toBeCloseTo(15, 3); // 20 - 5
    expect(p.distanceFromWallFt + p.depthFt).toBeLessThanOrEqual(20.0001);
  });
});

describe('elevation geometry: depth ordering (back to front)', () => {
  // 20 x 20 ft room; 2 x 2 ft pieces so nothing is clipped.
  const far = piece('far', 'chair', 2, 2, 10, 70); // 14 ft down, 10 ft of the width
  const near = piece('near', 'chair', 2, 2, 70, 10); // 2 ft down, 14 ft across

  it('top wall: the piece nearest the wall comes first', () => {
    const g = build(20, 20, [far, near], 'top');
    expect(g.pieces.map((p) => p.uid)).toEqual(['near', 'far']);
    expect(g.pieces.map((p) => p.order)).toEqual([0, 1]);
  });

  it('bottom wall: the order reverses', () => {
    const g = build(20, 20, [near, far], 'bottom');
    expect(g.pieces.map((p) => p.uid)).toEqual(['far', 'near']);
  });

  it('left and right walls order by the x position', () => {
    const left = piece('left', 'chair', 2, 2, 10, 50); // x 2 to 4
    const right = piece('right', 'chair', 2, 2, 70, 50); // x 14 to 16
    expect(build(20, 20, [right, left], 'left').pieces.map((p) => p.uid)).toEqual(['left', 'right']);
    expect(build(20, 20, [left, right], 'right').pieces.map((p) => p.uid)).toEqual(['right', 'left']);
  });

  it('is independent of the order the pieces were added in', () => {
    const a = build(20, 20, [far, near], 'top').pieces.map((p) => p.uid);
    const b = build(20, 20, [near, far], 'top').pieces.map((p) => p.uid);
    expect(a).toEqual(b);
  });

  it('at the same distance the deeper piece is drawn later, so it overlaps the shallow one', () => {
    const shallow = piece('shallow', 'chair', 2, 2, 10, 10);
    const deep = piece('deep', 'bed', 2, 5, 40, 10);
    expect(build(20, 20, [deep, shallow], 'top').pieces.map((p) => p.uid)).toEqual(['shallow', 'deep']);
  });

  it('identical geometry keeps the order the pieces were added in', () => {
    const r = piece('r', 'chair', 2, 2, 10, 10);
    const s = piece('s', 'chair', 2, 2, 10, 10);
    expect(build(20, 20, [r, s], 'top').pieces.map((p) => p.uid)).toEqual(['r', 's']);
    expect(build(20, 20, [s, r], 'top').pieces.map((p) => p.uid)).toEqual(['s', 'r']);
  });

  it('numbers the draw order 0..n-1 with no gaps', () => {
    const g = build(12, 15, [SOFA, TABLE, far, near], 'top');
    expect(g.pieces.map((p) => p.order)).toEqual([0, 1, 2, 3]);
  });

  it('the default scene: the sofa is behind the table on the top wall, in front on the bottom wall', () => {
    expect(build(12, 15, [TABLE, SOFA], 'top').pieces.map((p) => p.uid)).toEqual(['f-sofa-1', 'f-table-1']);
    expect(build(12, 15, [SOFA, TABLE], 'bottom').pieces.map((p) => p.uid)).toEqual(['f-table-1', 'f-sofa-1']);
  });
});

describe('elevation geometry: normal room sizes', () => {
  it('10 x 12 ft room with a bed against the top wall', () => {
    const bed = piece('bed', 'bed', 6.5, 5, 20, 0);
    const g = build(10, 12, [bed], 'top');
    const p = g.pieces[0];
    expect(g.wallLengthFt).toBe(10);
    expect(p.startFt).toBeCloseTo(2, 3);
    expect(p.distanceFromWallFt).toBe(0);
    expect(p.heightFt).toBe(3.5);
    expect(p.clipped).toBe(false);
    expect(g.inputsAdjusted).toBe(false);
  });

  it('a different ceiling height changes the drawing ratio and height share, not the width', () => {
    const low = build(12, 15, [SOFA], 'top', 7);
    const high = build(12, 15, [SOFA], 'top', 14);
    expect(low.ceilingHeightFt).toBe(7);
    expect(high.ceilingHeightFt).toBe(14);
    expect(low.aspectRatio).toBeGreaterThan(high.aspectRatio);
    expect(low.pieces[0].heightPct).toBeGreaterThan(high.pieces[0].heightPct);
    expect(low.pieces[0].widthPct).toBeCloseTo(high.pieces[0].widthPct, 6);
  });

  it('a wardrobe is as tall as the lowest allowed ceiling and fills its height', () => {
    const g = build(12, 15, [piece('w', 'wardrobe', 6, 2, 0, 0)], 'top', 7);
    expect(g.pieces[0].heightFt).toBe(7);
    expect(g.pieces[0].heightPct).toBe(100);
  });

  it('an unknown piece type uses the default height', () => {
    const g = build(12, 15, [piece('l', 'lamp', 1, 1, 10, 10)], 'top');
    expect(g.pieces[0].heightFt).toBe(DEFAULT_PIECE_HEIGHT_FT);
  });

  it('has a drawing height for every piece the Visualizer offers', () => {
    for (const id of ['bed', 'wardrobe', 'sofa', 'table', 'chair']) {
      expect(PIECE_HEIGHT_FT.get(id)).toBeGreaterThan(0);
    }
  });
});

describe('elevation geometry: extreme room sizes', () => {
  it('4 x 4 ft: a sofa larger than the room is cut to the room and flagged', () => {
    const big = piece('big', 'sofa', 7, 3, 0, 0);
    const g = build(4, 4, [big], 'top');
    const p = g.pieces[0];
    expect(g.wallLengthFt).toBe(4);
    expect(g.aspectRatio).toBeCloseTo(4 / 9, 3);
    expect(p.startFt).toBe(0);
    expect(p.endFt).toBe(4);
    expect(p.widthPct).toBe(100);
    expect(p.clipped).toBe(true);
    expectAllFinite(g);
  });

  it('4 x 4 ft: small pieces are unaffected and not flagged', () => {
    const small = piece('s', 'chair', 2.5, 2.5, 0, 0);
    const p = build(4, 4, [small], 'bottom').pieces[0];
    expect(p.spanFt).toBe(2.5);
    expect(p.clipped).toBe(false);
  });

  it('4 x 50 ft: the short and the long walls have very different ratios', () => {
    const items = [piece('c', 'chair', 2, 2, 50, 50)];
    const top = build(4, 50, items, 'top');
    const left = build(4, 50, items, 'left');
    expect(top.wallLengthFt).toBe(4);
    expect(top.aspectRatio).toBeCloseTo(4 / 9, 3);
    expect(left.wallLengthFt).toBe(50);
    expect(left.aspectRatio).toBeCloseTo(50 / 9, 3);
    // y 25 ft to 27 ft of a 50 ft room, mirrored on the left wall
    expect(left.pieces[0].startFt).toBeCloseTo(23, 3);
    expect(left.pieces[0].spanFt).toBe(2);
    expectAllFinite(top);
    expectAllFinite(left);
  });

  it('50 x 50 ft: a piece pushed to the far corner stays inside every wall', () => {
    const corner = [piece('w', 'wardrobe', 6, 2, 99, 99)];
    for (const wall of ['top', 'bottom', 'left', 'right'] as const) {
      const g = build(50, 50, corner, wall);
      const p = g.pieces[0];
      expect(g.wallLengthFt).toBe(50);
      expect(p.startFt).toBeGreaterThanOrEqual(0);
      expect(p.endFt).toBeLessThanOrEqual(50);
      expect(p.leftPct + p.widthPct).toBeLessThanOrEqual(100.0001);
      expectAllFinite(g);
    }
  });

  it('50 x 50 ft with a 14 ft ceiling gives the widest frame', () => {
    const g = build(50, 50, [], 'top', 14);
    expect(g.aspectRatio).toBeCloseTo(50 / 14, 3);
  });

  it('a 50 ft wall still scales small pieces proportionally', () => {
    const g = build(50, 50, [piece('c', 'chair', 2.5, 2.5, 50, 50)], 'top');
    // 2.5 ft of a 50 ft wall is 5%; x = 50% of 50 ft puts the left edge at 25 ft, which is 50%.
    expect(g.pieces[0].widthPct).toBeCloseTo(5, 3);
    expect(g.pieces[0].leftPct).toBeCloseTo(50, 3);
  });
});

describe('elevation geometry: room size and ceiling height limits', () => {
  it('exposes the agreed limits', () => {
    expect(MIN_ROOM_DIMENSION_FT).toBe(4);
    expect(MAX_ROOM_DIMENSION_FT).toBe(50);
    expect(MIN_CEILING_HEIGHT_FT).toBe(7);
    expect(MAX_CEILING_HEIGHT_FT).toBe(14);
    expect(DEFAULT_CEILING_HEIGHT_FT).toBe(9);
  });

  it('clampRoomDimension keeps 4 to 50 and leaves valid values alone', () => {
    expect(clampRoomDimension(4, 12)).toBe(4);
    expect(clampRoomDimension(12.5, 12)).toBe(12.5);
    expect(clampRoomDimension(50, 12)).toBe(50);
    expect(clampRoomDimension(3.9, 12)).toBe(4);
    expect(clampRoomDimension(0, 12)).toBe(4);
    expect(clampRoomDimension(-20, 12)).toBe(4);
    expect(clampRoomDimension(50.1, 12)).toBe(50);
    expect(clampRoomDimension(1000, 12)).toBe(50);
  });

  it('clampRoomDimension uses the fallback when the value is not a finite number', () => {
    expect(clampRoomDimension(NaN, 12)).toBe(12);
    expect(clampRoomDimension(Infinity, 12)).toBe(12);
    expect(clampRoomDimension(-Infinity, 12)).toBe(12);
    expect(clampRoomDimension(undefined as unknown as number, 15)).toBe(15);
    expect(clampRoomDimension(null as unknown as number, 15)).toBe(15);
    expect(clampRoomDimension('20' as unknown as number, 15)).toBe(15);
  });

  it('the fallback itself is kept inside 4 to 50 ft', () => {
    expect(clampRoomDimension(NaN, 500)).toBe(50);
    expect(clampRoomDimension(NaN, 1)).toBe(4);
  });

  it('clampCeilingHeight keeps 7 to 14 and defaults to 9', () => {
    expect(clampCeilingHeight(7)).toBe(7);
    expect(clampCeilingHeight(9)).toBe(9);
    expect(clampCeilingHeight(14)).toBe(14);
    expect(clampCeilingHeight(6.9)).toBe(7);
    expect(clampCeilingHeight(0)).toBe(7);
    expect(clampCeilingHeight(-5)).toBe(7);
    expect(clampCeilingHeight(14.1)).toBe(14);
    expect(clampCeilingHeight(99)).toBe(14);
  });

  it('clampCeilingHeight uses 9 ft when the value is not a finite number', () => {
    expect(clampCeilingHeight(NaN)).toBe(9);
    expect(clampCeilingHeight(Infinity)).toBe(9);
    expect(clampCeilingHeight(-Infinity)).toBe(9);
    expect(clampCeilingHeight(undefined as unknown as number)).toBe(9);
  });
});

describe('elevation geometry: invalid and clamped input', () => {
  it('a valid request is not reported as adjusted', () => {
    expect(build(12, 15, [SOFA], 'top', 9).inputsAdjusted).toBe(false);
    expect(build(4, 50, [SOFA], 'top', 7).inputsAdjusted).toBe(false);
    expect(build(50, 50, [], 'top', 14).inputsAdjusted).toBe(false);
  });

  it('room sizes outside 4 to 50 ft are clamped and reported', () => {
    const g = build(2, 80, [], 'top');
    expect(g.roomWidthFt).toBe(4);
    expect(g.roomLengthFt).toBe(50);
    expect(g.inputsAdjusted).toBe(true);
    expectAllFinite(g);
  });

  it('NaN, Infinity and negative room sizes never leak through', () => {
    for (const bad of [NaN, Infinity, -Infinity, -5, 0]) {
      const g = build(bad, bad, [SOFA, TABLE], 'top');
      expect(g.roomWidthFt).toBeGreaterThanOrEqual(4);
      expect(g.roomWidthFt).toBeLessThanOrEqual(50);
      expect(g.roomLengthFt).toBeGreaterThanOrEqual(4);
      expect(g.roomLengthFt).toBeLessThanOrEqual(50);
      expect(g.inputsAdjusted).toBe(true);
      expectAllFinite(g);
    }
  });

  it('a missing room size falls back to the default room', () => {
    const g = build(NaN, NaN, [], 'top');
    expect(g.roomWidthFt).toBe(DEFAULT_ROOM_WIDTH_FT);
    expect(g.roomLengthFt).toBe(DEFAULT_ROOM_LENGTH_FT);
  });

  it('a ceiling height outside 7 to 14 ft is clamped and reported', () => {
    const low = build(12, 15, [], 'top', 3);
    const high = build(12, 15, [], 'top', 30);
    expect(low.ceilingHeightFt).toBe(7);
    expect(high.ceilingHeightFt).toBe(14);
    expect(low.inputsAdjusted).toBe(true);
    expect(high.inputsAdjusted).toBe(true);
  });

  it('a missing ceiling height uses 9 ft without being reported as an error', () => {
    const g = build(12, 15, [], 'top');
    expect(g.ceilingHeightFt).toBe(9);
    expect(g.inputsAdjusted).toBe(false);
  });

  it('NaN and Infinity ceiling heights are corrected to the default and reported', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const g = build(12, 15, [], 'top', bad);
      expect(g.ceilingHeightFt).toBe(9);
      expect(g.inputsAdjusted).toBe(true);
    }
  });

  it('an unknown wall is treated as the top wall and reported', () => {
    const g = build(12, 15, [SOFA], 'nowhere' as ElevationWall);
    expect(g.wall).toBe('top');
    expect(g.inputsAdjusted).toBe(true);
    expect(g.pieces.length).toBe(1);
  });

  it('positions beyond the room are pulled back inside it', () => {
    const outside = piece('o', 'sofa', 7, 3, 500, -40);
    for (const wall of ['top', 'bottom', 'left', 'right'] as const) {
      const g = build(12, 15, [outside], wall);
      const p = g.pieces[0];
      expect(p.startFt).toBeGreaterThanOrEqual(0);
      expect(p.endFt).toBeLessThanOrEqual(g.wallLengthFt);
      expect(p.distanceFromWallFt).toBeGreaterThanOrEqual(0);
      expect(p.leftPct).toBeGreaterThanOrEqual(0);
      expect(p.leftPct + p.widthPct).toBeLessThanOrEqual(100.0001);
      expectAllFinite(g);
    }
    // x = 500% clamps to the right edge of a 12 ft room: the sofa covers 5 to 12 ft.
    expect(build(12, 15, [outside], 'top').pieces[0].startFt).toBeCloseTo(5, 3);
    // y = -40% clamps to the top wall.
    expect(build(12, 15, [outside], 'top').pieces[0].distanceFromWallFt).toBe(0);
  });

  it('NaN and Infinity positions count as the top-left corner', () => {
    const lost = piece('n', 'chair', 2, 2, NaN, Infinity);
    const g = build(12, 15, [lost], 'top');
    expect(g.pieces[0].startFt).toBe(0);
    expectAllFinite(g);
    for (const wall of ['bottom', 'left', 'right'] as const) {
      expectAllFinite(build(12, 15, [lost], wall));
    }
  });

  it('pieces with no usable size are skipped and counted, not drawn', () => {
    const items = [
      piece('zero', 'chair', 0, 2, 10, 10),
      piece('neg', 'chair', 2, -2, 10, 10),
      piece('nan', 'chair', NaN, 2, 10, 10),
      piece('inf', 'chair', 2, Infinity, 10, 10),
      SOFA,
    ];
    const g = build(12, 15, items, 'top');
    expect(g.pieces.map((p) => p.uid)).toEqual(['f-sofa-1']);
    expect(g.skippedCount).toBe(4);
    expectAllFinite(g);
  });

  it('a null entry in the list is skipped without throwing', () => {
    const g = build(12, 15, [null as unknown as ElevationItemInput, SOFA], 'top');
    expect(g.pieces.length).toBe(1);
    expect(g.skippedCount).toBe(1);
  });

  it('a missing item list is treated as empty', () => {
    const g = buildElevationGeometry(
      { roomWidthFt: 12, roomLengthFt: 15, items: undefined as unknown as ElevationItemInput[] },
      'top'
    );
    expect(g.pieces).toEqual([]);
    expectAllFinite(g);
  });

  it('a missing request is handled as an empty default room', () => {
    const g = buildElevationGeometry(undefined as unknown as never, 'top');
    expect(g.roomWidthFt).toBe(DEFAULT_ROOM_WIDTH_FT);
    expect(g.pieces).toEqual([]);
    expect(g.inputsAdjusted).toBe(true);
    expectAllFinite(g);
  });

  it('a piece taller than the ceiling is cut to the ceiling', () => {
    const tall = piece('t', 'wardrobe', 6, 2, 0, 0); // 7 ft tall
    const g = build(12, 15, [tall], 'top', 7);
    expect(g.pieces[0].heightFt).toBeLessThanOrEqual(7);
    expect(g.pieces[0].heightPct).toBeLessThanOrEqual(100);
  });

  it('never returns NaN or Infinity across a sweep of rooms, walls and awkward values', () => {
    const awkward = [-1e9, -1, 0, 0.0001, 3.999, 4, 12, 50, 50.001, 1e9, NaN, Infinity, -Infinity];
    const items = [
      piece('a', 'sofa', 7, 3, 20, 8),
      piece('b', 'bed', 6.5, 5, 99, 99),
      piece('c', 'chair', 2.5, 2.5, -10, 140),
    ];
    for (const w of awkward) {
      for (const l of awkward) {
        for (const h of [undefined, ...awkward]) {
          for (const wall of ['top', 'bottom', 'left', 'right'] as const) {
            const g = build(w, l, items, wall, h);
            expectAllFinite(g);
            expect(g.roomWidthFt).toBeGreaterThanOrEqual(4);
            expect(g.roomLengthFt).toBeLessThanOrEqual(50);
            expect(g.ceilingHeightFt).toBeGreaterThanOrEqual(7);
            expect(g.ceilingHeightFt).toBeLessThanOrEqual(14);
            for (const p of g.pieces) {
              expect(p.leftPct).toBeGreaterThanOrEqual(0);
              expect(p.leftPct + p.widthPct).toBeLessThanOrEqual(100.0001);
              expect(p.heightPct).toBeLessThanOrEqual(100);
            }
          }
        }
      }
    }
  });

  it('does not change the input it was given', () => {
    const items = [piece('a', 'sofa', 7, 3, 20, 8)];
    const before = JSON.stringify(items);
    build(12, 15, items, 'left');
    expect(JSON.stringify(items)).toBe(before);
  });
});
