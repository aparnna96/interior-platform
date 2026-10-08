import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { CartComponent } from './cart.component';
import { CartService, type CartDto, type CartLine } from './cart.service';
import type { CreateOrderRequest, OrderDetailDto } from '../orders/order.service';
import { deliveryFieldError } from './cart.component';
import { environment } from '../../environments/environment';

const CART_URL = `${environment.apiBaseUrl}/api/cart`;
const ITEMS_URL = `${CART_URL}/items`;
const ORDERS_URL = `${environment.apiBaseUrl}/api/orders`;
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

  it('offers a Log in button to logged-out visitors that asks the shell to open the login', () => {
    setupAnonymous();
    const fixture = setup();
    let requested = 0;
    fixture.componentInstance.loginRequested.subscribe(() => requested++);
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.cart-empty button')
    ) as HTMLButtonElement[];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Log in', 'Browse Furniture']);
    buttons[0].click();
    expect(requested).toBe(1);
  });

  it('emits browse to return to the Furniture catalogue', () => {
    setupAnonymous();
    const fixture = setup();
    let browsed = false;
    fixture.componentInstance.browse.subscribe(() => (browsed = true));
    fixture.componentInstance.goBrowse();
    expect(browsed).toBeTrue();
  });

  function orderDetail(): OrderDetailDto {
    return {
      id: 'order-1',
      status: 0,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
      subtotal: 85998,
      delivery: {
        fullName: 'Asha Menon',
        phone: '9876543210',
        addressLine1: '12 MG Road',
        addressLine2: 'Near City Mall',
        city: 'Kochi',
        state: 'Kerala',
        pincode: '682016',
        deliveryNotes: 'Call before delivery.',
      },
      items: [
        {
          id: 'oi-1',
          productId: 'aria-3s-sofa',
          productName: 'Aria 3-Seater Fabric Sofa',
          unitPrice: 42999,
          quantity: 2,
          lineTotal: 85998,
        },
      ],
    };
  }

  function placeOrderButton(fixture: ReturnType<typeof setup>): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('.summary .btn-block') as HTMLButtonElement | null;
  }

  const VALID: CreateOrderRequest = {
    fullName: 'Asha Menon',
    phone: '9876543210',
    addressLine1: '12 MG Road',
    addressLine2: 'Near City Mall',
    city: 'Kochi',
    state: 'Kerala',
    pincode: '682016',
    deliveryNotes: 'Call before delivery.',
  };

  /** Place Order -> Delivery details step. */
  function openDelivery(fixture: ReturnType<typeof setup>) {
    placeOrderButton(fixture)?.click();
    fixture.detectChanges();
  }

  function confirmButton(fixture: ReturnType<typeof setup>): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('button.confirm-order') as HTMLButtonElement | null;
  }

  /** Types into the real inputs so the template bindings are exercised, not just the signals. */
  async function fill(fixture: ReturnType<typeof setup>, values: Partial<CreateOrderRequest>) {
    await fixture.whenStable();
    for (const [name, value] of Object.entries(values)) {
      const el = fixture.nativeElement.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement;
      el.value = value as string;
      el.dispatchEvent(new Event('input'));
      el.dispatchEvent(new Event('blur'));
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Opens the form, fills it, confirms, and answers the POST. */
  async function placeWithDelivery(
    fixture: ReturnType<typeof setup>,
    values: Partial<CreateOrderRequest> = VALID,
  ) {
    openDelivery(fixture);
    await fill(fixture, values);
    confirmButton(fixture)?.click();
  }

  it('offers Place Order for an available cart', () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    const button = placeOrderButton(fixture);
    expect(button?.textContent).toContain('Place Order');
    expect(button?.disabled).toBe(false);
  });

  it('Place Order only opens the delivery step: no request is sent yet', () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    openDelivery(fixture);

    httpMock.expectNone(ORDERS_URL);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('form[aria-label="Delivery details"]')).toBeTruthy();
    expect(el.textContent).toContain('Delivery details');
    expect(el.textContent).toContain('No payment is taken yet.');
    // the cart lines are replaced in place, the summary stays, and Confirm starts disabled
    expect(el.querySelector('.line')).toBeFalsy();
    expect(el.querySelector('.summary')).toBeTruthy();
    expect(confirmButton(fixture)?.disabled).toBe(true);
    expect(cart.lines().length).toBe(1);
  });

  it('shows all 8 delivery fields, optional ones marked', () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    openDelivery(fixture);
    const el = fixture.nativeElement as HTMLElement;
    for (const name of ['fullName', 'phone', 'addressLine1', 'addressLine2', 'city', 'state', 'pincode', 'deliveryNotes']) {
      expect(el.querySelector(`[name="${name}"]`)).toBeTruthy();
    }
    expect(el.textContent).toContain('Address line 2 (optional)');
    expect(el.textContent).toContain('Delivery notes (optional)');
  });

  it('Back to cart returns to the lines and keeps what was typed', async () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    openDelivery(fixture);
    await fill(fixture, { fullName: 'Asha Menon' });
    (fixture.nativeElement.querySelector('.delivery-actions .btn-secondary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.line')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('form')).toBeFalsy();
    openDelivery(fixture);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('[name="fullName"]') as HTMLInputElement).value).toBe('Asha Menon');
    httpMock.expectNone(ORDERS_URL);
  });

  it('Confirm stays disabled until every required field is valid', async () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    openDelivery(fixture);
    await fill(fixture, { ...VALID, pincode: '12345' });
    expect(confirmButton(fixture)?.disabled).toBe(true);
    await fill(fixture, { pincode: '682016' });
    expect(confirmButton(fixture)?.disabled).toBe(false);
    // clearing a required field disables it again
    await fill(fixture, { city: '   ' });
    expect(confirmButton(fixture)?.disabled).toBe(true);
  });

  it('shows an inline message under a field only after it was touched', async () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    openDelivery(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#err-fullName')?.textContent?.trim()).toBe('');
    await fill(fixture, { fullName: 'A', phone: '123', pincode: '1' });
    expect(el.querySelector('#err-fullName')?.textContent).toContain('Full name must be 2 to 100 characters.');
    expect(el.querySelector('#err-phone')?.textContent).toContain('Phone must be a 10 digit mobile number.');
    expect(el.querySelector('#err-pincode')?.textContent).toContain('Pincode must be 6 digits.');
    expect(el.querySelector('#err-city')?.textContent?.trim()).toBe('');
    expect((el.querySelector('[name="phone"]') as HTMLElement).getAttribute('aria-invalid')).toBe('true');
    expect((el.querySelector('[name="city"]') as HTMLElement).getAttribute('aria-invalid')).toBeNull();
  });

  it('confirming sends exactly the 8 trimmed delivery fields, shows the confirmation and clears the cart', async () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    await placeWithDelivery(fixture, { ...VALID, fullName: '  Asha Menon  ', pincode: ' 682016 ', addressLine2: '' });

    const req = httpMock.expectOne(ORDERS_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ ...VALID, addressLine2: '' });
    expect(Object.keys(req.request.body).sort()).toEqual([
      'addressLine1', 'addressLine2', 'city', 'deliveryNotes', 'fullName', 'phone', 'pincode', 'state',
    ]);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(orderDetail());
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Order placed');
    expect(el.textContent).toContain('order-1');
    expect(el.textContent).toContain('Pending');
    expect(el.textContent).toContain(`₹${(85998).toLocaleString('en-IN')}`);
    expect(el.textContent).toContain('Aria 3-Seater Fabric Sofa');
    expect(el.textContent).toContain('No payment was taken');
    expect(el.textContent).not.toContain('Payment complete');
    expect(cart.lines()).toEqual([]);
    expect(cart.totalQty()).toBe(0);
    // "Delivering to" block on the confirmation
    const delivering = el.querySelector('section[aria-label="Delivering to"]') as HTMLElement;
    expect(delivering).toBeTruthy();
    expect(delivering.textContent).toContain('Delivering to');
    expect(delivering.textContent).toContain('Asha Menon');
    expect(delivering.textContent).toContain('9876543210');
    expect(delivering.textContent).toContain('12 MG Road, Near City Mall');
    expect(delivering.textContent).toContain('Kochi, Kerala 682016');
    expect(delivering.textContent).toContain('Call before delivery.');
    // the form is gone
    expect(el.querySelector('form')).toBeFalsy();
  });

  it('does not issue duplicate POSTs on repeated clicks', async () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    const cmp = fixture.componentInstance;
    openDelivery(fixture);
    await fill(fixture, VALID);
    cmp.confirmOrder();
    cmp.confirmOrder();
    cmp.confirmOrder();
    fixture.detectChanges();
    expect(confirmButton(fixture)?.disabled).toBe(true);
    httpMock.expectOne(ORDERS_URL).flush(orderDetail());
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Order placed');
  });

  it('keeps the cart and the typed details when ordering fails, with a working retry', async () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    await placeWithDelivery(fixture);
    httpMock.expectOne(ORDERS_URL).flush({ title: 'The cart is empty.' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    let el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('The cart is empty.');
    expect(cart.lines().length).toBe(1);
    // the customer is still on the form, with everything they typed
    expect(el.querySelector('form')).toBeTruthy();
    expect((el.querySelector('[name="fullName"]') as HTMLInputElement).value).toBe('Asha Menon');

    const retry = Array.from(el.querySelectorAll('.cart-error button')).find((b) =>
      (b as HTMLElement).textContent?.includes('Try again')
    ) as HTMLButtonElement;
    retry.click();
    const again = httpMock.expectOne(ORDERS_URL);
    expect(again.request.body).toEqual(VALID);
    again.flush(orderDetail());
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Order placed');
  });

  it('logs out and clears the cart on 401, consistently with cart errors', async () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    const auth = TestBed.inject(AuthService);
    await placeWithDelivery(fixture);
    httpMock.expectOne(ORDERS_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(auth.isAuthenticated()).toBe(false);
    expect(cart.lines()).toEqual([]);
    expect(fixture.componentInstance.checkingOut()).toBe(false);
    expect(fixture.componentInstance.delivery().fullName).toBe('');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Log in to view your saved cart'
    );
  });

  it('disables Place Order when a line is unavailable', () => {
    setupAuthenticated(cartDto([line({ id: 'item-9', isAvailable: false })]));
    const fixture = setup();
    const button = placeOrderButton(fixture);
    expect(button?.disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('unavailable items');
    fixture.componentInstance.placeOrder();
    fixture.detectChanges();
    // the delivery step never opens for a cart that cannot be ordered
    expect(fixture.componentInstance.checkingOut()).toBe(false);
    expect(fixture.nativeElement.querySelector('form')).toBeFalsy();
    httpMock.expectNone(ORDERS_URL);
  });

  it('shows no Place Order for an empty cart', () => {
    setupAuthenticated(cartDto([]));
    const el = setup().nativeElement as HTMLElement;
    expect(el.textContent).toContain('Your cart is empty');
    expect(el.querySelector('.summary .btn-block')).toBeFalsy();
  });

  it('shows no Place Order while logged out and issues no order request', () => {
    setupAnonymous();
    const fixture = setup();
    fixture.componentInstance.placeOrder();
    expect(placeOrderButton(fixture)).toBeFalsy();
  });

  it('clears order state on logout so the next user starts clean', async () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    await placeWithDelivery(fixture);
    httpMock.expectOne(ORDERS_URL).flush(orderDetail());
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Order placed');

    TestBed.inject(AuthService).logout();
    cart.clear();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Log in to view your saved cart'
    );
  });

  it('the order screen leaves no stale delivery details for the next order', async () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    await placeWithDelivery(fixture);
    httpMock.expectOne(ORDERS_URL).flush(orderDetail());
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp.checkingOut()).toBe(false);
    expect(cmp.delivery().fullName).toBe('');
    expect(cmp.delivery().pincode).toBe('');
  });

  it('keeps the existing wording: "No payment is taken yet." stays on the cart and the form', () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    expect(fixture.nativeElement.textContent).toContain('No payment is taken yet.');
    openDelivery(fixture);
    expect(fixture.nativeElement.textContent).toContain('No payment is taken yet.');
  });

  it('the Place Order button is not usable while the form is open (Confirm is the only way to submit)', () => {
    setupAuthenticated(cartDto([line({ id: 'item-1' })]));
    const fixture = setup();
    openDelivery(fixture);
    expect(placeOrderButton(fixture)?.disabled).toBe(true);
  });
});

describe('deliveryFieldError (same rules as the server)', () => {
  it('requires the six required fields and treats blanks as missing', () => {
    for (const f of ['fullName', 'phone', 'addressLine1', 'city', 'state', 'pincode'] as const) {
      expect(deliveryFieldError(f, '')).toContain('is required.');
      expect(deliveryFieldError(f, '   ')).toContain('is required.');
    }
    expect(deliveryFieldError('addressLine2', '')).toBeNull();
    expect(deliveryFieldError('deliveryNotes', '   ')).toBeNull();
  });

  it('measures lengths after trimming', () => {
    expect(deliveryFieldError('fullName', ' a ')).toBe('Full name must be 2 to 100 characters.');
    expect(deliveryFieldError('fullName', 'ab')).toBeNull();
    expect(deliveryFieldError('fullName', 'a'.repeat(100))).toBeNull();
    expect(deliveryFieldError('fullName', 'a'.repeat(101))).toBe('Full name must be 2 to 100 characters.');
    expect(deliveryFieldError('fullName', '  ' + 'a'.repeat(100) + '  ')).toBeNull();
    expect(deliveryFieldError('addressLine1', 'a'.repeat(200))).toBeNull();
    expect(deliveryFieldError('addressLine1', 'a'.repeat(201))).toBe('Address line 1 must be at most 200 characters.');
    expect(deliveryFieldError('addressLine2', 'a'.repeat(201))).toBe('Address line 2 must be at most 200 characters.');
    expect(deliveryFieldError('city', 'a'.repeat(101))).toBe('City must be at most 100 characters.');
    expect(deliveryFieldError('state', 'a'.repeat(101))).toBe('State must be at most 100 characters.');
    expect(deliveryFieldError('deliveryNotes', 'a'.repeat(500))).toBeNull();
    expect(deliveryFieldError('deliveryNotes', 'a'.repeat(501))).toBe('Delivery notes must be at most 500 characters.');
  });

  it('accepts a 10 digit mobile with an optional +91 prefix, spaces and hyphens', () => {
    for (const ok of ['9876543210', '+919876543210', '+91 98765 43210', '98765-43210', ' 9876543210 ']) {
      expect(deliveryFieldError('phone', ok)).toBeNull();
    }
  });

  it('rejects anything else as a phone number', () => {
    for (const bad of ['987654321', '98765432101', '+91987654321', '98765abcde', '+1 9876543210', '++919876543210', '(98765) 43210', 'phone']) {
      expect(deliveryFieldError('phone', bad)).toBe('Phone must be a 10 digit mobile number.');
    }
  });

  it('accepts exactly 6 digits for the pincode', () => {
    for (const ok of ['682016', '000000', ' 682016 ']) expect(deliveryFieldError('pincode', ok)).toBeNull();
    for (const bad of ['68201', '6820161', '68201a', '682 016', '-82016', 'pincode']) {
      expect(deliveryFieldError('pincode', bad)).toBe('Pincode must be 6 digits.');
    }
  });

  it('never throws on a missing value', () => {
    expect(deliveryFieldError('fullName', undefined as unknown as string)).toContain('is required.');
    expect(deliveryFieldError('addressLine2', null as unknown as string)).toBeNull();
  });
});