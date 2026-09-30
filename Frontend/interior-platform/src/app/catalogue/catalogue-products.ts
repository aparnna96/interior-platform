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
