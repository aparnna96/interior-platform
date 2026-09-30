import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ROOMS, PRODUCTS, filterProducts } from './catalogue-products';
import { CatalogueComponent } from './catalogue.component';
import type { ProductDto } from './product.service';

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

describe('CatalogueComponent ProductService integration', () => {
  const PRODUCTS_URL = 'http://localhost:5175/api/products';
  const apiProducts: ProductDto[] = [
    {
      id: 'aria-3s-sofa',
      name: 'Aria 3-Seater Fabric Sofa',
      category: 'Sofas',
      room: 'Living Room',
      price: 42999,
      material: 'Performance Bouclé',
      finish: 'Bouclé · Warm Beige',
      blurb: 'Deep-seat bouclé sofa.',
      description: 'A generous three-seater.',
      dimensions: '220 × 92 × 82 cm',
      image: 'https://example.com/aria.jpg',
      details: ['Bouclé cream upholstery'],
    },
    {
      id: 'sona-loveseat',
      name: 'Sona 2-Seater Loveseat',
      category: 'Sofas',
      room: 'Living Room',
      price: 28499,
      material: 'Woven Cotton Blend',
      finish: 'Weave · Terracotta',
      blurb: 'Compact loveseat.',
      description: 'A compact two-seater.',
      dimensions: '152 × 86 × 84 cm',
      image: 'https://example.com/sona.jpg',
      details: ['Terracotta woven fabric'],
    },
    {
      id: 'haven-queen-bed',
      name: 'Haven Queen Storage Bed',
      category: 'Beds',
      room: 'Bedroom',
      price: 38999,
      material: 'Oak Veneer · Engineered Wood',
      finish: 'Oak · Natural Finish',
      blurb: 'Queen bed with box storage.',
      description: 'A calm queen bed.',
      dimensions: '198 × 160 × 110 cm',
      image: 'https://example.com/haven.jpg',
      details: ['Oak veneer · natural finish'],
    },
  ];

  async function setup() {
    await TestBed.configureTestingModule({
      imports: [CatalogueComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(CatalogueComponent);
    fixture.detectChanges();
    const httpMock = TestBed.inject(HttpTestingController);
    return { fixture, cmp: fixture.componentInstance, httpMock };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify();
  });

  it('loads products through ProductService on init', async () => {
    const { cmp, httpMock } = await setup();
    httpMock.expectOne(PRODUCTS_URL).flush(apiProducts);
    expect(cmp.productService.products().length).toBe(3);
    expect(cmp.filtered().length).toBe(3);
  });

  it('shows API products in the catalogue listing', async () => {
    const { fixture, httpMock } = await setup();
    httpMock.expectOne(PRODUCTS_URL).flush(apiProducts);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Aria 3-Seater Fabric Sofa');
    expect(el.textContent).toContain('Haven Queen Storage Bed');
  });

  it('search and room filter work against loaded products', async () => {
    const { cmp, httpMock } = await setup();
    httpMock.expectOne(PRODUCTS_URL).flush(apiProducts);
    cmp.setSearch('sona');
    expect(cmp.filtered().map((p) => p.id)).toEqual(['sona-loveseat']);
    cmp.setSearch('');
    cmp.setRoom('Bedroom');
    expect(cmp.filtered().map((p) => p.id)).toEqual(['haven-queen-bed']);
  });

  it('counts loaded products per room', async () => {
    const { cmp, httpMock } = await setup();
    httpMock.expectOne(PRODUCTS_URL).flush(apiProducts);
    expect(cmp.countFor('All')).toBe(3);
    expect(cmp.countFor('Living Room')).toBe(2);
    expect(cmp.countFor('Bedroom')).toBe(1);
  });

  it('opens Product Details with the loaded product', async () => {
    const { fixture, cmp, httpMock } = await setup();
    httpMock.expectOne(PRODUCTS_URL).flush(apiProducts);
    cmp.viewDetails('sona-loveseat');
    fixture.detectChanges();
    expect(cmp.selected()?.name).toBe('Sona 2-Seater Loveseat');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-product-details')).toBeTruthy();
    expect(el.textContent).toContain('Sona 2-Seater Loveseat');
    cmp.closeDetails();
    fixture.detectChanges();
    expect(el.querySelector('app-product-details')).toBeFalsy();
  });

  it('shows a loading state instead of an empty catalogue while fetching', async () => {
    const { fixture, cmp, httpMock } = await setup();
    expect(cmp.productService.loading()).toBe(true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Loading furniture'
    );
    httpMock.expectOne(PRODUCTS_URL).flush(apiProducts);
    fixture.detectChanges();
    expect(cmp.productService.loading()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'Loading furniture'
    );
  });

  it('shows an error state with retry when the API fails', async () => {
    const { fixture, cmp, httpMock } = await setup();
    httpMock
      .expectOne(PRODUCTS_URL)
      .flush('Server error', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(cmp.productService.error()).toBeTruthy();
    expect(el.textContent).toContain('Could not load furniture');
    const retry = el.querySelector(
      '[aria-label="Retry loading furniture"]'
    ) as HTMLButtonElement;
    expect(retry).toBeTruthy();
    retry.click();
    httpMock.expectOne(PRODUCTS_URL).flush(apiProducts);
    fixture.detectChanges();
    expect(cmp.productService.products().length).toBe(3);
    expect(el.textContent).toContain('Aria 3-Seater Fabric Sofa');
  });

  it('keeps add-to-cart working with loaded products', async () => {
    const { cmp, httpMock } = await setup();
    httpMock.expectOne(PRODUCTS_URL).flush(apiProducts);
    expect(cmp.cartCount()).toBe(0);
    cmp.addToCart('aria-3s-sofa');
    expect(cmp.qtyOf('aria-3s-sofa')).toBe(1);
    cmp.addToCartQty({ id: 'aria-3s-sofa', qty: 2 });
    expect(cmp.qtyOf('aria-3s-sofa')).toBe(3);
  });
});
