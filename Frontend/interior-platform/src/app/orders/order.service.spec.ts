import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import {
  OrderService,
  orderStatusLabel,
  type AdminOrderDetailDto,
  type AdminOrderSummaryDto,
  type OrderDetailDto,
} from './order.service';
import { environment } from '../../environments/environment';

const ORDERS_URL = `${environment.apiBaseUrl}/api/orders`;
const ADMIN_ORDERS_URL = `${environment.apiBaseUrl}/api/admin/orders`;
const TOKEN = 'test-jwt';

function detail(): OrderDetailDto {
  return {
    id: 'order-1',
    status: 0,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
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
  };
}

describe('OrderService', () => {
  let orders: OrderService;
  let httpMock: HttpTestingController;

  function setup(token: string | null) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    orders = TestBed.inject(OrderService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify();
    localStorage.clear();
  });

  const DELIVERY = {
    fullName: 'Asha Menon',
    phone: '9876543210',
    addressLine1: '12 MG Road',
    addressLine2: 'Near City Mall',
    city: 'Kochi',
    state: 'Kerala',
    pincode: '682016',
    deliveryNotes: 'Call before delivery.',
  };

  it('createOrder posts exactly the 8 delivery fields with Bearer auth', () => {
    setup(TOKEN);
    let received: OrderDetailDto | null = null;
    orders.createOrder(DELIVERY).subscribe((o) => (received = o));
    const req = httpMock.expectOne(ORDERS_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(DELIVERY);
    // No userId, product data, prices, totals or status may leave the client.
    expect(Object.keys(req.request.body).sort()).toEqual([
      'addressLine1', 'addressLine2', 'city', 'deliveryNotes', 'fullName', 'phone', 'pincode', 'state',
    ]);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(detail());
    expect(received!.id).toBe('order-1');
    expect(received!.status).toBe(0);
  });

  it('getOrders lists with Bearer auth', () => {
    setup(TOKEN);
    let received: unknown = null;
    orders.getOrders().subscribe((o) => (received = o));
    const req = httpMock.expectOne(ORDERS_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush([{ id: 'order-1', status: 0, createdAt: '2026-10-01T10:00:00Z', subtotal: 100, itemCount: 1 }]);
    expect(Array.isArray(received)).toBe(true);
  });

  it('getOrder fetches one order by id with Bearer auth', () => {
    setup(TOKEN);
    let received: OrderDetailDto | null = null;
    orders.getOrder('order-9').subscribe((o) => (received = o));
    const req = httpMock.expectOne(`${ORDERS_URL}/order-9`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(detail());
    expect(received!.id).toBe('order-1');
  });

  it('sends no Authorization header when logged out', () => {
    setup(null);
    orders.getOrders().subscribe({ error: () => undefined });
    const req = httpMock.expectOne(ORDERS_URL);
    expect(req.request.headers.get('Authorization')).toBeNull();
    req.flush([]);
  });

  it('labels order statuses', () => {
    expect(orderStatusLabel(0)).toBe('Pending');
    expect(orderStatusLabel(1)).toBe('Confirmed');
    expect(orderStatusLabel(4)).toBe('Cancelled');
    expect(orderStatusLabel(99)).toBe('Unknown');
  });

  it('getAdminOrders lists every order with Bearer auth', () => {
    setup(TOKEN);
    let received: AdminOrderSummaryDto[] | null = null;
    orders.getAdminOrders().subscribe((o) => (received = o));
    const req = httpMock.expectOne(ADMIN_ORDERS_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush([
      {
        id: 'order-2',
        userId: 'user-b',
        customerEmail: 'b@test.local',
        status: 0,
        createdAt: '2026-10-01T10:00:00Z',
        subtotal: 100,
        itemCount: 1,
      },
    ]);
    expect(received!.length).toBe(1);
    expect(received![0].userId).toBe('user-b');
    expect(received![0].customerEmail).toBe('b@test.local');
  });

  it('getAdminOrder fetches one order by id with Bearer auth', () => {
    setup(TOKEN);
    let received: AdminOrderDetailDto | null = null;
    orders.getAdminOrder('order-9').subscribe((o) => (received = o));
    const req = httpMock.expectOne(`${ADMIN_ORDERS_URL}/order-9`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush({
      id: 'order-9',
      userId: 'user-a',
      customerEmail: 'a@test.local',
      status: 0,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
      subtotal: 200,
      items: [],
    });
    expect(received!.id).toBe('order-9');
    expect(received!.userId).toBe('user-a');
  });

  it('admin calls use the admin route, never the customer route', () => {
    setup(TOKEN);
    orders.getAdminOrders().subscribe();
    orders.getAdminOrder('order-1').subscribe();
    const listReq = httpMock.expectOne(ADMIN_ORDERS_URL);
    const detailReq = httpMock.expectOne(`${ADMIN_ORDERS_URL}/order-1`);
    expect(listReq.request.method).toBe('GET');
    expect(detailReq.request.method).toBe('GET');
    expect(listReq.request.urlWithParams).toBe(ADMIN_ORDERS_URL);
    expect(detailReq.request.urlWithParams).toBe(`${ADMIN_ORDERS_URL}/order-1`);
    listReq.flush([]);
    detailReq.flush(null);
    httpMock.expectNone(ORDERS_URL);
  });
  it('updateAdminOrderStatus PATCHes only the status with Bearer auth', () => {
    setup(TOKEN);
    let received: AdminOrderDetailDto | null = null;
    orders.updateAdminOrderStatus('order-1', 1).subscribe((o) => (received = o));
    const req = httpMock.expectOne(`${ADMIN_ORDERS_URL}/order-1/status`);
    expect(req.request.method).toBe('PATCH');
    // Nothing but the new status may leave the client: no items, prices or owner.
    expect(req.request.body).toEqual({ status: 1 });
    expect(Object.keys(req.request.body)).toEqual(['status']);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush({
      id: 'order-1', userId: 'user-a', customerEmail: 'a@test.local', status: 1,
      createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T12:00:00Z', subtotal: 85998,
      allowedNextStatuses: [2, 4], items: [],
    });
    const result = received as AdminOrderDetailDto | null;
    expect(result?.status).toBe(1);
    expect(result?.allowedNextStatuses).toEqual([2, 4]);
  });
});
