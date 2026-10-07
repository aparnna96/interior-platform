/**
 * Texture / pattern finishes for the Visualizer.
 *
 * Framework-free data and lookups, like the geometry helper. A pattern is a
 * CSS background (layered gradients) that sits over the swatch colour, so
 * colour and texture are chosen independently and nothing is downloaded.
 *
 * - `image` / `size` are what the drawing views apply (null = no texture).
 * - `preview` / `previewSize` are what the small chips show.
 * - The default for each kind reproduces today's look: walls and fabric stay
 *   flat, and the floor keeps the texture its own swatch already carries
 *   ("classic"), so nothing changes until someone picks another texture.
 * - Fabric textures are drawn in the views with SVG patterns (gradients cannot
 *   fill SVG shapes). Their ids here must match the ids in
 *   fabric-pattern-defs.component.ts.
 */

export type FinishKind = 'wall' | 'floor' | 'fabric';

export interface FinishPattern {
  id: string;
  name: string;
  kind: FinishKind;
  /** CSS background-image for the drawing views, or null for none. */
  image: string | null;
  /** CSS background-size that goes with `image`, or null. */
  size: string | null;
  /** CSS background-image for the chip thumbnail, or null for flat colour. */
  preview: string | null;
  previewSize: string | null;
}

const dots = (dark: number, light: number): string =>
  `radial-gradient(rgba(0,0,0,${dark}) 1px, transparent 1.3px), radial-gradient(rgba(255,255,255,${light}) 1px, transparent 1.3px)`;

function pattern(
  kind: FinishKind,
  id: string,
  name: string,
  image: string | null,
  size: string | null,
  preview: string | null = image,
  previewSize: string | null = size
): FinishPattern {
  return { id, name, kind, image, size, preview, previewSize };
}

const PLANK = 'repeating-linear-gradient(90deg, rgba(60,35,10,0.16) 0 1px, transparent 1px 26px), repeating-linear-gradient(0deg, rgba(60,35,10,0.09) 0 1px, transparent 1px 110px)';
const HERRINGBONE = 'repeating-linear-gradient(45deg, rgba(60,35,10,0.14) 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, rgba(60,35,10,0.14) 0 1px, transparent 1px 9px)';
const TILE = 'linear-gradient(rgba(0,0,0,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.18) 1px, transparent 1px)';
// What the floor swatches look like today (used only for the "classic" chip).
const CLASSIC_PREVIEW = 'repeating-linear-gradient(90deg, rgba(60,35,10,0.12) 0 1px, transparent 1px 7px), linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.05))';

export const WALL_PATTERNS: readonly FinishPattern[] = [
  pattern('wall', 'plain', 'Plain', null, null),
  pattern('wall', 'plaster', 'Plaster', dots(0.05, 0.35), '7px 7px, 11px 11px'),
  pattern('wall', 'slats', 'Slats', 'repeating-linear-gradient(90deg, rgba(0,0,0,0.11) 0 2px, transparent 2px 14px)', null),
  pattern('wall', 'stripe', 'Stripe', 'repeating-linear-gradient(90deg, rgba(255,255,255,0.38) 0 10px, rgba(0,0,0,0.045) 10px 20px)', null),
];

export const FLOOR_PATTERNS: readonly FinishPattern[] = [
  pattern('floor', 'classic', 'Classic', null, null, CLASSIC_PREVIEW, null),
  pattern('floor', 'plank', 'Plank', PLANK, null, PLANK, '100% 100%, 100% 100%'),
  pattern('floor', 'herringbone', 'Herringbone', HERRINGBONE, null),
  pattern('floor', 'tile', 'Tile', TILE, '34px 34px', TILE, '14px 14px'),
  pattern('floor', 'concrete', 'Concrete', dots(0.07, 0.2), '9px 9px, 13px 13px'),
];

export const FABRIC_PATTERNS: readonly FinishPattern[] = [
  pattern('fabric', 'plain', 'Plain', null, null),
  pattern(
    'fabric', 'weave', 'Weave', null, null,
    'repeating-linear-gradient(0deg, rgba(0,0,0,0.10) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(255,255,255,0.30) 0 1px, transparent 1px 4px)', null
  ),
  pattern('fabric', 'boucle', 'Bouclé', null, null, dots(0.16, 0.5), '5px 5px, 7px 7px'),
  pattern(
    'fabric', 'velvet', 'Velvet', null, null,
    'repeating-linear-gradient(135deg, rgba(0,0,0,0.07) 0 1px, transparent 1px 3px), linear-gradient(180deg, rgba(255,255,255,0.22), rgba(0,0,0,0.10))', null
  ),
  pattern(
    'fabric', 'linen', 'Linen', null, null,
    'repeating-linear-gradient(0deg, rgba(0,0,0,0.10) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,0.04) 0 1px, transparent 1px 11px)', null
  ),
];

export const DEFAULT_PATTERN_ID: Readonly<Record<FinishKind, string>> = {
  wall: 'plain',
  floor: 'classic',
  fabric: 'plain',
};

const BY_KIND: Readonly<Record<FinishKind, readonly FinishPattern[]>> = {
  wall: WALL_PATTERNS,
  floor: FLOOR_PATTERNS,
  fabric: FABRIC_PATTERNS,
};

export function patternsFor(kind: FinishKind): readonly FinishPattern[] {
  return BY_KIND[kind] ?? [];
}

/** The pattern with this id, or the kind's default when the id is unknown or missing. */
export function findPattern(kind: FinishKind, id: string | null | undefined): FinishPattern {
  const list = patternsFor(kind);
  return list.find((p) => p.id === id) ?? list.find((p) => p.id === DEFAULT_PATTERN_ID[kind]) ?? list[0];
}
