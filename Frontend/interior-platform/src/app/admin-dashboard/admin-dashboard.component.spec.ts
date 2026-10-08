import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { AdminDashboardComponent } from './admin-dashboard.component';
import type { AppView } from '../app-paths';
import { environment } from '../../environments/environment';

const API = environment.apiBaseUrl;
const LOGIN_URL = `${API}/api/auth/login`;

/** The five existing endpoints behind the five summary cards - no others. */
const URLS = {
  orders: `${API}/api/admin/orders`,
  leads: `${API}/api/leads`,
  proposals: `${API}/api/admin/proposals`,
  products: `${API}/api/products/admin`,
  rate: `${API}/api/admin/estimate-rates`,
} as const;
type Metric = keyof typeof URLS;
const METRICS = Object.keys(URLS) as Metric[];

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

const EXPECTED_ACTIONS: ReadonlyArray<readonly [string, AppView]> = [
  ['Manage products', 'admin-products'],
  ['Manage orders', 'admin-orders'],
  ['Manage proposals', 'admin-proposals'],
  ['Estimate rate', 'admin-rates'],
  ['Leads', 'leads'],
];

// ── response rows (only the fields the cards read matter) ──
const AT = '2026-10-01T10:00:00Z';
const orders = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `o-${i}`, userId: 'u', customerEmail: null, status: 0, createdAt: AT, subtotal: 100, itemCount: 1 }));
const leadsWith = (statuses: number[]) =>
  statuses.map((status, i) => ({ id: `l-${i}`, name: 'Asha', phone: '9876543210', email: null, message: 'Hi', interestedProductId: null, source: null, status, createdAt: AT }));
const newLeads = (n: number) => leadsWith(Array.from({ length: n }, () => 0));
const proposals = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p-${i}`, userId: 'u', customerEmail: null, estimateId: 'e', area: 180, ratePerSquareFoot: 1500, estimatedAmount: 270000, status: 0, createdAt: AT, isPaymentVerified: false, paymentAttemptCount: 0 }));
const products = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `pr-${i}`, name: `Product ${i}`, category: 'Sofas', room: 'Living Room', price: 1000, material: 'm', finish: 'f', blurb: 'b', description: 'd', dimensions: 'x', image: 'https://example.com/i.jpg', details: ['d'], isActive: true }));
const ratesWith = (rows: ReadonlyArray<readonly [number, boolean]>) =>
  rows.map(([ratePerSquareFoot, isActive], i) => ({ id: `r-${i}`, ratePerSquareFoot, isActive, createdAt: AT, createdByEmail: null }));

/** What each endpoint answers when a test does not say otherwise. */
const DEFAULTS: Record<Metric, () => unknown[]> = {
  orders: () => orders(2),
  leads: () => leadsWith([0, 1]),
  proposals: () => proposals(4),
  products: () => products(5),
  rate: () => ratesWith([[1500, true]]),
};
const DEFAULT_VALUES: Record<Metric, string> = { orders: '2', leads: '1', proposals: '4', products: '5', rate: '₹1,500' };

type Overrides = Partial<Record<Metric, unknown[] | 'error'>>;

/** The four count cards: how to build n matching rows and which label they carry. */
const COUNT_CARDS: ReadonlyArray<{ metric: Metric; label: string; rows: (n: number) => unknown[] }> = [
  { metric: 'orders', label: 'Orders', rows: orders },
  { metric: 'leads', label: 'New leads', rows: newLeads },
  { metric: 'proposals', label: 'Proposals', rows: proposals },
  { metric: 'products', label: 'Products', rows: products },
];

describe('AdminDashboardComponent', () => {
  type Fixture = ComponentFixture<AdminDashboardComponent>;

  function create(token: string | null) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    const httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    return { fixture, httpMock };
  }

  /** Takes the one pending request of each card (fails if any is missing or doubled). */
  function take(httpMock: HttpTestingController): Record<Metric, TestRequest> {
    const reqs = {} as Record<Metric, TestRequest>;
    for (const metric of METRICS) {
      reqs[metric] = httpMock.expectOne(URLS[metric]);
    }
    return reqs;
  }

  function answer(reqs: Record<Metric, TestRequest>, overrides: Overrides = {}, only?: readonly Metric[]): void {
    for (const metric of METRICS) {
      if (only && !only.includes(metric)) continue;
      const body = overrides[metric] ?? DEFAULTS[metric]();
      if (body === 'error') {
        reqs[metric].flush(null, { status: 500, statusText: 'Server Error' });
      } else {
        reqs[metric].flush(body);
      }
    }
  }

  /** An Admin dashboard whose five requests are all answered. */
  function openAdmin(overrides: Overrides = {}) {
    const ctx = create(ADMIN_JWT);
    const reqs = take(ctx.httpMock);
    answer(reqs, overrides);
    ctx.fixture.detectChanges();
    return { ...ctx, reqs, cmp: ctx.fixture.componentInstance };
  }

  const root = (f: Fixture) => f.nativeElement as HTMLElement;
  const text = (f: Fixture) => root(f).textContent ?? '';
  const cardEl = (f: Fixture, m: Metric) =>
    root(f).querySelector<HTMLElement>(`.summary-card[data-metric="${m}"]`)!;
  const valueOf = (f: Fixture, m: Metric) => cardEl(f, m).querySelector('.summary-value')?.textContent?.trim() ?? null;
  const cardText = (f: Fixture, m: Metric) => (cardEl(f, m).textContent ?? '').replace(/\s+/g, ' ').trim();
  const retryBtn = (f: Fixture, m: Metric) => cardEl(f, m).querySelector<HTMLButtonElement>('.summary-retry');
  const actionCards = (f: Fixture) => Array.from(root(f).querySelectorAll<HTMLButtonElement>('.action-card'));
  const summaryCards = (f: Fixture) => root(f).querySelectorAll('.summary-card');

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    // Every request a test causes must have been answered: nothing may be left open.
    TestBed.inject(HttpTestingController, null)?.verify();
    localStorage.clear();
  });

  // ── Stage 1: shell and quick actions (unchanged behaviour) ──────────────

  it('shows the Dashboard heading and the five quick actions to an Admin', () => {
    const { fixture } = openAdmin();
    const el = root(fixture);

    expect(el.querySelector('h1')?.textContent).toContain('Dashboard');
    expect(el.querySelector('section[aria-label="Quick actions"]')).toBeTruthy();
    const titles = actionCards(fixture).map((c) => c.querySelector('.action-title')?.textContent?.trim());
    expect(titles).toEqual(EXPECTED_ACTIONS.map(([label]) => label));
    for (const card of actionCards(fixture)) {
      expect(card.querySelector('.action-desc')?.textContent?.trim().length ?? 0).toBeGreaterThan(10);
    }
  });

  it('each quick action asks the shell to open its page', () => {
    const { fixture } = openAdmin();
    const opened: AppView[] = [];
    fixture.componentInstance.navigate.subscribe((view) => opened.push(view));

    for (const [label] of EXPECTED_ACTIONS) {
      actionCards(fixture)
        .find((c) => c.textContent?.includes(label))!
        .click();
    }

    expect(opened).toEqual(EXPECTED_ACTIONS.map(([, view]) => view));
  });

  it('quick actions stay usable while the cards load and when every card has failed', () => {
    const { fixture, httpMock } = create(ADMIN_JWT);
    const reqs = take(httpMock);
    const opened: AppView[] = [];
    fixture.componentInstance.navigate.subscribe((view) => opened.push(view));

    // Still loading.
    expect(actionCards(fixture).length).toBe(5);
    actionCards(fixture)[0].click();

    // Everything failed.
    answer(reqs, { orders: 'error', leads: 'error', proposals: 'error', products: 'error', rate: 'error' });
    fixture.detectChanges();
    expect(actionCards(fixture).length).toBe(5);
    actionCards(fixture)[4].click();

    expect(opened).toEqual(['admin-products', 'leads']);
  });

  // ── Stage 2: data requests ──────────────────────────────────────────────

  it('requests exactly the five existing Admin endpoints, once each, with Bearer auth', () => {
    const { httpMock } = create(ADMIN_JWT);

    for (const metric of METRICS) {
      const req = httpMock.expectOne(URLS[metric]);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe(`Bearer ${ADMIN_JWT}`);
      req.flush([]);
    }
    // Not the public rate endpoint, not a recent-activity or dashboard endpoint.
    httpMock.expectNone(`${API}/api/estimate-rate`);
    httpMock.expectNone(`${API}/api/admin/dashboard`);
  });

  it('shows exactly five summary cards, in order, with no other metric', () => {
    const { fixture } = openAdmin();

    const labels = Array.from(root(fixture).querySelectorAll('.summary-label')).map((l) => l.textContent?.trim());
    expect(labels).toEqual(['Orders', 'New leads', 'Proposals', 'Products', 'Current rate']);
    expect(summaryCards(fixture).length).toBe(5);
    expect(root(fixture).querySelector('section[aria-label="Summary"] h2')?.textContent).toContain('Summary');
    // Stage 3 and revenue/user metrics are not part of this stage.
    expect(text(fixture)).not.toMatch(/recent|revenue|users?\b|chart/i);
  });

  it('shows the real value on every card once the responses arrive', () => {
    const { fixture } = openAdmin();

    for (const metric of METRICS) {
      expect(valueOf(fixture, metric)).withContext(metric).toBe(DEFAULT_VALUES[metric]);
    }
  });

  // ── loading ─────────────────────────────────────────────────────────────

  it('shows Loading… and no number - never a fake zero - until a card\'s response arrives', () => {
    const { fixture, httpMock } = create(ADMIN_JWT);
    const reqs = take(httpMock);

    for (const metric of METRICS) {
      expect(cardText(fixture, metric)).withContext(metric).toContain('Loading…');
      expect(valueOf(fixture, metric)).withContext(metric).toBeNull();
      expect(cardText(fixture, metric)).withContext(metric).not.toMatch(/\d|₹/);
      expect(cardEl(fixture, metric).getAttribute('aria-busy')).withContext(metric).toBe('true');
    }

    // One answer fills only its own card; the rest keep loading.
    answer(reqs, {}, ['orders']);
    fixture.detectChanges();
    expect(valueOf(fixture, 'orders')).toBe('2');
    expect(cardEl(fixture, 'orders').getAttribute('aria-busy')).toBe('false');
    for (const metric of ['leads', 'proposals', 'products', 'rate'] as const) {
      expect(cardText(fixture, metric)).withContext(metric).toContain('Loading…');
      expect(valueOf(fixture, metric)).withContext(metric).toBeNull();
    }

    answer(reqs, {}, ['leads', 'proposals', 'products', 'rate']);
  });

  it('keeps the same card structure while loading, ready and failed so the layout does not jump', () => {
    const { fixture, httpMock } = create(ADMIN_JWT);
    const reqs = take(httpMock);

    for (const metric of METRICS) {
      expect(cardEl(fixture, metric).querySelector('.summary-body')).withContext(`loading ${metric}`).toBeTruthy();
    }
    answer(reqs, { orders: 'error' });
    fixture.detectChanges();
    for (const metric of METRICS) {
      expect(cardEl(fixture, metric).querySelector('.summary-body')).withContext(`settled ${metric}`).toBeTruthy();
      expect(cardEl(fixture, metric).querySelector('.summary-label')).withContext(`label ${metric}`).toBeTruthy();
      expect(cardEl(fixture, metric).querySelector('.summary-caption')).withContext(`caption ${metric}`).toBeTruthy();
    }
  });

  // ── the four count cards ────────────────────────────────────────────────

  for (const { metric, label, rows } of COUNT_CARDS) {
    it(`${label}: shows the count from the API`, () => {
      const { fixture } = openAdmin({ [metric]: rows(7) });
      expect(valueOf(fixture, metric)).toBe('7');
    });

    it(`${label}: an empty result shows 0, as a real value`, () => {
      const { fixture } = openAdmin({ [metric]: [] });
      expect(valueOf(fixture, metric)).toBe('0');
      expect(cardText(fixture, metric)).not.toContain('Loading');
      expect(cardText(fixture, metric)).not.toContain('Unable to load');
    });

    it(`${label}: a failure shows a short message and Retry, with no number or raw error`, () => {
      const { fixture } = openAdmin({ [metric]: 'error' });
      const card = cardText(fixture, metric);

      expect(card).toContain('Unable to load');
      expect(retryBtn(fixture, metric)?.textContent?.trim()).toBe('Retry');
      expect(valueOf(fixture, metric)).toBeNull();
      expect(card).not.toMatch(/\d|500|Server Error|HttpErrorResponse|Http failure/i);
      expect(cardEl(fixture, metric).querySelector('[role="alert"]')).toBeTruthy();
    });

    it(`${label}: Retry re-requests only this card and then shows the value`, () => {
      const { fixture, httpMock } = openAdmin({ [metric]: 'error' });
      const others = METRICS.filter((m) => m !== metric);
      const before = Object.fromEntries(others.map((m) => [m, valueOf(fixture, m)]));

      retryBtn(fixture, metric)!.click();
      fixture.detectChanges();
      expect(cardText(fixture, metric)).toContain('Loading…');
      expect(valueOf(fixture, metric)).toBeNull();
      for (const other of others) {
        httpMock.expectNone(URLS[other]);
      }
      const req = httpMock.expectOne(URLS[metric]);
      expect(req.request.method).toBe('GET');
      req.flush(rows(9));
      fixture.detectChanges();

      expect(valueOf(fixture, metric)).toBe('9');
      expect(retryBtn(fixture, metric)).toBeNull();
      // The other cards were never touched.
      for (const other of others) {
        expect(valueOf(fixture, other)).withContext(other).toBe(before[other]!);
      }
    });

    it(`${label}: a Retry that fails again keeps the message and offers Retry once more`, () => {
      const { fixture, httpMock } = openAdmin({ [metric]: 'error' });

      retryBtn(fixture, metric)!.click();
      httpMock.expectOne(URLS[metric]).flush(null, { status: 503, statusText: 'Service Unavailable' });
      fixture.detectChanges();
      expect(cardText(fixture, metric)).toContain('Unable to load');

      retryBtn(fixture, metric)!.click();
      httpMock.expectOne(URLS[metric]).flush(rows(1));
      fixture.detectChanges();
      expect(valueOf(fixture, metric)).toBe('1');
    });
  }

  it('formats larger counts with Indian digit grouping', () => {
    const { fixture } = openAdmin({ orders: orders(123456) });
    expect(valueOf(fixture, 'orders')).toBe('1,23,456');
  });

  // ── New leads: only status New (0) ──────────────────────────────────────

  it('New leads counts only leads whose status is New', () => {
    const { fixture } = openAdmin({ leads: leadsWith([0, 1, 2, 0, 0, 1, 2]) });
    expect(valueOf(fixture, 'leads')).toBe('3');
  });

  it('New leads does not count In Progress or Closed leads', () => {
    const { fixture } = openAdmin({ leads: leadsWith([1, 1, 2, 2, 2]) });
    expect(valueOf(fixture, 'leads')).toBe('0');
  });

  it('New leads ignores a status the app does not know', () => {
    const { fixture } = openAdmin({ leads: leadsWith([0, 7, -1]) });
    expect(valueOf(fixture, 'leads')).toBe('1');
  });

  // ── Products: the total, active and inactive ────────────────────────────

  it('Products counts every returned product, inactive ones included', () => {
    const rows = products(4).map((p, i) => ({ ...p, isActive: i % 2 === 0 }));
    const { fixture } = openAdmin({ products: rows });

    expect(valueOf(fixture, 'products')).toBe('4');
    expect(cardText(fixture, 'products')).toContain('Active and inactive');
  });

  // ── Current rate ────────────────────────────────────────────────────────

  it('Current rate shows the active row and ignores the inactive history', () => {
    const { fixture } = openAdmin({ rate: ratesWith([[1750.5, false], [1820.25, true], [1500, false]]) });

    expect(valueOf(fixture, 'rate')).toBe('₹1,820.25');
    expect(cardText(fixture, 'rate')).toContain('Current rate');
    expect(cardText(fixture, 'rate')).toContain('per sq.ft.');
    expect(cardText(fixture, 'rate')).not.toContain('1,750.5');
    expect(cardText(fixture, 'rate')).not.toContain('1,500');
  });

  it('Current rate follows the API and never a built-in number', () => {
    const { fixture } = openAdmin({ rate: ratesWith([[2222, true]]) });

    expect(valueOf(fixture, 'rate')).toBe('₹2,222');
    expect(text(fixture)).not.toContain('1,500');
  });

  it('Current rate formats rupees like the rest of the app: no forced decimals, Indian grouping', () => {
    const whole = openAdmin({ rate: ratesWith([[1500, true]]) });
    expect(valueOf(whole.fixture, 'rate')).toBe('₹1,500');
    whole.httpMock.verify();
    TestBed.resetTestingModule();
    localStorage.clear();

    const decimals = openAdmin({ rate: ratesWith([[1820.25, true]]) });
    expect(valueOf(decimals.fixture, 'rate')).toBe('₹1,820.25');
    decimals.httpMock.verify();
    TestBed.resetTestingModule();
    localStorage.clear();

    const lakh = openAdmin({ rate: ratesWith([[100000, true]]) });
    expect(valueOf(lakh.fixture, 'rate')).toBe('₹1,00,000');
  });

  it('Current rate says Unavailable - never ₹0 or a made-up figure - when no rate is active', () => {
    const { fixture } = openAdmin({ rate: ratesWith([[1500, false], [1750.5, false]]) });
    const card = cardText(fixture, 'rate');

    expect(valueOf(fixture, 'rate')).toBe('Unavailable');
    expect(card).toContain('No active rate is set');
    expect(card).not.toMatch(/₹/);
    expect(cardEl(fixture, 'rate').querySelector('.summary-unavailable')).toBeTruthy();
    expect(retryBtn(fixture, 'rate')).toBeNull();
  });

  it('Current rate says Unavailable for an empty history', () => {
    const { fixture } = openAdmin({ rate: [] });

    expect(valueOf(fixture, 'rate')).toBe('Unavailable');
    expect(cardText(fixture, 'rate')).not.toMatch(/₹/);
  });

  it('Current rate treats an unusable active rate (0 or negative) as Unavailable', () => {
    for (const bad of [0, -5]) {
      const { fixture, httpMock } = openAdmin({ rate: ratesWith([[bad, true]]) });
      expect(valueOf(fixture, 'rate')).withContext(String(bad)).toBe('Unavailable');
      expect(cardText(fixture, 'rate')).withContext(String(bad)).not.toContain('₹0');
      httpMock.verify();
      TestBed.resetTestingModule();
      localStorage.clear();
    }
  });

  it('Current rate: a failure shows no number, and Retry re-requests only the rate', () => {
    const { fixture, httpMock } = openAdmin({ rate: 'error' });

    expect(cardText(fixture, 'rate')).toContain('Unable to load');
    expect(cardText(fixture, 'rate')).not.toMatch(/₹|\d/);
    expect(valueOf(fixture, 'rate')).toBeNull();

    retryBtn(fixture, 'rate')!.click();
    for (const other of ['orders', 'leads', 'proposals', 'products'] as const) {
      httpMock.expectNone(URLS[other]);
    }
    httpMock.expectOne(URLS.rate).flush(ratesWith([[1820.25, true]]));
    fixture.detectChanges();

    expect(valueOf(fixture, 'rate')).toBe('₹1,820.25');
  });

  it('Current rate reads the Admin history endpoint, never the public rate endpoint', () => {
    const { httpMock } = create(ADMIN_JWT);

    httpMock.expectNone(`${API}/api/estimate-rate`);
    const reqs = take(httpMock);
    expect(reqs.rate.request.url).toBe(`${API}/api/admin/estimate-rates`);
    answer(reqs);
  });

  // ── independent failures ────────────────────────────────────────────────

  for (const failing of METRICS) {
    it(`when only ${failing} fails, the other four cards still show their values`, () => {
      const { fixture } = openAdmin({ [failing]: 'error' });

      expect(cardText(fixture, failing)).toContain('Unable to load');
      for (const other of METRICS.filter((m) => m !== failing)) {
        expect(valueOf(fixture, other)).withContext(other).toBe(DEFAULT_VALUES[other]);
        expect(cardText(fixture, other)).withContext(other).not.toContain('Unable to load');
      }
      expect(actionCards(fixture).length).toBe(5);
    });
  }

  it('several failures stay independent: retrying one leaves the other failed card failed', () => {
    const { fixture, httpMock } = openAdmin({ orders: 'error', products: 'error' });

    retryBtn(fixture, 'orders')!.click();
    httpMock.expectOne(URLS.orders).flush(orders(3));
    fixture.detectChanges();

    expect(valueOf(fixture, 'orders')).toBe('3');
    expect(cardText(fixture, 'products')).toContain('Unable to load');
    expect(retryBtn(fixture, 'products')).toBeTruthy();
    expect(valueOf(fixture, 'leads')).toBe('1');
  });

  it('Retry does nothing for a card that has not failed, so no request is doubled', () => {
    const { fixture, cmp, httpMock } = openAdmin({ orders: 'error' });

    cmp.retry('leads');
    cmp.retry('rate');
    httpMock.expectNone(URLS.leads);
    httpMock.expectNone(URLS.rate);

    cmp.retry('orders');
    cmp.retry('orders');
    cmp.retry('orders');
    fixture.detectChanges();
    httpMock.expectOne(URLS.orders).flush(orders(1));
  });

  // ── access ──────────────────────────────────────────────────────────────

  it('asks a logged-out visitor to log in and makes no request', () => {
    const { fixture, httpMock } = create(null);

    expect(text(fixture)).toContain('Log in to access the Admin dashboard');
    expect(actionCards(fixture).length).toBe(0);
    expect(summaryCards(fixture).length).toBe(0);
    for (const metric of METRICS) {
      httpMock.expectNone(URLS[metric]);
    }
  });

  for (const [who, token] of [['Field Staff', STAFF_JWT], ['a customer', CUSTOMER_JWT]] as const) {
    it(`shows access-denied to ${who}: no numbers, no shortcuts, and no API request`, () => {
      const { fixture, httpMock } = create(token);

      expect(text(fixture)).toContain("You don't have access to this workspace.");
      expect(text(fixture)).toContain('This workspace is for Admin accounts.');
      expect(actionCards(fixture).length).toBe(0);
      expect(summaryCards(fixture).length).toBe(0);
      expect(root(fixture).querySelector('[role="alert"]')).toBeTruthy();
      for (const metric of METRICS) {
        httpMock.expectNone(URLS[metric]);
      }
    });

    it(`${who} calling open() or retry() directly navigates nowhere and requests nothing`, () => {
      const { fixture, httpMock } = create(token);
      const opened: AppView[] = [];
      fixture.componentInstance.navigate.subscribe((view) => opened.push(view));

      fixture.componentInstance.open('admin-orders');
      fixture.componentInstance.open('leads');
      for (const metric of METRICS) {
        fixture.componentInstance.retry(metric);
        httpMock.expectNone(URLS[metric]);
      }

      expect(opened).toEqual([]);
    });
  }

  it('a 401 from any card logs the session out and leaves no numbers on screen', () => {
    const { fixture, httpMock } = create(ADMIN_JWT);
    const reqs = take(httpMock);

    reqs.orders.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(text(fixture)).toContain('Log in to access the Admin dashboard');
    expect(summaryCards(fixture).length).toBe(0);

    // The other four answers arrive late and are ignored.
    answer(reqs, {}, ['leads', 'proposals', 'products', 'rate']);
    fixture.detectChanges();
    expect(summaryCards(fixture).length).toBe(0);
    expect(fixture.componentInstance.cards().every((c) => c.status === 'loading' && c.display === '')).toBeTrue();
  });

  it('logging out removes the numbers and the shortcuts so the next session starts clean', () => {
    const { fixture } = openAdmin();
    expect(summaryCards(fixture).length).toBe(5);
    expect(actionCards(fixture).length).toBe(5);

    TestBed.inject(AuthService).logout();
    fixture.detectChanges();

    expect(summaryCards(fixture).length).toBe(0);
    expect(actionCards(fixture).length).toBe(0);
    expect(text(fixture)).toContain('Log in to access the Admin dashboard');
    expect(text(fixture)).not.toMatch(/1,500|₹/);
  });

  it('a late answer from a logged-out session is ignored, and logging in again loads fresh numbers', () => {
    const { fixture, httpMock } = create(ADMIN_JWT);
    const first = take(httpMock);
    answer(first, {}, ['leads', 'proposals', 'products', 'rate']);
    fixture.detectChanges();

    // Log out while the Orders request is still in flight.
    TestBed.inject(AuthService).logout();
    fixture.detectChanges();
    first.orders.flush(orders(99));
    fixture.detectChanges();
    expect(summaryCards(fixture).length).toBe(0);
    expect(fixture.componentInstance.cards().find((c) => c.key === 'orders')?.display).toBe('');

    // A new Admin session asks again for all five and shows only its own numbers.
    TestBed.inject(AuthService).login('admin@test.local', 'secret123').subscribe();
    httpMock.expectOne(LOGIN_URL).flush({ Token: ADMIN_JWT });
    fixture.detectChanges();
    const second = take(httpMock);
    answer(second, { orders: orders(4), rate: ratesWith([[1820.25, true]]) });
    fixture.detectChanges();

    expect(valueOf(fixture, 'orders')).toBe('4');
    expect(valueOf(fixture, 'rate')).toBe('₹1,820.25');
    expect(text(fixture)).not.toContain('99');
  });

  // ── wording ─────────────────────────────────────────────────────────────

  it('has no demo or pricing-disclaimer wording', () => {
    const { fixture } = openAdmin();
    expect(text(fixture)).not.toMatch(/demo|not final pricing/i);
  });
});
