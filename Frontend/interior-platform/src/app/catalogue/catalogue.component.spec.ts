import { ROOMS, PRODUCTS, filterProducts } from './catalogue-products';

describe('catalogue demo data', () => {
  it('has 8 products', () => {
    expect(PRODUCTS.length).toBe(8);
  });

  it('has unique ids with valid rooms, finishes and positive prices', () => {
    const ids = PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(PRODUCTS.length);
    for (const p of PRODUCTS) {
      expect(ROOMS).toContain(p.room);
      expect(p.finish.length).toBeGreaterThan(0);
      expect(p.price).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
    }
  });

  it('covers every listed room', () => {
    const rooms = ROOMS.filter((r) => r !== 'All');
    for (const r of rooms) {
      expect(PRODUCTS.some((p) => p.room === r)).toBeTrue();
    }
  });
});

describe('filterProducts', () => {
  it('returns all products for All with empty query', () => {
    expect(filterProducts(PRODUCTS, '', 'All').length).toBe(8);
  });

  it('filters by room', () => {
    const living = filterProducts(PRODUCTS, '', 'Living Room');
    expect(living.length).toBe(3);
    expect(living.every((p) => p.room === 'Living Room')).toBeTrue();
  });

  it('matches search case-insensitively across name, finish and room', () => {
    expect(filterProducts(PRODUCTS, 'velvet', 'All').length).toBe(1);
    expect(filterProducts(PRODUCTS, 'BOUCLÉ', 'All').length).toBe(1);
    expect(filterProducts(PRODUCTS, 'bedroom', 'All').length).toBe(3);
  });

  it('combines search and room', () => {
    expect(filterProducts(PRODUCTS, 'sofa', 'Bedroom').length).toBe(0);
    expect(filterProducts(PRODUCTS, 'oak', 'Bedroom').length).toBe(2);
  });

  it('returns empty for no match', () => {
    expect(filterProducts(PRODUCTS, 'xyz-no-match', 'All')).toEqual([]);
  });
});
