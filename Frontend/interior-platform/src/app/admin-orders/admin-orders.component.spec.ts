import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { AdminOrdersComponent } from './admin-orders.component';
import type {
  AdminOrderDetailDto,
  AdminOrderSummaryDto,
} from '../orders/order.service';
import { environment } from '../../environments/environment';

const ADMIN_ORDERS_URL = `${environment.apiBaseUrl}/api/admin/orders`;
const CUSTOMER_ORDERS_URL = `${environment.apiBaseUrl}/api/orders`;
const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;

const DOTNET_ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

/** Minimal unsigned JWT carrying role claims (tests only). */
function jwtWithRoles(roles: string[]): string {
  const enc = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ [DOTNET_ROLE_CLAIM]: roles })}.sig`;
}

const ADMIN_JWT = jwtWithRoles(['Admin']);
const STAFF_JWT = jwtWithRoles(['FieldStaff']);
const CUSTOMER_JWT = jwtWithRoles(['Customer']);

function adminRow(partial: Partial<AdminOrderSummaryDto> & { id: string }): AdminOrderSummaryDto {
  return {
    userId: 'user-a',
    customerEmail: 'a@test.local',
    status: 0,
    createdAt: '2026-10-01T10:00:00Z',
    subtotal: 85998,
    itemCount: 2,
    ...partial,
  };
}

function adminDetail(partial: Partial<AdminOrderDetailDto> & { id: string }): AdminOrderDetailDto {
  return {
    userId: 'user-a',
    customerEmail: 'a@test.local',
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

describe('AdminOrdersComponent', () => {
  let httpMock: HttpTestingController;

  function setup(token: string | null) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    TestBed.configureTestingModule({
      imports: [AdminOrdersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminOrdersComponent);
    fixture.detectChanges();
    return fixture;
  }

  function setupAdmin(list: AdminOrderSummaryDto[]) {
    const fixture = setup(ADMIN_JWT);
    httpMock.expectOne(ADMIN_ORDERS_URL).flush(list);
    httpMock.verify();
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

  it('loads every order with Bearer auth and renders operational rows', () => {
    const fixture = setupAdmin([
      adminRow({ id: 'order-2', userId: 'user-b', customerEmail: 'b@test.local' }),
      adminRow({ id: 'order-1', status: 3 }),
    ]);
    const cmp = fixture.componentInstance;
    expect(cmp.list()?.length).toBe(2);
    // Server order is preserved as returned.
    expect(cmp.list()![0].id).toBe('order-2');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('b@test.local');
    expect(el.textContent).toContain('a@test.local');
    expect(el.textContent).toContain('Pending');
    expect(el.textContent).toContain('Completed');
    expect(el.textContent).toContain('2 items');
    expect(el.textContent).toContain(`₹${(85998).toLocaleString('en-IN')}`);
    expect(el.querySelector('.order-rows')).toBeTruthy();
  });

  it('shows short identifiers in rows and the full id in detail', () => {
    const fixture = setupAdmin([adminRow({ id: 'order-abcdef-1234' })]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('order-ab');

    const cmp = fixture.componentInstance;
    cmp.viewDetails('order-abcdef-1234');
    httpMock.expectOne(`${ADMIN_ORDERS_URL}/order-abcdef-1234`).flush(
      adminDetail({ id: 'order-abcdef-1234' })
    );
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('order-abcdef-1234');
  });

  it('shows an empty state when no orders exist', () => {
    const fixture = setupAdmin([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No orders yet');
  });

  it('shows a loading state while fetching', () => {
    const fixture = setup(ADMIN_JWT);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading orders');
    httpMock.expectOne(ADMIN_ORDERS_URL).flush([]);
  });

  it('shows list errors with a retry that reloads', () => {
    const fixture = setupAdmin([]);
    const cmp = fixture.componentInstance;
    cmp.loadOrders();
    httpMock.expectOne(ADMIN_ORDERS_URL).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');

    (el.querySelector('.admin-orders-error button') as HTMLButtonElement).click();
    httpMock.expectOne(ADMIN_ORDERS_URL).flush([adminRow({ id: 'order-1' })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('a@test.local');
  });

  it('selecting an order loads detail with snapshot items, never the Product API', () => {
    const fixture = setupAdmin([adminRow({ id: 'order-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('order-1');
    fixture.detectChanges();
    expect(cmp.selected()).toBeNull();

    const req = httpMock.expectOne(`${ADMIN_ORDERS_URL}/order-1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${ADMIN_JWT}`);
    req.flush(adminDetail({ id: 'order-1' }));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('order-1');
    expect(el.textContent).toContain('a@test.local');
    expect(el.textContent).toContain('Pending');
    expect(el.textContent).toContain('Aria 3-Seater Fabric Sofa');
    expect(el.textContent).toContain('aria-3s-sofa');
    expect(el.textContent).toContain('× 2');
    expect(el.textContent).toContain(`₹${(42999).toLocaleString('en-IN')} each`);
    expect(el.textContent).toContain(`₹${(85998).toLocaleString('en-IN')}`);
    httpMock.expectNone(PRODUCTS_URL);
    httpMock.expectNone(CUSTOMER_ORDERS_URL);
  });

  it('shows not-found with a back action that needs no refetch', () => {
    const fixture = setupAdmin([adminRow({ id: 'order-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('order-9');
    httpMock.expectOne(`${ADMIN_ORDERS_URL}/order-9`).flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Order not found');

    (el.querySelector('.admin-orders-empty .btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('a@test.local');
  });

  it('shows detail errors with a retry', () => {
    const fixture = setupAdmin([adminRow({ id: 'order-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('order-1');
    httpMock.expectOne(`${ADMIN_ORDERS_URL}/order-1`).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();

    cmp.retryDetail();
    httpMock.expectOne(`${ADMIN_ORDERS_URL}/order-1`).flush(adminDetail({ id: 'order-1' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aria 3-Seater Fabric Sofa');
  });

  it('back returns to the list without an unnecessary refetch', () => {
    const fixture = setupAdmin([adminRow({ id: 'order-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('order-1');
    httpMock.expectOne(`${ADMIN_ORDERS_URL}/order-1`).flush(adminDetail({ id: 'order-1' }));
    fixture.detectChanges();
    cmp.backToList();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('a@test.local');
    httpMock.expectNone(ADMIN_ORDERS_URL);
  });

  it('asks logged-out visitors to log in and calls no admin endpoints', () => {
    const fixture = setup(null);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to access the Orders workspace');
    httpMock.expectNone(ADMIN_ORDERS_URL);
  });

  it('field staff sees access-denied and loads no admin data', () => {
    const fixture = setup(STAFF_JWT);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "You don't have access to this workspace."
    );
    expect(fixture.componentInstance.canAccess()).toBe(false);
    httpMock.expectNone(ADMIN_ORDERS_URL);
    httpMock.expectNone(CUSTOMER_ORDERS_URL);
  });

  it('customers see access-denied and load no admin data', () => {
    const fixture = setup(CUSTOMER_JWT);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "You don't have access to this workspace."
    );
    expect(fixture.componentInstance.canAccess()).toBe(false);
    httpMock.expectNone(ADMIN_ORDERS_URL);
    httpMock.expectNone(CUSTOMER_ORDERS_URL);
  });

  it('direct access attempts by non-admins issue no requests', () => {
    const fixture = setup(STAFF_JWT);
    const cmp = fixture.componentInstance;
    expect(cmp.canAccess()).toBe(false);
    cmp.loadOrders();
    cmp.viewDetails('order-1');
    expect(cmp.list()).toBeNull();
    expect(cmp.selected()).toBeNull();
    httpMock.expectNone(ADMIN_ORDERS_URL);
  });

  it('403 produces an access-denied state', () => {
    const fixture = setup(ADMIN_JWT);
    httpMock.expectOne(ADMIN_ORDERS_URL).flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "You don't have access to this workspace."
    );
  });

  it('401 follows the existing logout/reset behavior', async () => {
    const fixture = setupAdmin([adminRow({ id: 'order-1' })]);
    const auth = TestBed.inject(AuthService);
    const cmp = fixture.componentInstance;

    cmp.loadOrders();
    httpMock.expectOne(ADMIN_ORDERS_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(cmp.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to access the Orders workspace');
  });

  it('logout mid-visit clears the list so the next user starts clean', async () => {
    const fixture = setupAdmin([adminRow({ id: 'order-1' })]);
    expect(fixture.componentInstance.list()?.length).toBe(1);

    TestBed.inject(AuthService).logout();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to access the Orders workspace');
  });

  it('loads the list after a mid-visit login', async () => {
    const fixture = setup(null);
    const auth = TestBed.inject(AuthService);

    auth.login('admin@test.local', 'secret123').subscribe();
    httpMock.expectOne(LOGIN_URL).flush({ Token: ADMIN_JWT });
    await fixture.whenStable();
    fixture.detectChanges();
    // Admin session established after login: the workspace loads itself.
    httpMock.expectOne(ADMIN_ORDERS_URL).flush([adminRow({ id: 'order-1' })]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('a@test.local');
  });

  it('stores no order data in browser storage', () => {
    const fixture = setupAdmin([adminRow({ id: 'order-1' })]);
    const cmp = fixture.componentInstance;
    const localSet = spyOn(localStorage, 'setItem').and.callThrough();
    const sessionSet = spyOn(sessionStorage, 'setItem').and.callThrough();

    cmp.viewDetails('order-1');
    httpMock.expectOne(`${ADMIN_ORDERS_URL}/order-1`).flush(adminDetail({ id: 'order-1' }));
    fixture.detectChanges();

    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });
});
