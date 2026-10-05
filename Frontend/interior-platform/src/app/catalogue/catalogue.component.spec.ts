import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ROOMS, filterProducts, type CatalogueProduct } from './catalogue-products';
import { CatalogueComponent } from './catalogue.component';
import { AUTH_TOKEN_KEY } from '../auth.service';
import type { CartDto } from './cart.service';
import type { ProductDto } from './product.service';
import { environment } from '../../environments/environment';

function fixtureProduct(partial: Partial<CatalogueProduct> & { id: string }): CatalogueProduct {
  return {
    name: `${partial.id} name`,
    category: 'Sofas',
    room: 'Living Room',
    price: 10000,
    finish: 'Test Finish',
    blurb: `${partial.id} blurb.`,
    details: [`${partial.id} detail`],
    swatch: '',
    image: `https://example.com/${partial.id}.jpg`,
    material: 'Test Material',
    dimensions: '10 × 10 × 10 cm',
    description: `${partial.id} description.`,
    ...partial,
  };
}

/** Small local fixtures exercising every filter axis (no backend data). */
const FIXTURES: CatalogueProduct[] = [
  fixtureProduct({
    id: 'sofa-a',
    name: 'Bouclé Lounge Sofa',
    category: 'Sofas',
    room: 'Living Room',
    price: 42999,
    finish: 'Bouclé · Warm Beige',
    material: 'Performance Bouclé',
    blurb: 'Deep-seat sofa for everyday lounging.',
  }),
  fixtureProduct({
    id: 'sofa-b',
    name: 'Terracotta Loveseat',
    category: 'Sofas',
    room: 'Living Room',
    price: 28499,
    finish: 'Weave · Terracotta',
    material: 'Woven Cotton Blend',
  }),
  fixtureProduct({
    id: 'bed-a',
    name: 'Oak Storage Bed',
    category: 'Beds',
    room: 'Bedroom',
    price: 38999,
    finish: 'Oak · Natural Finish',
    material: 'Oak Veneer · Engineered Wood',
  }),
  fixtureProduct({
    id: 'desk-a',
    name: 'Foldable Study Desk',
    category: 'Tables',
    room: 'Workspace',
    price: 9999,
    finish: 'Oak · Natural',
    material: 'Engineered Wood · Oak Finish',
  }),
  fixtureProduct({
    id: 'chair-a',
    name: 'Slate Velvet Chair',
    category: 'Chairs',
    room: 'Dining',
    price: 14499,
    finish: 'Velvet · Slate',
    material: 'Cotton Velvet · Solid Wood',
  }),
];

describe('filterProducts', () => {
  it('returns all products for All with empty query', () => {
    expect(filterProducts(FIXTURES, '', 'All').length).toBe(5);
  });

  it('filters by room', () => {
    const living = filterProducts(FIXTURES, '', 'Living Room');
    expect(living.length).toBe(2);
    expect(living.every((p) => p.room === 'Living Room')).toBeTrue();
  });

  it('matches search case-insensitively across name, finish and room', () => {
    expect(filterProducts(FIXTURES, 'velvet', 'All').length).toBe(1);
    expect(filterProducts(FIXTURES, 'BOUCLÉ', 'All').length).toBe(1);
    expect(filterProducts(FIXTURES, 'bedroom', 'All').length).toBe(1);
  });

  it('combines search and room', () => {
    expect(filterProducts(FIXTURES, 'sofa', 'Bedroom').length).toBe(0);
    expect(filterProducts(FIXTURES, 'oak', 'Bedroom').length).toBe(1);
  });

  it('returns empty for no match', () => {
    expect(filterProducts(FIXTURES, 'xyz-no-match', 'All')).toEqual([]);
  });
});

describe('CatalogueComponent ProductService integration', () => {
  const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
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

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify();
    localStorage.clear();
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
    localStorage.setItem(AUTH_TOKEN_KEY, 'test-jwt');
    const { cmp, httpMock } = await setup();
    // Authenticated session: the cart loads first, then the catalogue.
    httpMock.expectOne(CART_URL).flush(emptyCart());
    httpMock.expectOne(PRODUCTS_URL).flush(apiProducts);
    expect(cmp.cartCount()).toBe(0);
    cmp.addToCart('aria-3s-sofa');
    httpMock.expectOne(ITEMS_URL).flush(cartWith('aria-3s-sofa', 1));
    expect(cmp.qtyOf('aria-3s-sofa')).toBe(1);
    cmp.addToCartQty({ id: 'aria-3s-sofa', qty: 2 });
    httpMock.expectOne(ITEMS_URL).flush(cartWith('aria-3s-sofa', 3));
    expect(cmp.qtyOf('aria-3s-sofa')).toBe(3);
    expect(cmp.cartCount()).toBe(3);
  });

  it('asks logged-out visitors to log in instead of calling the cart API', async () => {
    const { cmp, httpMock } = await setup();
    httpMock.expectOne(PRODUCTS_URL).flush(apiProducts);
    cmp.addToCart('aria-3s-sofa');
    expect(cmp.cartNotice()).toContain('log in');
    expect(cmp.qtyOf('aria-3s-sofa')).toBe(0);
  });

  it('shows a Log in action with the notice and opens the login, clearing the notice', async () => {
    const { fixture, cmp, httpMock } = await setup();
    httpMock.expectOne(PRODUCTS_URL).flush(apiProducts);
    let requested = 0;
    cmp.loginRequested.subscribe(() => requested++);
    cmp.addToCart('aria-3s-sofa');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const toast = el.querySelector('.login-toast');
    expect(toast?.textContent).toContain('log in');
    (el.querySelector('.login-toast .toast-login') as HTMLButtonElement).click();

    expect(requested).toBe(1);
    expect(cmp.cartNotice()).toBeNull();
    fixture.detectChanges();
    expect(el.querySelector('.login-toast')).toBeFalsy();
  });

  it('dismisses the login notice without opening the login', async () => {
    const { fixture, cmp, httpMock } = await setup();
    httpMock.expectOne(PRODUCTS_URL).flush(apiProducts);
    let requested = 0;
    cmp.loginRequested.subscribe(() => requested++);
    cmp.addToCart('aria-3s-sofa');
    fixture.detectChanges();

    ((fixture.nativeElement as HTMLElement).querySelector('.login-toast .toast-close') as HTMLButtonElement).click();
    expect(cmp.cartNotice()).toBeNull();
    expect(requested).toBe(0);
  });

  it('hides the featured banner while a search is active', async () => {
    const { fixture, cmp, httpMock } = await setup();
    httpMock.expectOne(PRODUCTS_URL).flush(apiProducts);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.spotlight')).toBeTruthy();
    cmp.setSearch('sofa');
    fixture.detectChanges();
    expect(el.querySelector('.spotlight')).toBeFalsy();
    cmp.setSearch('');
    fixture.detectChanges();
    expect(el.querySelector('.spotlight')).toBeTruthy();
  });
});

const CART_URL = `${environment.apiBaseUrl}/api/cart`;
const ITEMS_URL = `${CART_URL}/items`;

function emptyCart(): CartDto {
  return { items: [], itemCount: 0, subtotal: 0 };
}

function cartWith(productId: string, quantity: number): CartDto {
  const price = 42999;
  return {
    items: [
      {
        id: 'item-1',
        productId,
        slug: productId,
        name: 'Aria 3-Seater Fabric Sofa',
        price,
        quantity,
        lineTotal: price * quantity,
        imageUrl: 'https://example.com/aria.jpg',
        isAvailable: true,
      },
    ],
    itemCount: quantity,
    subtotal: price * quantity,
  };
}
