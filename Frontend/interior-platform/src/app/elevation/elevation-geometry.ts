/**
 * Wall-elevation geometry for the Visualizer.
 *
 * Framework-free: no Angular, no signals, no services, no HTTP, no DOM.
 * Pure functions of explicit inputs only, so the maths is deterministic and
 * easy to test. A renderer only has to draw what this returns.
 *
 * Coordinate model (the same one the 2D plan uses):
 * - The room is `roomWidthFt` (left to right) by `roomLengthFt` (top to bottom).
 * - A piece sits at `x` / `y`, the percentage of the room width / length to its
 *   top-left corner, and covers `w` feet across and `l` feet down. Rotating a
 *   piece in the app swaps `w` and `l`, so this module just reads them as given.
 *
 * An elevation looks at one wall from inside the room, as if standing in the
 * middle of the room facing that wall:
 *
 *   wall     facing   left-to-right along the wall   distance from the wall
 *   top      north    x grows to the right            y (top edge of the piece)
 *   bottom   south    x grows to the LEFT             length - (bottom edge)
 *   left     west     y grows to the LEFT             x (left edge of the piece)
 *   right    east     y grows to the right            width - (right edge)
 *
 * "Grows to the left" is the mirroring: on the bottom and left walls the
 * plan's axis runs backwards when seen from the room.
 *
 * Pieces are returned back to front. The piece nearest the wall is furthest
 * from the viewer, so it comes first and is drawn first; later pieces overlap
 * earlier ones the way they would in front of the wall.
 */

export type ElevationWall = 'top' | 'bottom' | 'left' | 'right';

export const ELEVATION_WALLS: readonly { readonly id: ElevationWall; readonly label: string }[] = [
  { id: 'top', label: 'Top wall' },
  { id: 'right', label: 'Right wall' },
  { id: 'bottom', label: 'Bottom wall' },
  { id: 'left', label: 'Left wall' },
];

/** Room limits match the Visualizer's own validation (4 to 50 ft). */
export const MIN_ROOM_DIMENSION_FT = 4;
export const MAX_ROOM_DIMENSION_FT = 50;
/** Used when a room dimension is missing or not a finite number. */
export const DEFAULT_ROOM_WIDTH_FT = 12;
export const DEFAULT_ROOM_LENGTH_FT = 15;

export const MIN_CEILING_HEIGHT_FT = 7;
export const MAX_CEILING_HEIGHT_FT = 14;
export const DEFAULT_CEILING_HEIGHT_FT = 9;

/**
 * Nominal heights by Visualizer piece. These are drawing heights only; they
 * are not saved with estimates and do not affect pricing.
 */
export const PIECE_HEIGHT_FT: ReadonlyMap<string, number> = new Map([
  ['bed', 3.5],
  ['wardrobe', 7],
  ['sofa', 3],
  ['table', 2.5],
  ['chair', 3],
]);
/** Height for a piece type that is not in the table. */
export const DEFAULT_PIECE_HEIGHT_FT = 3;

/** One placed piece, in the shape the Visualizer already keeps. */
export interface ElevationItemInput {
  uid: string;
  defId: string;
  /** Feet across the room (left to right). */
  w: number;
  /** Feet down the room (top to bottom). */
  l: number;
  /** Percent of room width to the left edge. */
  x: number;
  /** Percent of room length to the top edge. */
  y: number;
}

export interface ElevationInput {
  roomWidthFt: number;
  roomLengthFt: number;
  /** Optional; defaults to 9 ft. */
  ceilingHeightFt?: number;
  items: readonly ElevationItemInput[];
}

export interface ElevationPiece {
  uid: string;
  defId: string;
  /** Left edge along the wall, in feet from the left of the view. */
  startFt: number;
  /** Right edge along the wall, in feet from the left of the view. */
  endFt: number;
  /** Width in the view (endFt - startFt). */
  spanFt: number;
  /** How far the piece extends out from the wall. */
  depthFt: number;
  /** Gap between the wall and the piece's wall-side face. */
  distanceFromWallFt: number;
  /** Drawn height, from the floor up. */
  heightFt: number;
  /** startFt as a percentage of the wall length. */
  leftPct: number;
  /** spanFt as a percentage of the wall length. */
  widthPct: number;
  /** heightFt as a percentage of the ceiling height. */
  heightPct: number;
  /** Draw order: 0 is drawn first (furthest from the viewer). Also usable as z-index. */
  order: number;
  /** True when the piece is larger than the room and was cut down to fit. */
  clipped: boolean;
}

export interface ElevationGeometry {
  wall: ElevationWall;
  roomWidthFt: number;
  roomLengthFt: number;
  /** Width of the elevation: room width for top/bottom, room length for left/right. */
  wallLengthFt: number;
  ceilingHeightFt: number;
  /** wallLengthFt / ceilingHeightFt, for sizing the drawing frame. */
  aspectRatio: number;
  /** Back to front (see module notes). */
  pieces: ElevationPiece[];
  /** Pieces left out because their size was missing, zero, negative or not finite. */
  skippedCount: number;
  /** True when the room size, ceiling height or wall had to be corrected. */
  inputsAdjusted: boolean;
}

const WALL_IDS: readonly ElevationWall[] = ['top', 'bottom', 'left', 'right'];

/** Rounds away floating-point noise (2.4000000000000004) without visible change. */
function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isInRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * A room dimension inside 4 to 50 ft. Values that are not finite numbers use
 * `fallback`; finite values outside the range are pulled to the nearest limit.
 */
export function clampRoomDimension(value: number, fallback: number): number {
  const base = Number.isFinite(value) ? value : fallback;
  return round4(clamp(base, MIN_ROOM_DIMENSION_FT, MAX_ROOM_DIMENSION_FT));
}

/**
 * A ceiling height inside 7 to 14 ft. Values that are not finite numbers use
 * the 9 ft default; finite values outside the range are pulled to the nearest limit.
 */
export function clampCeilingHeight(value: number): number {
  const base = Number.isFinite(value) ? value : DEFAULT_CEILING_HEIGHT_FT;
  return round4(clamp(base, MIN_CEILING_HEIGHT_FT, MAX_CEILING_HEIGHT_FT));
}

function isPositiveFinite(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

interface Mapped {
  startFt: number;
  spanFt: number;
  distanceFt: number;
  depthFt: number;
}

/** Maps a footprint (feet from the room's top-left) onto one wall's view. */
function mapFootprint(
  wall: ElevationWall,
  room: { width: number; length: number },
  box: { x0: number; x1: number; y0: number; y1: number }
): Mapped {
  const fw = box.x1 - box.x0;
  const fl = box.y1 - box.y0;
  switch (wall) {
    case 'top':
      return { startFt: box.x0, spanFt: fw, distanceFt: box.y0, depthFt: fl };
    case 'bottom':
      return { startFt: room.width - box.x1, spanFt: fw, distanceFt: room.length - box.y1, depthFt: fl };
    case 'left':
      return { startFt: room.length - box.y1, spanFt: fl, distanceFt: box.x0, depthFt: fw };
    case 'right':
      return { startFt: box.y0, spanFt: fl, distanceFt: room.width - box.x1, depthFt: fw };
  }
}

/**
 * Builds the elevation of one wall. Never throws and never returns NaN or
 * Infinity: bad room sizes, ceiling heights and walls are corrected (and
 * `inputsAdjusted` says so), bad positions are clamped into the room, and
 * pieces with no usable size are left out (and counted in `skippedCount`).
 */
export function buildElevationGeometry(input: ElevationInput, wall: ElevationWall): ElevationGeometry {
  const roomWidthFt = clampRoomDimension(input?.roomWidthFt, DEFAULT_ROOM_WIDTH_FT);
  const roomLengthFt = clampRoomDimension(input?.roomLengthFt, DEFAULT_ROOM_LENGTH_FT);
  const ceilingRaw = input?.ceilingHeightFt ?? DEFAULT_CEILING_HEIGHT_FT;
  const ceilingHeightFt = clampCeilingHeight(ceilingRaw);
  const wallIsValid = WALL_IDS.includes(wall);
  const safeWall: ElevationWall = wallIsValid ? wall : 'top';

  const inputsAdjusted =
    !isInRange(input?.roomWidthFt, MIN_ROOM_DIMENSION_FT, MAX_ROOM_DIMENSION_FT) ||
    !isInRange(input?.roomLengthFt, MIN_ROOM_DIMENSION_FT, MAX_ROOM_DIMENSION_FT) ||
    !isInRange(ceilingRaw, MIN_CEILING_HEIGHT_FT, MAX_CEILING_HEIGHT_FT) ||
    !wallIsValid;

  const wallLengthFt = safeWall === 'top' || safeWall === 'bottom' ? roomWidthFt : roomLengthFt;
  const room = { width: roomWidthFt, length: roomLengthFt };

  const items = Array.isArray(input?.items) ? input.items : [];
  let skippedCount = 0;

  interface Candidate {
    item: ElevationItemInput;
    index: number;
    mapped: Mapped;
    clipped: boolean;
  }
  const candidates: Candidate[] = [];

  items.forEach((item, index) => {
    if (!item || !isPositiveFinite(item.w) || !isPositiveFinite(item.l)) {
      skippedCount += 1;
      return;
    }
    // A piece bigger than the room is cut down to the room so it stays on the wall.
    const fw = round4(Math.min(item.w, roomWidthFt));
    const fl = round4(Math.min(item.l, roomLengthFt));
    const clipped = item.w > roomWidthFt || item.l > roomLengthFt;

    // Positions that are not numbers count as 0; everything is kept inside the room.
    const px = Number.isFinite(item.x) ? item.x : 0;
    const py = Number.isFinite(item.y) ? item.y : 0;
    const x0 = round4(clamp((px / 100) * roomWidthFt, 0, roomWidthFt - fw));
    const y0 = round4(clamp((py / 100) * roomLengthFt, 0, roomLengthFt - fl));
    const box = { x0, x1: round4(x0 + fw), y0, y1: round4(y0 + fl) };

    candidates.push({ item, index, mapped: mapFootprint(safeWall, room, box), clipped });
  });

  // Back to front: nearest the wall first. A deeper piece reaches further toward
  // the viewer, so on a tie it goes later. Equal pieces keep their input order.
  candidates.sort(
    (a, b) =>
      a.mapped.distanceFt - b.mapped.distanceFt ||
      a.mapped.distanceFt + a.mapped.depthFt - (b.mapped.distanceFt + b.mapped.depthFt) ||
      a.index - b.index
  );

  const pieces: ElevationPiece[] = candidates.map((c, order) => {
    const startFt = round4(clamp(c.mapped.startFt, 0, wallLengthFt));
    const endFt = round4(clamp(c.mapped.startFt + c.mapped.spanFt, startFt, wallLengthFt));
    const spanFt = round4(endFt - startFt);
    const baseHeight = PIECE_HEIGHT_FT.get(c.item.defId) ?? DEFAULT_PIECE_HEIGHT_FT;
    const heightFt = round4(Math.min(baseHeight, ceilingHeightFt));
    const leftPct = round4((startFt / wallLengthFt) * 100);
    const widthPct = round4(Math.min((spanFt / wallLengthFt) * 100, 100 - leftPct));
    return {
      uid: c.item.uid,
      defId: c.item.defId,
      startFt,
      endFt,
      spanFt,
      depthFt: round4(c.mapped.depthFt),
      distanceFromWallFt: round4(c.mapped.distanceFt),
      heightFt,
      leftPct,
      widthPct,
      heightPct: round4((heightFt / ceilingHeightFt) * 100),
      order,
      clipped: c.clipped,
    };
  });

  return {
    wall: safeWall,
    roomWidthFt,
    roomLengthFt,
    wallLengthFt,
    ceilingHeightFt,
    aspectRatio: round4(wallLengthFt / ceilingHeightFt),
    pieces,
    skippedCount,
    inputsAdjusted,
  };
}
