import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  PRODUCT_SWATCH_DEFAULT,
  ProductService,
  type AdminProductDto,
  type ProductDto,
} from './product.service';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { environment } from '../../environments/environment';

const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;

const API_FIXTURE: ProductDto[] = [
  {
    id: 'aria-3s-sofa',
    name: 'Aria 3-Seater Fabric Sofa',
    category: 'Sofas',
    room: 'Living Room',
    price: 42999,
    material: 'Performance Bouclé',
    finish: 'Bouclé · Warm Beige',
    blurb: 'Deep-seat bouclé sofa for everyday lounging.',
    description: 'A generous three-seater.',
    dimensions: '220 × 92 × 82 cm',
    image: 'https://example.com/aria.jpg',
    details: ['Bouclé cream upholstery', 'Solid wood frame'],
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
];

describe('ProductService', () => {
  let service: ProductService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProductService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('can be created with empty initial state', () => {
    expect(service).toBeTruthy();
    expect(service.products()).toEqual([]);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('calls GET /api/products on load', () => {
    service.load();
    const req = httpMock.expectOne(PRODUCTS_URL);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('maps the API response correctly to CatalogueProduct', () => {
    service.load();
    httpMock.expectOne(PRODUCTS_URL).flush(API_FIXTURE);
    const products = service.products();
    expect(products.length).toBe(2);
    expect(products[0]).toEqual({
      id: 'aria-3s-sofa',
      name: 'Aria 3-Seater Fabric Sofa',
      category: 'Sofas',
      room: 'Living Room',
      price: 42999,
      finish: 'Bouclé · Warm Beige',
      blurb: 'Deep-seat bouclé sofa for everyday lounging.',
      details: ['Bouclé cream upholstery', 'Solid wood frame'],
      swatch: PRODUCT_SWATCH_DEFAULT,
      image: 'https://example.com/aria.jpg',
      material: 'Performance Bouclé',
      dimensions: '220 × 92 × 82 cm',
      description: 'A generous three-seater.',
    });
  });

  it('maps image to the frontend image field', () => {
    service.load();
    httpMock.expectOne(PRODUCTS_URL).flush(API_FIXTURE);
    expect(service.products()[0].image).toBe('https://example.com/aria.jpg');
    expect(service.products()[1].image).toBe('https://example.com/sona.jpg');
  });

  it('gives swatch the intended default value', () => {
    service.load();
    httpMock.expectOne(PRODUCTS_URL).flush(API_FIXTURE);
    expect(service.products()[0].swatch).toBe(PRODUCT_SWATCH_DEFAULT);
    expect(service.products()[0].swatch).toBe('');
  });

  it('sets loading true while pending and false after completion', () => {
    expect(service.loading()).toBe(false);
    service.load();
    expect(service.loading()).toBe(true);
    httpMock.expectOne(PRODUCTS_URL).flush(API_FIXTURE);
    expect(service.loading()).toBe(false);
  });

  it('populates products on success', () => {
    service.load();
    httpMock.expectOne(PRODUCTS_URL).flush(API_FIXTURE);
    expect(service.products().map((p) => p.id)).toEqual([
      'aria-3s-sofa',
      'sona-loveseat',
    ]);
    expect(service.error()).toBeNull();
  });

  it('sets the error state on failure and keeps products usable', () => {
    service.load();
    httpMock.expectOne(PRODUCTS_URL).flush(API_FIXTURE);
    expect(service.products().length).toBe(2);

    service.load();
    httpMock
      .expectOne(PRODUCTS_URL)
      .flush('Server error', { status: 500, statusText: 'Server Error' });
    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('Failed to load products.');
    // Previously loaded products are preserved.
    expect(service.products().length).toBe(2);
  });

  it('does not create a duplicate request while a load is in progress', () => {
    service.load();
    service.load();
    const matched = httpMock.match(PRODUCTS_URL);
    expect(matched.length).toBe(1);
    matched[0].flush(API_FIXTURE);
  });

  it('public load sends no Authorization header', () => {
    service.load();
    const req = httpMock.expectOne(PRODUCTS_URL);
    expect(req.request.headers.get('Authorization')).toBeNull();
    req.flush([]);
  });
});

describe('ProductService admin endpoints', () => {
  const TOKEN = 'admin-jwt';
  const ADMIN_URL = `${environment.apiBaseUrl}/api/products/admin`;
  let service: ProductService;
  let httpMock: HttpTestingController;

  const ADMIN_FIXTURE = [
    { ...API_FIXTURE[0], isActive: true },
    { ...API_FIXTURE[1], isActive: false },
  ];

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    service = TestBed.inject(ProductService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('getAdminProducts lists active and inactive with Bearer auth', () => {
    let received: AdminProductDto[] | null = null;
    service.getAdminProducts().subscribe((products) => (received = products));
    const req = httpMock.expectOne(ADMIN_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(ADMIN_FIXTURE);
    expect(received!.length).toBe(2);
    expect(received![1].isActive).toBe(false);
  });

  it('createProduct posts the full contract with Bearer auth', () => {
    const body = {
      id: 'milo-dining-chair',
      name: 'Milo Dining Chair',
      category: 'Chairs',
      room: 'Dining',
      price: 14499,
      material: 'Oak',
      finish: 'Matte',
      blurb: 'Blurb.',
      description: 'Description.',
      dimensions: '45 × 50 × 90 cm',
      imageUrl: 'https://example.com/milo.jpg',
      details: ['Solid oak frame'],
      isActive: true,
    };
    let received: AdminProductDto | null = null;
    service.createProduct(body).subscribe((product) => (received = product));
    const req = httpMock.expectOne(PRODUCTS_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush({ ...API_FIXTURE[1], isActive: true });
    expect(received!.id).toBe('sona-loveseat');
  });

  it('updateProduct puts to the route id with Bearer auth', () => {
    const body = {
      name: 'Renamed Sofa',
      category: 'Sofas',
      room: 'Living Room',
      price: 44999,
      material: 'Fabric',
      finish: 'Matte',
      blurb: 'Blurb.',
      description: 'Description.',
      dimensions: '220 × 92 × 82 cm',
      imageUrl: 'https://example.com/aria.jpg',
      details: ['Detail.'],
      isActive: true,
    };
    service.updateProduct('aria-3s-sofa', body).subscribe();
    const req = httpMock.expectOne(`${PRODUCTS_URL}/aria-3s-sofa`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush({ ...API_FIXTURE[0], name: 'Renamed Sofa' });
  });

  it('deactivateProduct deletes with Bearer auth', () => {
    let completed = false;
    service.deactivateProduct('aria-3s-sofa').subscribe(() => (completed = true));
    const req = httpMock.expectOne(`${PRODUCTS_URL}/aria-3s-sofa`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(completed).toBe(true);
  });
});
