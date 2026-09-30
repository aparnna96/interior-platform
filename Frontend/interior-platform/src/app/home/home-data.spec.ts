import {
  HERO,
  SPACES,
  SHOWCASE,
  DESIGN_IMAGE,
  DESIGN_STEPS,
  JOURNEY,
  FEATURED_PRODUCT_IDS,
} from './home-data';

describe('home demo content', () => {
  it('has four room spaces with Pexels imagery', () => {
    expect(SPACES.length).toBe(4);
    for (const s of SPACES) {
      expect(s.image.startsWith('https://images.pexels.com/')).toBeTrue();
      expect(s.imageAlt.length).toBeGreaterThan(0);
    }
  });

  it('keeps every home image URL centralised on Pexels', () => {
    const urls = [
      ...HERO.slides.map((s) => s.image),
      DESIGN_IMAGE.image,
      ...SPACES.map((s) => s.image),
      ...SHOWCASE.map((s) => s.image),
    ];
    for (const u of urls) {
      expect(u.startsWith('https://images.pexels.com/')).toBeTrue();
    }
  });

  it('defines five unique hero slides, one scene each', () => {
    expect(HERO.slides.length).toBe(5);
    const urls = HERO.slides.map((s) => s.image);
    expect(new Set(urls).size).toBe(urls.length);
    for (const s of HERO.slides) {
      expect(s.image.startsWith('https://images.pexels.com/')).toBeTrue();
      expect(s.imageAlt.length).toBeGreaterThan(0);
    }
  });

  it('defines a curated, unique featured-id list', () => {
    expect(FEATURED_PRODUCT_IDS.length).toBeGreaterThan(0);
    expect(new Set(FEATURED_PRODUCT_IDS).size).toBe(FEATURED_PRODUCT_IDS.length);
    for (const id of FEATURED_PRODUCT_IDS) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it('defines the design steps, showcase and journey', () => {
    expect(DESIGN_STEPS.length).toBe(4);
    expect(SHOWCASE.length).toBe(4);
    expect(JOURNEY.length).toBe(4);
  });
});
