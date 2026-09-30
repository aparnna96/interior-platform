import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { HomeComponent } from './home.component';
import { FEATURED_PRODUCT_IDS } from './home-data';
import { ProductService, type ProductDto } from '../catalogue/product.service';

const PRODUCTS_URL = 'http://localhost:5175/api/products';

function dto(
  id: string,
  name: string,
  category: string,
  room: string,
  price: number
): ProductDto {
  return {
    id,
    name,
    category,
    room,
    price,
    material: 'Test Material',
    finish: 'Test Finish',
    blurb: `${name} blurb.`,
    description: `${name} description.`,
    dimensions: '10 × 10 × 10 cm',
    image: `https://example.com/${id}.jpg`,
    details: [`${name} detail`],
  };
}

/** Deliberately shuffled relative to FEATURED_PRODUCT_IDS. */
const API_PRODUCTS: ProductDto[] = [
  dto('oslo-wardrobe', 'Oslo 6-Door Wardrobe', 'Wardrobes', 'Bedroom', 54999),
  dto('terra-coffee-table', 'Terra Solid Wood Coffee Table', 'Tables', 'Living Room', 12999),
  dto('haven-queen-bed', 'Haven Queen Storage Bed', 'Beds', 'Bedroom', 38999),
  dto('sona-loveseat', 'Sona 2-Seater Loveseat', 'Sofas', 'Living Room', 28499),
  dto('aria-3s-sofa', 'Aria 3-Seater Fabric Sofa', 'Sofas', 'Living Room', 42999),
];

describe('HomeComponent featured products', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setup() {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('creates with no featured products before the API responds', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    expect(cmp).toBeTruthy();
    expect(cmp.featured()).toEqual([]);
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('.feat');
    expect(cards.length).toBe(0);
    httpMock.expectOne(PRODUCTS_URL).flush([]);
    fixture.destroy();
  });

  it('loads products through ProductService on init', () => {
    const fixture = setup();
    const req = httpMock.expectOne(PRODUCTS_URL);
    expect(req.request.method).toBe('GET');
    req.flush(API_PRODUCTS);
    expect(TestBed.inject(ProductService).products().length).toBe(API_PRODUCTS.length);
    fixture.destroy();
  });

  it('resolves featured products in FEATURED_PRODUCT_IDS order', () => {
    const fixture = setup();
    httpMock.expectOne(PRODUCTS_URL).flush(API_PRODUCTS);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp.featured().map((p) => p.id)).toEqual([...FEATURED_PRODUCT_IDS]);
    expect(cmp.featured().length).toBe(FEATURED_PRODUCT_IDS.length);
    fixture.destroy();
  });

  it('renders featured cards once products arrive asynchronously', () => {
    const fixture = setup();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.feat').length).toBe(0);
    httpMock.expectOne(PRODUCTS_URL).flush(API_PRODUCTS);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll('.feat');
    expect(cards.length).toBe(FEATURED_PRODUCT_IDS.length);
    expect(el.textContent).toContain('Aria 3-Seater Fabric Sofa');
    expect(el.textContent).toContain('Oslo 6-Door Wardrobe');
    fixture.destroy();
  });

  it('does not crash when the API fails', () => {
    const fixture = setup();
    httpMock
      .expectOne(PRODUCTS_URL)
      .flush('Server error', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp.featured()).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.feat').length).toBe(0);
    expect(fixture.componentInstance).toBeTruthy();
    fixture.destroy();
  });

  it('keeps existing interactions working', () => {
    const fixture = setup();
    httpMock.expectOne(PRODUCTS_URL).flush(API_PRODUCTS);
    const cmp = fixture.componentInstance;
    let destination: unknown = null;
    cmp.navigate.subscribe((d: unknown) => (destination = d));
    cmp.go('catalogue');
    expect(destination).toBe('catalogue');
    const before = cmp.slideIndex();
    cmp.nextSlide();
    expect(cmp.slideIndex()).toBe((before + 1) % cmp.slides.length);
    fixture.destroy();
  });
});
