/**
 * Catalogue demo data (Pillar 2).
 *
 * Framework-free: plain types, constants and a pure filter helper.
 * All data is local demo content — no backend, no HTTP.
 *
 * Discovery is room-oriented (Living Room, Bedroom, Dining, Workspace).
 * Each product keeps its furniture `category` for display.
 *
 * ── Demo photography ──────────────────────────────────────────────
 * Product images are temporary DEMO photographs served from Pexels
 * (free stock, Pexels licence). Every external URL is centralised here
 * through the `px()` helper so company-owned product images can replace
 * them later without touching templates or styles.
 *
 * Source photo pages (one per product, all verified live):
 * - Aria sofa:      https://www.pexels.com/photo/13086783/
 * - Sona loveseat:  https://www.pexels.com/photo/1571471/
 * - Haven bed:      https://www.pexels.com/photo/271624/
 * - Nimbus bed:     https://www.pexels.com/photo/90319/
 * - Terra table:    https://www.pexels.com/photo/7607461/
 * - Kraft desk:     https://www.pexels.com/photo/373904/
 * - Milo chairs:    https://www.pexels.com/photo/8113029/
 * - Oslo wardrobe:  https://www.pexels.com/photo/7061419/
 * - Featured hero:  https://www.pexels.com/photo/1571460/
 */

export type CatalogueCategory = 'Sofas' | 'Beds' | 'Tables' | 'Chairs' | 'Wardrobes';

export type RoomFilter = 'All' | 'Living Room' | 'Bedroom' | 'Dining' | 'Workspace';

export interface CatalogueProduct {
  id: string;
  name: string;
  category: CatalogueCategory;
  room: Exclude<RoomFilter, 'All'>;
  /** Demo price in INR (whole rupees). */
  price: number;
  /** Short material/style descriptor, e.g. "Bouclé · Warm Beige". */
  finish: string;
  blurb: string;
  details: string[];
  /** Subtle tint shown behind the photo while it loads. */
  swatch: string;
  /**
   * Demo product photography (centralised Pexels URL — see file header).
   * Replace with the company-owned product image when available.
   */
  image: string;
  /** Primary upholstery / construction material, e.g. "Performance Bouclé". */
  material: string;
  /** Physical size, e.g. "220 × 92 × 82 cm". */
  dimensions: string;
  /** One or two editorial sentences for the detail view. */
  description: string;
}

export interface FeaturedCollection {
  eyebrow: string;
  title: string;
  standfirst: string;
  copy: string;
  ctaLabel: string;
  targetRoom: Exclude<RoomFilter, 'All'>;
  image: string;
  imageAlt: string;
  meta: string[];
}

/** Centralised Pexels CDN builder — keeps every demo URL in this file. */
function px(id: number, w = 900): string {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;
}

export const ROOMS: RoomFilter[] = ['All', 'Living Room', 'Bedroom', 'Dining', 'Workspace'];

export const FEATURED_COLLECTION: FeaturedCollection = {
  eyebrow: 'New Collection',
  title: 'Warm Minimal',
  standfirst: 'Natural materials, soft forms and quiet tones for slow living.',
  copy: 'Eight considered pieces in oak, bouclé and washed cotton — designed to sit together across living, sleep and work spaces.',
  ctaLabel: 'Explore Living Room',
  targetRoom: 'Living Room',
  image: px(1571460, 1260),
  imageAlt: 'Warm minimal living room with a neutral sofa and wooden staircase',
  meta: ['8 pieces', 'Oak · Bouclé · Cotton', 'New season'],
};

export const PRODUCTS: CatalogueProduct[] = [
  {
    id: 'aria-3s-sofa',
    name: 'Aria 3-Seater Fabric Sofa',
    category: 'Sofas',
    room: 'Living Room',
    price: 42999,
    finish: 'Bouclé · Warm Beige',
    blurb: 'Deep-seat bouclé sofa on solid wood legs for everyday lounging.',
    details: ['Bouclé cream upholstery', '7.0 × 3.0 ft · solid wood frame', 'Removable, washable covers'],
    swatch: '#ece1d1',
    image: px(13086783),
    material: 'Performance Bouclé',
    dimensions: '220 × 92 × 82 cm',
    description:
      'A generous three-seater wrapped in looped wool-blend bouclé. Deep feather-top cushions and tapered solid-wood legs keep it relaxed yet tailored.',
  },
  {
    id: 'sona-loveseat',
    name: 'Sona 2-Seater Loveseat',
    category: 'Sofas',
    room: 'Living Room',
    price: 28499,
    finish: 'Weave · Terracotta',
    blurb: 'Compact terracotta-weave loveseat sized for apartments.',
    details: ['Terracotta woven fabric', '5.0 × 2.8 ft · kiln-dried frame', 'High-resilience foam cushions'],
    swatch: '#c98a64',
    image: px(1571471),
    material: 'Woven Cotton Blend',
    dimensions: '152 × 86 × 84 cm',
    description:
      'A compact two-seater in a warm terracotta weave, proportioned for apartments and reading corners without giving up lounge depth.',
  },
  {
    id: 'haven-queen-bed',
    name: 'Haven Queen Storage Bed',
    category: 'Beds',
    room: 'Bedroom',
    price: 38999,
    finish: 'Oak · Natural Finish',
    blurb: 'Queen bed with box storage in a natural oak finish.',
    details: ['Oak veneer · natural finish', '6.5 × 5.0 ft · hydraulic box storage', 'Beige cushioned headboard'],
    swatch: '#d9c49a',
    image: px(271624),
    material: 'Oak Veneer · Engineered Wood',
    dimensions: '198 × 160 × 110 cm',
    description:
      'A calm queen bed in natural oak with full hydraulic box storage and a softly padded headboard in washed beige cotton.',
  },
  {
    id: 'nimbus-king-bed',
    name: 'Nimbus King Platform Bed',
    category: 'Beds',
    room: 'Bedroom',
    price: 46999,
    finish: 'Oak · Oat Milk',
    blurb: 'Low-profile king platform bed in oat milk and oak tones.',
    details: ['Oat milk + natural oak finish', '6.5 × 6.0 ft · no box spring needed', 'Silent slat support system'],
    swatch: '#e4d7c0',
    image: px(90319),
    material: 'Solid Wood · Upholstered Headboard',
    dimensions: '208 × 190 × 105 cm',
    description:
      'A low-profile king platform in oat-milk lacquer and solid oak. Silent slatted base means no box spring and no creaks.',
  },
  {
    id: 'terra-coffee-table',
    name: 'Terra Solid Wood Coffee Table',
    category: 'Tables',
    room: 'Living Room',
    price: 12999,
    finish: 'Solid Wood · Honey',
    blurb: 'Honey-finish centre table with a lower display shelf.',
    details: ['Solid honey-finish wood', '4.0 × 2.5 ft · 16 in height', 'Scratch-resistant matte top'],
    swatch: '#bd925f',
    image: px(7607461),
    material: 'Solid Mango Wood',
    dimensions: '110 × 60 × 40 cm',
    description:
      'A solid mango-wood centre table in a warm honey stain, with an open lower shelf for books and a matte, scratch-resistant top.',
  },
  {
    id: 'kraft-study-table',
    name: 'Kraft Foldable Study Table',
    category: 'Tables',
    room: 'Workspace',
    price: 9999,
    finish: 'Oak · Natural',
    blurb: 'Space-saving foldable desk for compact home offices.',
    details: ['Natural oak finish', '4.0 × 2.0 ft · wall-mount foldable', 'Load rated up to 40 kg'],
    swatch: '#c9a87c',
    image: px(373904),
    material: 'Engineered Wood · Oak Finish',
    dimensions: '120 × 60 × 75 cm',
    description:
      'A foldable study desk in natural oak that mounts to the wall and folds flat. Full-size work surface rated to 40 kg for daily use.',
  },
  {
    id: 'milo-dining-chair',
    name: 'Milo Dining Chair — Set of 2',
    category: 'Chairs',
    room: 'Dining',
    price: 14499,
    finish: 'Velvet · Slate',
    blurb: 'Pair of slate-velvet dining chairs with tapered wood legs.',
    details: ['Slate velvet upholstery · set of 2', 'Dining height · tapered wood legs', 'Wipe-clean velvet, floor glides'],
    swatch: '#6b7280',
    image: px(8113029),
    material: 'Cotton Velvet · Solid Wood',
    dimensions: '48 × 52 × 82 cm (each)',
    description:
      'A pair of dining chairs in slate cotton-velvet with tapered solid-wood legs. Wipe-clean pile and floor glides included.',
  },
  {
    id: 'oslo-wardrobe',
    name: 'Oslo 6-Door Wardrobe',
    category: 'Wardrobes',
    room: 'Bedroom',
    price: 54999,
    finish: 'Ash · Light, Mirror Shutters',
    blurb: 'Light-ash wardrobe with mirrored shutters and loft box.',
    details: ['Light ash finish + mirror', '6.0 × 2.0 ft · soft-close hinges', 'Locker, drawers + loft storage'],
    swatch: '#dcc7a2',
    image: px(7061419),
    material: 'Engineered Wood · Mirror Glass',
    dimensions: '240 × 60 × 210 cm',
    description:
      'A six-door wardrobe in light ash with full-length mirror shutters, soft-close hinges, and a split locker–drawer–loft interior.',
  },
];

/**
 * Pure product filter: matches room exactly (unless 'All') and matches
 * the query (case-insensitive, trimmed) against name, category, room,
 * material, blurb and finish. Empty query restores all products in room.
 */
export function filterProducts(
  products: CatalogueProduct[],
  query: string,
  room: RoomFilter
): CatalogueProduct[] {
  const q = query.trim().toLowerCase();
  return products.filter((p) => {
    if (room !== 'All' && p.room !== room) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.room.toLowerCase().includes(q) ||
      p.material.toLowerCase().includes(q) ||
      p.blurb.toLowerCase().includes(q) ||
      p.finish.toLowerCase().includes(q)
    );
  });
}
