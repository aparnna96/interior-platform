import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { CartComponent } from './cart.component';
import { CartService, type CartDto, type CartLine } from './cart.service';
import { environment } from '../../environments/environment';

const CART_URL = `${environment.apiBaseUrl}/api/cart`;
const ITEMS_URL = `${CART_URL}/items`;
const TOKEN = 'test-jwt';

function line(partial: Partial<CartLine> & { id: string }): CartLine {
  return {
    productId: 'aria-3s-sofa',
    slug: 'aria-3s-sofa',
    name: 'Aria 3-Seater Fabric Sofa',
    price: 42999,
    quantity: 2,
    lineTotal: 2 * 42999,
    imageUrl: 'https://example.com/aria.jpg',
    isAvailable: true,
    ...partial,
  };
}

function cartDto(lines: CartLine[]): CartDto {
  return {
    items: lines,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal: lines.reduce((n, l) => n + l.lineTotal, 0),
  };
}

describe('CartComponent (backend cart)', () => {
  let cart: CartService;
  let httpMock: HttpTestingController;

  function setupAuthenticated(initial: CartDto) {
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      imports: [CartComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    cart = TestBed.inject(CartService);
    httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(CART_URL).flush(initial);
    httpMock.verify();
  }

  function setupAnonymous() {
    TestBed.configureTestingModule({
      imports: [CartComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    cart = TestBed.inject(CartService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify();
    localStorage.clear();
  });

  function setup() {
    const fixture = TestBed.createComponent(CartComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('asks logged-out visitors to log in and calls no cart endpoints', () => {
    setupAnonymous();
    const el = setup().nativeElement as HTMLElement;
    expect(el.textContent).toContain('Log in to view your saved cart');
    expect(el.querySelector('.cart-empty')).toBeTruthy();
  });

  it('shows the login prompt instead of lines while logged out', () => {
    setupAnonymous();
    cart.notice.set('Please log in to use your saved cart.');
    const el = setup().nativeElement as HTMLElement;
    expect(el.textContent).toContain('Log in to view your saved cart');
  });

  it('renders backend lines with backend prices and totals', () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const el = setup().nativeElement as HTMLElement;
    expect(el.textContent).toContain('Aria 3-Seater Fabric Sofa');
    expect(el.textContent).toContain(`₹${(2 * 42999).toLocaleString('en-IN')}`);
    const img = el.querySelector('.line-media img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe('https://example.com/aria.jpg');
    expect(img?.getAttribute('alt')).toBe('Aria 3-Seater Fabric Sofa');
    expect(el.textContent).toContain(`₹${(2 * 42999).toLocaleString('en-IN')}`);
    expect(el.querySelector('.summary')).toBeTruthy();
  });

  it('shows an empty state for an authenticated empty cart', () => {
    setupAuthenticated(cartDto([]));
    const el = setup().nativeElement as HTMLElement;
    expect(el.textContent).toContain('Your cart is empty');
    expect(el.querySelector('.summary')).toBeFalsy();
  });

  it('increments through PUT with the item id', () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    fixture.componentInstance.cart.increment('item-1');
    const req = httpMock.expectOne(`${ITEMS_URL}/item-1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ quantity: 3 });
    req.flush(cartDto([line({ id: 'item-1', quantity: 3, lineTotal: 3 * 42999 })]));
    fixture.detectChanges();
    expect(cart.qtyOf('aria-3s-sofa')).toBe(3);
  });

  it('decrements through PUT and removes through DELETE + reload', () => {
    setupAuthenticated(cartDto([line({ id: 'item-1', quantity: 2, lineTotal: 2 * 42999 })]));
    const fixture = setup();

    fixture.componentInstance.cart.decrement('item-1');
    httpMock.expectOne(`${ITEMS_URL}/item-1`).flush(cartDto([line({ id: 'item-1', quantity: 1, lineTotal: 42999 })]));
    expect(cart.qtyOf('aria-3s-sofa')).toBe(1);

    fixture.componentInstance.cart.remove('item-1');
    httpMock.expectOne(`${ITEMS_URL}/item-1`).flush(null);
    httpMock.expectOne(CART_URL).flush(cartDto([]));
    fixture.detectChanges();
    expect(cart.lines().length).toBe(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Your cart is empty');
  });

  it('keeps unavailable lines visible with controls disabled', () => {
    setupAuthenticated(cartDto([line({ id: 'item-9', isAvailable: false })]));
    const el = setup().nativeElement as HTMLElement;
    expect(el.textContent).toContain('Aria 3-Seater Fabric Sofa');
    expect(el.textContent).toContain('Unavailable');
    const buttons = Array.from(el.querySelectorAll('.qty-btn')) as HTMLButtonElement[];
    expect(buttons.length).toBe(2);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it('shows API errors with a retry that reloads', () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    cart.error.set('That item is no longer available.');
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('no longer available');

    (el.querySelector('.cart-error button') as HTMLButtonElement).click();
    httpMock.expectOne(CART_URL).flush(cartDto([line({ id: 'item-1' })]));
    fixture.detectChanges();
    expect(cart.lines().length).toBe(1);
  });

  it('reports session expiry after a 401', () => {
    setupAuthenticated(cartDto([]));
    cart.load();
    httpMock.expectOne(CART_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    const fixture = setup();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to view your saved cart');
  });

  it('emits browse to return to the Furniture catalogue', () => {
    setupAnonymous();
    const fixture = setup();
    let browsed = false;
    fixture.componentInstance.browse.subscribe(() => (browsed = true));
    fixture.componentInstance.goBrowse();
    expect(browsed).toBeTrue();
  });
});
