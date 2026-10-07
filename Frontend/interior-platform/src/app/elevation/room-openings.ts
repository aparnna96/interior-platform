import { clampCeilingHeight, ElevationWall } from './elevation-geometry';

/**
 * The window and door the elevation draws. Framework-free and pure, like the
 * geometry helper.
 *
 * The 2D plan already shows a window on its top edge and a door at the bottom
 * right. There is no room data behind them, so the elevation uses the same
 * fixed layout at real-world sizes:
 *
 * - top wall: one window, centred along the wall.
 * - bottom wall: one door, 4% in from the plan's right edge. Seen from inside
 *   the room that is the LEFT of the bottom wall, because the bottom wall is
 *   mirrored (see the module notes in elevation-geometry.ts).
 * - left and right walls: plain.
 *
 * These are drawing aids only. They are not saved and do not affect the estimate.
 */

export type OpeningKind = 'window' | 'door';

export interface ElevationOpening {
  kind: OpeningKind;
  /** Left edge along the wall, in feet from the left of the view. */
  startFt: number;
  widthFt: number;
  /** Height of the bottom edge above the floor. */
  bottomFt: number;
  heightFt: number;
  leftPct: number;
  widthPct: number;
  bottomPct: number;
  heightPct: number;
}

export const WINDOW_WIDTH_FT = 4;
export const WINDOW_SILL_FT = 3;
export const WINDOW_HEIGHT_FT = 4;
export const DOOR_WIDTH_FT = 3;
export const DOOR_HEIGHT_FT = 6.75;
/** Clear space kept above a window / door and beside a door. */
const HEAD_CLEARANCE_FT = 0.75;
const DOOR_HEAD_CLEARANCE_FT = 0.5;
const DOOR_SIDE_CLEARANCE_FT = 0.5;
/** The plan puts the door this far in from its right edge. */
const DOOR_INSET_FRACTION = 0.04;

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toOpening(
  kind: OpeningKind,
  startFt: number,
  widthFt: number,
  bottomFt: number,
  heightFt: number,
  wallLengthFt: number,
  ceilingHeightFt: number
): ElevationOpening {
  return {
    kind,
    startFt: round4(startFt),
    widthFt: round4(widthFt),
    bottomFt: round4(bottomFt),
    heightFt: round4(heightFt),
    leftPct: round4((startFt / wallLengthFt) * 100),
    widthPct: round4((widthFt / wallLengthFt) * 100),
    bottomPct: round4((bottomFt / ceilingHeightFt) * 100),
    heightPct: round4((heightFt / ceilingHeightFt) * 100),
  };
}

/**
 * The openings to draw on one wall. An unknown wall, or a wall length that is
 * not a positive finite number, has none. The ceiling height is clamped to 7 to 14 ft.
 */
export function openingsForWall(
  wall: ElevationWall,
  wallLengthFt: number,
  ceilingHeightFt: number
): ElevationOpening[] {
  if (typeof wallLengthFt !== 'number' || !Number.isFinite(wallLengthFt) || wallLengthFt <= 0) return [];
  const ceiling = clampCeilingHeight(ceilingHeightFt);

  if (wall === 'top') {
    const width = Math.min(WINDOW_WIDTH_FT, wallLengthFt * 0.5);
    const height = Math.min(WINDOW_HEIGHT_FT, ceiling - WINDOW_SILL_FT - HEAD_CLEARANCE_FT);
    return [toOpening('window', (wallLengthFt - width) / 2, width, WINDOW_SILL_FT, height, wallLengthFt, ceiling)];
  }

  if (wall === 'bottom') {
    const width = Math.min(DOOR_WIDTH_FT, Math.max(wallLengthFt - 2 * DOOR_SIDE_CLEARANCE_FT, 0));
    if (width <= 0) return [];
    const height = Math.min(DOOR_HEIGHT_FT, ceiling - DOOR_HEAD_CLEARANCE_FT);
    const start = clamp(
      wallLengthFt * DOOR_INSET_FRACTION,
      DOOR_SIDE_CLEARANCE_FT,
      Math.max(wallLengthFt - width - DOOR_SIDE_CLEARANCE_FT, DOOR_SIDE_CLEARANCE_FT)
    );
    return [toOpening('door', start, width, 0, height, wallLengthFt, ceiling)];
  }

  return [];
}
