import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { CartComponent } from './cart.component';
import { CartService } from './cart.service';
import { ProductService, type ProductDto } from './product.service';
import type { CatalogueProduct } from './catalogue-products';
import { environment } from '../../environments/environment';

const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;

const API_PRODUCTS: ProductDto[] = [
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
];

describe('CartComponent', () => {
  let cart: CartService;
  let first: CatalogueProduct;
  let second: CatalogueProduct;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CartComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    cart = TestBed.inject(CartService);
    const products = TestBed.inject(ProductService);
    const httpMock = TestBed.inject(HttpTestingController);
    cart.clear();
    products.load();
    httpMock.expectOne(PRODUCTS_URL).flush(API_PRODUCTS);
    httpMock.verify();
    first = products.products()[0];
    second = products.products()[1];
  });

  function setup() {
    const fixture = TestBed.createComponent(CartComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('creates with a polished empty state', () => {
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance).toBeTruthy();
    expect(el.textContent).toContain('Your cart is empty');
    expect(el.textContent).toContain('Browse Furniture');
    expect(el.querySelector('.cart-empty')).toBeTruthy();
    expect(el.querySelector('.summary')).toBeFalsy();
  });

  it('emits browse to return to the Furniture catalogue', () => {
    const fixture = setup();
    let browsed = false;
    fixture.componentInstance.browse.subscribe(() => (browsed = true));
    fixture.componentInstance.goBrowse();
    expect(browsed).toBeTrue();
  });

  it('displays added products with catalogue data and line subtotal', () => {
    cart.add(first.id, 2);
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain(first.name);
    expect(el.textContent).toContain(first.category);
    expect(el.textContent).toContain(first.room);
    expect(el.textContent).toContain(`₹${(first.price * 2).toLocaleString('en-IN')}`);
    const img = el.querySelector('.line-media img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe(first.image);
    expect(img?.getAttribute('alt')).toBe(first.name);
  });

  it('shows summary with item count, subtotal and total', () => {
    cart.add(first.id, 2);
    cart.add(second.id, 1);
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('3');
    expect(el.textContent).toContain(`₹${(first.price * 2 + second.price).toLocaleString('en-IN')}`);
    expect(el.querySelector('.summary')).toBeTruthy();
    const checkout = el.querySelector('.summary .btn-primary') as HTMLButtonElement | null;
    expect(checkout?.textContent).toContain('Proceed to Checkout');
    expect(checkout?.disabled).toBeTrue();
    expect(el.textContent).toContain('Checkout arrives in a later stage.');
  });

  it('increments, decrements (min 1) and removes through the view', () => {
    cart.add(first.id, 2);
    const fixture = setup();
    const cmp = fixture.componentInstance;

    cmp.cart.increment(first.id);
    fixture.detectChanges();
    expect(cart.qtyOf(first.id)).toBe(3);

    cmp.cart.decrement(first.id);
    cmp.cart.decrement(first.id);
    cmp.cart.decrement(first.id);
    fixture.detectChanges();
    expect(cart.qtyOf(first.id)).toBe(1);

    cmp.cart.remove(first.id);
    fixture.detectChanges();
    expect(cart.lines().length).toBe(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Your cart is empty');
  });
});
