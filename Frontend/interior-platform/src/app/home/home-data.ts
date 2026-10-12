/**
 * Home page demo content.
 *
 * All imagery is temporary DEMO photography from Pexels (free stock,
 * Pexels licence), centralised here through the `px()` helper so
 * company-owned photographs can replace them later without touching
 * templates or styles.
 *
 * Furniture is NOT duplicated here — featured products are referenced by
 * catalogue id and resolved from `catalogue-products.ts` at runtime.
 *
 * Source photo pages (all verified live):
 * - Hero (Scandinavian living room): https://www.pexels.com/photo/1571453/
 * - Living Room space:               https://www.pexels.com/photo/276583/
 * - Bedroom space:                   https://www.pexels.com/photo/164595/
 * - Kitchen space:                   https://www.pexels.com/photo/7045356/
 * - Dining space:                    https://www.pexels.com/photo/3935321/
 * - Design section (workspace desk): https://www.pexels.com/photo/373904/
 * - Modern Living showcase:          https://www.pexels.com/photo/1571460/
 * - Contemporary Kitchen showcase:   https://www.pexels.com/photo/6969875/
 * - Warm Bedroom showcase:           https://www.pexels.com/photo/90319/
 * - Minimal Dining showcase:         https://www.pexels.com/photo/1080696/
 */

/** Views the Home page may navigate to (existing activeView mechanism). */
export type HomeDestination = 'catalogue' | 'visualizer' | 'estimates' | 'interiors';

/** Centralised Pexels CDN builder — keeps every demo URL in this file. */
function px(id: number, w = 900): string {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;
}

export interface HomeImage {
  image: string;
  imageAlt: string;
}

export interface SpaceTile extends HomeImage {
  name: 'Living Room' | 'Bedroom' | 'Kitchen' | 'Dining';
  blurb: string;
  destination: HomeDestination;
}

export interface ShowcaseItem extends HomeImage {
  label: string;
  note: string;
}

export interface NumberedStep {
  title: string;
  text: string;
}

export const HERO = {
  eyebrow: 'Confident Group · Home',
  title: 'Design your space',
  standfirst: 'Interiors, furniture and tools to bring your space together.',
  points: [
    'Explore interiors room by room',
    'Shop furniture made for modern homes',
    'Design your room in 2D',
    'Get an area-based estimate',
  ],
  /** Autoplay hero slides — one scene per slide, no repeats. */
  slides: [
    {
      image: px(1571453, 2000),
      imageAlt: 'Elegant Scandinavian-style living room with a modern grey sofa',
    },
    {
      image: px(6969875, 2000),
      imageAlt: 'Sleek kitchen with white cabinets, black countertops and an island',
    },
    {
      image: px(90319, 2000),
      imageAlt: 'Elegant bedroom with modern furniture and soft lighting',
    },
    {
      image: px(3935321, 2000),
      imageAlt: 'Spacious dining room with wooden furniture and natural light',
    },
    {
      image: px(1571460, 2000),
      imageAlt: 'Warm minimal living room with a neutral sofa and wooden staircase',
    },
  ],
};

export const SPACES: SpaceTile[] = [
  {
    name: 'Living Room',
    blurb: 'Sofas, centre tables and relaxed layouts.',
    image: px(276583, 1200),
    imageAlt: 'Contemporary living room with a sectional sofa',
    destination: 'interiors',
  },
  {
    name: 'Bedroom',
    blurb: 'Beds, wardrobes and calm storage.',
    image: px(164595, 1200),
    imageAlt: 'Cozy modern bedroom with soft lighting',
    destination: 'interiors',
  },
  {
    name: 'Kitchen',
    blurb: 'Cabinets, counters and dining corners.',
    image: px(7045356, 1200),
    imageAlt: 'Stylish kitchen with wooden cabinets and black accents',
    destination: 'interiors',
  },
  {
    name: 'Dining',
    blurb: 'Tables and chairs for gathering.',
    image: px(3935321, 1200),
    imageAlt: 'Spacious dining room with wooden furniture and natural light',
    destination: 'interiors',
  },
];

/** Catalogue ids featured on the Home page (resolved from catalogue data). */
export const FEATURED_PRODUCT_IDS = [
  'aria-3s-sofa',
  'haven-queen-bed',
  'terra-coffee-table',
  'oslo-wardrobe',
];

export const DESIGN_IMAGE: HomeImage = {
  image: px(373904, 1100),
  imageAlt: 'Home workspace with a wooden desk, laptop and lamp',
};

export const DESIGN_STEPS: NumberedStep[] = [
  { title: 'Set dimensions', text: 'Enter your room size in feet.' },
  { title: 'Place furniture', text: 'Add beds, sofas, tables and more.' },
  { title: 'Choose finishes', text: 'Walls, floors, fabrics and light.' },
  { title: 'Get an estimate', text: 'Area-based pricing, instantly.' },
];

export const SHOWCASE: ShowcaseItem[] = [
  {
    label: 'Modern Living',
    note: 'Open lounge in oak and boucle',
    image: px(1571460, 1100),
    imageAlt: 'Contemporary living room in neutral tones with a sleek sofa',
  },
  {
    label: 'Contemporary Kitchen',
    note: 'Island counter in white and black',
    image: px(6969875),
    imageAlt: 'Sleek kitchen with white cabinets, black countertops and an island',
  },
  {
    label: 'Warm Bedroom',
    note: 'Soft light and layered bedding',
    image: px(90319),
    imageAlt: 'Elegant bedroom with modern furniture and soft lighting',
  },
  {
    label: 'Minimal Dining',
    note: 'Wooden table by the window',
    image: px(1080696),
    imageAlt: 'Sunlit dining room with a wooden table and contemporary decor',
  },
];

export interface ReviewItem {
  quote: string;
  name: string;
  /** What the customer planned or bought, shown under the name. */
  project: string;
  city: string;
  /** Whole stars, 1 to 5. */
  rating: number;
}

/**
 * SAMPLE reviews for the client demo. These are placeholder texts and names,
 * not real customers. Replace them with approved reviews from Confident Group
 * customers (with their permission) before the site goes live. There are no
 * photos on purpose: the cards show initials, so no stock face is passed off
 * as a customer.
 */
export const REVIEWS: ReviewItem[] = [
  {
    quote: 'I tried the room layout before ordering anything. Seeing the sofa and table in the plan saved us from buying a piece that would not have fit.',
    name: 'Meera Nair',
    project: 'Living room',
    city: 'Kochi',
    rating: 5,
  },
  {
    quote: 'The estimate gave us a clear starting number before we spoke to anyone. That made the first conversation with the design team much easier.',
    name: 'Arjun Rao',
    project: 'Bedroom and wardrobe',
    city: 'Bengaluru',
    rating: 5,
  },
  {
    quote: 'Our designer listened first and then showed options that fit our budget. The finishes we picked on screen matched what we saw in person.',
    name: 'Sana Iyer',
    project: 'Full home interiors',
    city: 'Chennai',
    rating: 5,
  },
  {
    quote: 'The furniture arrived well packed and matched the photos. One chair needed a small adjustment and the team sorted it out quickly.',
    name: 'Kavya Menon',
    project: 'Kitchen and dining',
    city: 'Pune',
    rating: 4,
  },
  {
    quote: 'Easy to browse by room, and each product page gives the size and material up front. I ordered the dining table without a showroom visit.',
    name: 'Rohit Shetty',
    project: 'Dining room',
    city: 'Hyderabad',
    rating: 5,
  },
  {
    quote: 'Good range for a small flat. I wish a couple of pieces came in more colours, but the build quality is solid.',
    name: 'Anita Joseph',
    project: 'Home office',
    city: 'Mumbai',
    rating: 4,
  },
];

export const JOURNEY: NumberedStep[] = [
  { title: 'Explore', text: 'Discover interior ideas and furniture.' },
  { title: 'Design', text: 'Create your room using the 2D visualizer.' },
  { title: 'Estimate', text: 'Calculate your area and project estimate.' },
  { title: 'Connect', text: 'Send an enquiry and continue with the design team.' },
];
