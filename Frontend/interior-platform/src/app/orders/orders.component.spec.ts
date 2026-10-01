import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { OrdersComponent } from './orders.component';
import type { OrderDetailDto, OrderSummaryDto } from './order.service';
import { environment } from '../../environments/environment';

const ORDERS_URL = `${environment.apiBaseUrl}/api/orders`;
const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;
const TOKEN = 'test-jwt';

function summary(partial: Partial<OrderSummaryDto> & { id: string }): OrderSummaryDto {
  return {
    status: 0,
    createdAt: '2026-10-01T10:00:00Z',
    subtotal: 85998,
    itemCount: 2,
    ...partial,
  };
}

function detail(partial: Partial<OrderDetailDto> & { id: string }): OrderDetailDto {
  return {
    status: 0,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T11:00:00Z',
    subtotal: 85998,
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
    ...partial,
  };
}

describe('OrdersComponent', () => {
  let httpMock: HttpTestingController;

  function setupAuthenticated(list: OrderSummaryDto[]) {
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      imports: [OrdersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    // Component construction fires the constructor load for the session.
    const fixture = TestBed.createComponent(OrdersComponent);
    fixture.detectChanges();
    httpMock.expectOne(ORDERS_URL).flush(list);
    httpMock.verify();
    fixture.detectChanges();
    return fixture;
  }

  function setupAnonymous() {
    TestBed.configureTestingModule({
      imports: [OrdersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(OrdersComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify();
    localStorage.clear();
  });

  it('loads the authenticated order list with Bearer auth', () => {
    const fixture = setupAuthenticated([summary({ id: 'order-2' }), summary({ id: 'order-1', status: 3 })]);
    const cmp = fixture.componentInstance;
    expect(cmp.list()?.length).toBe(2);
    // Backend order is preserved (newest first comes from the server).
    expect(cmp.list()![0].id).toBe('order-2');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('order-2');
    expect(el.textContent).toContain('Pending');
    expect(el.textContent).toContain('Completed');
    expect(el.textContent).toContain(`₹${(85998).toLocaleString('en-IN')}`);
  });

  it('renders ID, status, date, item count and subtotal per row', () => {
    const fixture = setupAuthenticated([summary({ id: 'order-7', itemCount: 3, subtotal: 100500 })]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('order-7');
    expect(el.textContent).toContain('Pending');
    expect(el.textContent).toContain('3 items');
    expect(el.textContent).toContain(`₹${(100500).toLocaleString('en-IN')}`);
    expect(el.querySelector('.order-rows')).toBeTruthy();
  });

  it('shows an empty state with a browse action', () => {
    const fixture = setupAuthenticated([]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No orders yet');
    let browsed = false;
    fixture.componentInstance.browse.subscribe(() => (browsed = true));
    (el.querySelector('.orders-empty .btn-primary') as HTMLButtonElement).click();
    expect(browsed).toBeTrue();
  });

  it('shows a loading state while fetching', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      imports: [OrdersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(OrdersComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading your orders');
    httpMock.expectOne(ORDERS_URL).flush([]);
  });

  it('shows list errors with a retry that reloads', () => {
    const fixture = setupAuthenticated([]);
    const cmp = fixture.componentInstance;
    cmp.loadOrders();
    httpMock.expectOne(ORDERS_URL).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');

    (el.querySelector('.orders-error button') as HTMLButtonElement).click();
    httpMock.expectOne(ORDERS_URL).flush([summary({ id: 'order-1' })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('order-1');
  });

  it('asks logged-out visitors to log in and calls no order endpoints', () => {
    const fixture = setupAnonymous();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Log in to view your orders');
  });

  it('selecting an order loads its detail from snapshots, never the Product API', () => {
    const fixture = setupAuthenticated([summary({ id: 'order-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('order-1');
    fixture.detectChanges();
    // Stale data is impossible: the previous (empty) detail stays empty.
    expect(cmp.selected()).toBeNull();

    const req = httpMock.expectOne(`${ORDERS_URL}/order-1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(detail({ id: 'order-1' }));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('order-1');
    expect(el.textContent).toContain('Pending');
    expect(el.textContent).toContain('Aria 3-Seater Fabric Sofa');
    expect(el.textContent).toContain(`₹${(42999).toLocaleString('en-IN')}`);
    expect(el.textContent).toContain(`₹${(85998).toLocaleString('en-IN')}`);
    httpMock.expectNone(PRODUCTS_URL);
  });

  it('clears stale detail while loading another order', () => {
    const fixture = setupAuthenticated([summary({ id: 'order-1' }), summary({ id: 'order-2' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('order-1');
    httpMock.expectOne(`${ORDERS_URL}/order-1`).flush(detail({ id: 'order-1' }));
    expect(cmp.selected()?.id).toBe('order-1');

    cmp.viewDetails('order-2');
    fixture.detectChanges();
    expect(cmp.selected()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading order');
    httpMock.expectOne(`${ORDERS_URL}/order-2`).flush(detail({ id: 'order-2' }));
    fixture.detectChanges();
    expect(cmp.selected()?.id).toBe('order-2');
  });

  it('shows not-found with a back action that needs no refetch', () => {
    const fixture = setupAuthenticated([summary({ id: 'order-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('order-9');
    httpMock.expectOne(`${ORDERS_URL}/order-9`).flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Order not found');

    (el.querySelector('.orders-empty .btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('order-1');
  });

  it('shows detail errors with a retry', () => {
    const fixture = setupAuthenticated([summary({ id: 'order-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('order-1');
    httpMock.expectOne(`${ORDERS_URL}/order-1`).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();

    cmp.retryDetail();
    httpMock.expectOne(`${ORDERS_URL}/order-1`).flush(detail({ id: 'order-1' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aria 3-Seater Fabric Sofa');
  });

  it('uses the shared status mapping without duplicating it', () => {
    const fixture = setupAuthenticated([
      summary({ id: 'order-p', status: 0 }),
      summary({ id: 'order-c', status: 3, subtotal: 10, itemCount: 1 }),
    ]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Pending');
    expect(el.textContent).toContain('Completed');
  });

  it('401 resets the view and follows the existing logout behavior', async () => {
    const fixture = setupAuthenticated([summary({ id: 'order-1' })]);
    const auth = TestBed.inject(AuthService);
    const cmp = fixture.componentInstance;

    cmp.loadOrders();
    httpMock.expectOne(ORDERS_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(cmp.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to view your orders');
  });

  it('logout mid-visit clears the list so the next user starts clean', async () => {
    const fixture = setupAuthenticated([summary({ id: 'order-1' })]);
    expect(fixture.componentInstance.list()?.length).toBe(1);

    TestBed.inject(AuthService).logout();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to view your orders');
  });

  it('loads the list after a mid-visit login', async () => {
    const fixture = setupAnonymous();
    const auth = TestBed.inject(AuthService);

    auth.login('a@test.local', 'secret123').subscribe();
    httpMock.expectOne(LOGIN_URL).flush({ Token: TOKEN });
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(ORDERS_URL).flush([summary({ id: 'order-1' })]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('order-1');
  });

  it('emits browse to return to the Furniture catalogue', () => {
    const fixture = setupAnonymous();
    let browsed = false;
    fixture.componentInstance.browse.subscribe(() => (browsed = true));
    fixture.componentInstance.goBrowse();
    expect(browsed).toBeTrue();
  });
});
