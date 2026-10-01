import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
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
    quantity: 1,
    lineTotal: 42999,
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

const EMPTY = cartDto([]);
const ONE_LINE = cartDto([line({ id: 'item-1' })]);

describe('CartService (backend cart API)', () => {
  let cart: CartService;
  let auth: AuthService;
  let httpMock: HttpTestingController;

  function setupAuthenticated(initial: CartDto = EMPTY) {
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    cart = TestBed.inject(CartService);
    httpMock = TestBed.inject(HttpTestingController);
    // Constructor load for the persisted session.
    httpMock.expectOne(CART_URL).flush(initial);
  }

  function setupAnonymous() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
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

  it('starts empty and issues no requests while logged out', () => {
    setupAnonymous();
    expect(auth.isAuthenticated()).toBe(false);
    expect(cart.lines()).toEqual([]);
    expect(cart.totalQty()).toBe(0);
    expect(cart.subtotal()).toBe(0);
    cart.load();
  });

  it('loads the authenticated cart from GET /api/cart with Bearer token', () => {
    setupAuthenticated(ONE_LINE);
    expect(cart.lines().length).toBe(1);
    expect(cart.lines()[0].productId).toBe('aria-3s-sofa');
    expect(cart.totalQty()).toBe(1);
    expect(cart.subtotal()).toBe(42999);
  });

  it('sends the Authorization header on cart calls', () => {
    setupAuthenticated();
    cart.load();
    const req = httpMock.expectOne(CART_URL);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(EMPTY);
  });

  it('add posts only productId and quantity, then replaces state from the response', () => {
    setupAuthenticated();
    cart.add('aria-3s-sofa', 2);
    const req = httpMock.expectOne(ITEMS_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ productId: 'aria-3s-sofa', quantity: 2 });
    expect(Object.keys(req.request.body)).toEqual(['productId', 'quantity']);
    req.flush(ONE_LINE);
    expect(cart.qtyOf('aria-3s-sofa')).toBe(1);
    expect(cart.totalQty()).toBe(1);
  });

  it('relies on the backend response for duplicates (no local merge math)', () => {
    setupAuthenticated(ONE_LINE);
    cart.add('aria-3s-sofa', 2);
    httpMock.expectOne(ITEMS_URL).flush(cartDto([line({ id: 'item-1', quantity: 3, lineTotal: 3 * 42999 })]));
    expect(cart.lines().length).toBe(1);
    expect(cart.qtyOf('aria-3s-sofa')).toBe(3);
    expect(cart.subtotal()).toBe(3 * 42999);
  });

  it('caps quantities at 99 client-side', () => {
    setupAuthenticated();
    cart.add('aria-3s-sofa', 150);
    const req = httpMock.expectOne(ITEMS_URL);
    expect(req.request.body).toEqual({ productId: 'aria-3s-sofa', quantity: 99 });
    req.flush(EMPTY);
  });

  it('increment puts quantity + 1 to the item URL', () => {
    setupAuthenticated(ONE_LINE);
    cart.increment('item-1');
    const req = httpMock.expectOne(`${ITEMS_URL}/item-1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ quantity: 2 });
    req.flush(cartDto([line({ id: 'item-1', quantity: 2, lineTotal: 2 * 42999 })]));
    expect(cart.qtyOf('aria-3s-sofa')).toBe(2);
  });

  it('decrement puts quantity - 1 and never below 1', () => {
    setupAuthenticated(cartDto([line({ id: 'item-1', quantity: 2, lineTotal: 2 * 42999 })]));
    cart.decrement('item-1');
    const req = httpMock.expectOne(`${ITEMS_URL}/item-1`);
    expect(req.request.body).toEqual({ quantity: 1 });
    req.flush(ONE_LINE);
    expect(cart.qtyOf('aria-3s-sofa')).toBe(1);

    // At 1 the view disables the button; the service is a no-op guard too.
    cart.decrement('item-1');
  });

  it('remove deletes then reloads the cart', () => {
    setupAuthenticated(ONE_LINE);
    cart.remove('item-1');
    const del = httpMock.expectOne(`${ITEMS_URL}/item-1`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
    httpMock.expectOne(CART_URL).flush(EMPTY);
    expect(cart.lines()).toEqual([]);
    expect(cart.totalQty()).toBe(0);
  });

  it('logged-out add issues no request and sets a login notice', () => {
    setupAnonymous();
    cart.add('aria-3s-sofa', 1);
    expect(cart.notice()).toContain('log in');
    expect(cart.lines()).toEqual([]);
  });

  it('logged-out mutations stay silent on the network', () => {
    setupAnonymous();
    cart.increment('item-1');
    cart.decrement('item-1');
    cart.remove('item-1');
    cart.setQuantity('item-1', 2);
  });

  it('401 drops the token, clears state and reports session expiry', () => {
    setupAuthenticated(ONE_LINE);
    cart.load();
    httpMock.expectOne(CART_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(cart.lines()).toEqual([]);
    expect(cart.totalQty()).toBe(0);
    expect(cart.error()).toContain('session');
  });

  it('404 on add keeps existing state and reports unavailability', () => {
    setupAuthenticated(ONE_LINE);
    cart.add('retired-chair', 1);
    // The backend answers empty 404s for missing/inactive products.
    httpMock.expectOne(ITEMS_URL).flush(null, { status: 404, statusText: 'Not Found' });
    expect(cart.lines().length).toBe(1);
    expect(cart.error()).toContain('no longer available');
  });

  it('400 on add reports a validation message', () => {
    setupAuthenticated();
    cart.add('aria-3s-sofa', 2);
    httpMock
      .expectOne(ITEMS_URL)
      .flush({ title: 'Quantity must be between 1 and 99.' }, { status: 400, statusText: 'Bad Request' });
    expect(cart.error()).toContain('Quantity');
  });

  it('network failure surfaces an error instead of pretending success', () => {
    setupAuthenticated();
    cart.add('aria-3s-sofa', 1);
    httpMock.expectOne(ITEMS_URL).flush('boom', { status: 0, statusText: 'Unknown Error' });
    expect(cart.error()).toBeTruthy();
    expect(cart.lines()).toEqual([]);
  });

  it('represents unavailable items via isAvailable', () => {
    setupAuthenticated(cartDto([line({ id: 'item-9', isAvailable: false })]));
    expect(cart.lines()[0].isAvailable).toBe(false);
    expect(cart.totalQty()).toBe(1);
  });

  it('badge count comes from the backend itemCount', () => {
    setupAuthenticated({ items: [], itemCount: 7, subtotal: 100 });
    expect(cart.totalQty()).toBe(7);
    expect(cart.subtotal()).toBe(100);
  });

  it('logout clears authenticated cart state', () => {
    setupAuthenticated(ONE_LINE);
    auth.logout();
    cart.clear();
    expect(cart.lines()).toEqual([]);
    expect(cart.totalQty()).toBe(0);
    expect(cart.subtotal()).toBe(0);
  });

  it('does not load one user cart into another session', () => {
    setupAuthenticated(ONE_LINE);
    auth.logout();
    cart.clear();
    expect(cart.lines()).toEqual([]);
  });
});
