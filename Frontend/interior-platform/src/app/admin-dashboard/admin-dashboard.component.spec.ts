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

// ── Stage 3: Recent activity - three blocks fed by the same three lists as the cards ──
const pad = (n: number) => String(n).padStart(2, '0');
/** A fixed time on day `d` of September 2026, so a test can choose the order rows should appear in. */
const dayAt = (d: number) => `2026-09-${pad(d)}T10:00:00Z`;

type RecentMetric = 'orders' | 'leads' | 'proposals';
interface RecentCase {
  readonly metric: RecentMetric;
  readonly title: string;
  readonly empty: string;
  /** One row per day, in the order given. The day is written into the row's text so a test can read the order back. */
  readonly build: (days: readonly number[]) => unknown[];
  readonly tag: (day: number) => string;
}
const RECENT_CASES: readonly RecentCase[] = [
  {
    metric: 'orders',
    title: 'Recent orders',
    empty: 'No orders yet.',
    build: (days) =>
      days.map((d) => ({ ...orders(1)[0], id: `${pad(d)}-order-id`, customerEmail: `day${pad(d)}@test.local`, createdAt: dayAt(d), subtotal: d * 1000 })),
    tag: (d) => `day${pad(d)}@test.local`,
  },
  {
    metric: 'leads',
    title: 'Recent leads',
    empty: 'No leads yet.',
    build: (days) =>
      days.map((d) => ({ ...leadsWith([0])[0], id: `lead-${pad(d)}`, name: `Lead day${pad(d)}`, createdAt: dayAt(d) })),
    tag: (d) => `Lead day${pad(d)}`,
  },
  {
    metric: 'proposals',
    title: 'Recent proposals',
    empty: 'No proposals yet.',
    build: (days) =>
      days.map((d) => ({ ...proposals(1)[0], id: `${pad(d)}-proposal-id`, customerEmail: `day${pad(d)}@test.local`, createdAt: dayAt(d), estimatedAmount: d * 10000 })),
    tag: (d) => `day${pad(d)}@test.local`,
  },
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

  // Recent activity helpers
  const blockEl = (f: Fixture, m: RecentMetric) => root(f).querySelector<HTMLElement>(`.recent-block[data-recent="${m}"]`)!;
  const blockText = (f: Fixture, m: RecentMetric) => (blockEl(f, m).textContent ?? '').replace(/\s+/g, ' ').trim();
  const recentRows = (f: Fixture, m: RecentMetric) =>
    Array.from(blockEl(f, m).querySelectorAll('.recent-row')).map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim());
  const recentRetry = (f: Fixture, m: RecentMetric) => blockEl(f, m).querySelector<HTMLButtonElement>('.recent-retry');
  /** Which of the days in `universe` each shown row belongs to, top to bottom. */
  const daysShown = (f: Fixture, c: RecentCase, universe: readonly number[]) =>
    recentRows(f, c.metric).map((t) => universe.find((d) => t.includes(c.tag(d))) ?? -1);

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
    // Still no revenue, user-count or chart metrics. (Recent activity arrived in Stage 3 and has its own tests below.)
    expect(text(fixture)).not.toMatch(/revenue|users?\b|chart/i);
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

  // ── Stage 3: Recent activity ────────────────────────────────────────────

  it('shows the Summary, then Recent activity, then Quick actions', () => {
    const { fixture } = openAdmin();
    const sections = [
      'section[aria-label="Summary"]',
      'section[aria-label="Recent activity"]',
      'section[aria-label="Quick actions"]',
    ].map((sel) => root(fixture).querySelector(sel)!);

    expect(sections.every((s) => !!s)).toBeTrue();
    for (let i = 0; i < sections.length - 1; i++) {
      expect(sections[i].compareDocumentPosition(sections[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING)
        .withContext(`section ${i} comes before section ${i + 1}`)
        .toBeTruthy();
    }
    expect(root(fixture).querySelector('section[aria-label="Recent activity"] h2')?.textContent).toContain('Recent activity');
  });

  it('shows exactly three recent blocks - orders, leads, proposals - and no other metric', () => {
    const { fixture } = openAdmin();
    const titles = Array.from(root(fixture).querySelectorAll('.recent-block h3')).map((h) => h.textContent?.trim());

    expect(titles).toEqual(['Recent orders', 'Recent leads', 'Recent proposals']);
    expect(text(fixture)).not.toMatch(/revenue|users?\b|chart/i);
  });

  it('Recent activity adds no request: still exactly one GET per endpoint, five in all', () => {
    const { httpMock } = create(ADMIN_JWT);
    const all = httpMock.match(() => true);

    expect(all.length).toBe(5);
    expect(all.map((r) => r.request.url).sort()).toEqual(Object.values(URLS).sort());
    expect(all.every((r) => r.request.method === 'GET')).toBeTrue();
    all.forEach((r) => r.flush([]));
  });

  for (const c of RECENT_CASES) {
    it(`${c.title}: shows the latest 5, newest first, when the API returns 8 oldest-first`, () => {
      const days = [1, 2, 3, 4, 5, 6, 7, 8];
      const { fixture } = openAdmin({ [c.metric]: c.build(days) });

      expect(recentRows(fixture, c.metric).length).toBe(5);
      expect(daysShown(fixture, c, days)).toEqual([8, 7, 6, 5, 4]);
    });

    it(`${c.title}: sorts by date itself, so an unsorted API answer still gives the latest 5 newest first`, () => {
      const days = [3, 8, 1, 6, 2, 7, 4, 5];
      const { fixture } = openAdmin({ [c.metric]: c.build(days) });

      expect(daysShown(fixture, c, days)).toEqual([8, 7, 6, 5, 4]);
    });

    it(`${c.title}: an already newest-first answer of 9 is cut to the first 5, in the same order`, () => {
      const days = [9, 8, 7, 6, 5, 4, 3, 2, 1];
      const { fixture } = openAdmin({ [c.metric]: c.build(days) });

      expect(recentRows(fixture, c.metric).length).toBe(5);
      expect(daysShown(fixture, c, days)).toEqual([9, 8, 7, 6, 5]);
    });

    it(`${c.title}: with fewer than 5 records it shows just those, and no empty message`, () => {
      const days = [1, 2];
      const { fixture } = openAdmin({ [c.metric]: c.build(days) });

      expect(daysShown(fixture, c, days)).toEqual([2, 1]);
      expect(blockText(fixture, c.metric)).not.toContain(c.empty);
    });

    it(`${c.title}: an empty result shows "${c.empty}" - a normal state, not an error`, () => {
      const { fixture } = openAdmin({ [c.metric]: [] });

      expect(blockText(fixture, c.metric)).toContain(c.empty);
      expect(recentRows(fixture, c.metric).length).toBe(0);
      expect(blockText(fixture, c.metric)).not.toMatch(/Unable to load|Loading/);
      expect(recentRetry(fixture, c.metric)).toBeNull();
      expect(valueOf(fixture, c.metric)).toBe('0');
    });

    it(`${c.title}: shows Loading… - never the empty message, never rows - until its own response arrives`, () => {
      const { fixture, httpMock } = create(ADMIN_JWT);
      const reqs = take(httpMock);

      expect(blockText(fixture, c.metric)).toContain('Loading…');
      expect(blockText(fixture, c.metric)).not.toContain(c.empty);
      expect(recentRows(fixture, c.metric).length).toBe(0);
      expect(blockEl(fixture, c.metric).getAttribute('aria-busy')).toBe('true');

      // Its own answer settles it; the other two blocks keep loading.
      reqs[c.metric].flush(c.build([2, 1]));
      fixture.detectChanges();
      expect(blockEl(fixture, c.metric).getAttribute('aria-busy')).toBe('false');
      expect(recentRows(fixture, c.metric).length).toBe(2);
      for (const other of RECENT_CASES.filter((o) => o.metric !== c.metric)) {
        expect(blockText(fixture, other.metric)).withContext(other.title).toContain('Loading…');
        expect(blockText(fixture, other.metric)).withContext(other.title).not.toContain(other.empty);
      }
      answer(reqs, {}, METRICS.filter((m) => m !== c.metric));
    });

    it(`${c.title}: a failure shows a short message and Retry - no rows, no empty message, no raw error`, () => {
      const { fixture } = openAdmin({ [c.metric]: 'error' });
      const block = blockText(fixture, c.metric);

      expect(block).toContain('Unable to load');
      expect(recentRetry(fixture, c.metric)?.textContent?.trim()).toBe('Retry');
      expect(recentRows(fixture, c.metric).length).toBe(0);
      expect(block).not.toContain(c.empty);
      expect(block).not.toMatch(/500|Server Error|HttpErrorResponse|Http failure/i);
      expect(blockEl(fixture, c.metric).querySelector('[role="alert"]')).toBeTruthy();
      // One endpoint feeds this block and its summary card, so the card reports the same failure.
      expect(cardText(fixture, c.metric)).toContain('Unable to load');
    });

    it(`${c.title}: Retry re-requests only this endpoint, then shows the rows and updates the card`, () => {
      const { fixture, httpMock } = openAdmin({ [c.metric]: 'error' });
      const others = RECENT_CASES.filter((o) => o.metric !== c.metric);
      const rowsBefore = others.map((o) => recentRows(fixture, o.metric).length);

      recentRetry(fixture, c.metric)!.click();
      fixture.detectChanges();
      expect(blockText(fixture, c.metric)).toContain('Loading…');
      for (const other of METRICS.filter((m) => m !== c.metric)) {
        httpMock.expectNone(URLS[other]);
      }
      const req = httpMock.expectOne(URLS[c.metric]);
      expect(req.request.method).toBe('GET');
      req.flush(c.build([5, 4]));
      fixture.detectChanges();

      expect(daysShown(fixture, c, [5, 4])).toEqual([5, 4]);
      expect(recentRetry(fixture, c.metric)).toBeNull();
      expect(valueOf(fixture, c.metric)).toBe('2');
      expect(others.map((o) => recentRows(fixture, o.metric).length)).toEqual(rowsBefore);
    });

    it(`${c.title}: still shows its rows when the other two blocks fail`, () => {
      const others = RECENT_CASES.filter((o) => o.metric !== c.metric);
      const days = [3, 2, 1];
      const { fixture } = openAdmin({
        [c.metric]: c.build(days),
        [others[0].metric]: 'error',
        [others[1].metric]: 'error',
      });

      expect(daysShown(fixture, c, days)).toEqual([3, 2, 1]);
      expect(blockText(fixture, c.metric)).not.toContain('Unable to load');
      for (const other of others) {
        expect(blockText(fixture, other.metric)).withContext(other.title).toContain('Unable to load');
      }
      expect(actionCards(fixture).length).toBe(5);
    });
  }

  it('retrying a summary card also fills its recent block - one request serves both', () => {
    const { fixture, httpMock } = openAdmin({ orders: 'error' });
    expect(blockText(fixture, 'orders')).toContain('Unable to load');

    retryBtn(fixture, 'orders')!.click();
    httpMock.expectOne(URLS.orders).flush(orders(3));
    fixture.detectChanges();

    expect(valueOf(fixture, 'orders')).toBe('3');
    expect(recentRows(fixture, 'orders').length).toBe(3);
    expect(blockText(fixture, 'orders')).not.toContain('Unable to load');
  });

  // ── what each row shows (existing API fields only) ──

  it('Recent orders: each row shows a short order id, the customer, the time, the status and the subtotal', () => {
    const rows = [{ ...orders(1)[0], id: 'abcdef12-3456', customerEmail: 'asha@test.local', status: 3, subtotal: 123456, createdAt: dayAt(5) }];
    const { fixture } = openAdmin({ orders: rows });
    const row = recentRows(fixture, 'orders')[0];

    expect(row).toContain('Order abcdef12');
    expect(row).not.toContain('abcdef12-3456');
    expect(row).toContain('asha@test.local');
    expect(row).toContain('₹1,23,456');
    expect(row).toContain('Completed');
    expect(row).toContain('2026');
  });

  it('Recent orders: an order without a customer email shows no "null" or "undefined"', () => {
    const { fixture } = openAdmin({ orders: [{ ...orders(1)[0], customerEmail: null }] });

    expect(recentRows(fixture, 'orders').length).toBe(1);
    expect(blockText(fixture, 'orders')).not.toMatch(/null|undefined/i);
  });

  it('Recent leads: each row shows the name, phone and email, the time and the status - not the enquiry text', () => {
    const rows = [{
      ...leadsWith([1])[0], id: 'l1', name: 'Meera Nair', phone: '9876500000', email: 'meera@test.local',
      message: 'PRIVATE-ENQUIRY-TEXT', interestedProductId: 'aria-3s-sofa', source: 'Website', createdAt: dayAt(5),
    }];
    const { fixture } = openAdmin({ leads: rows });
    const row = recentRows(fixture, 'leads')[0];

    expect(row).toContain('Meera Nair');
    expect(row).toContain('9876500000');
    expect(row).toContain('meera@test.local');
    expect(row).toContain('In Progress');
    expect(row).toContain('2026');
    expect(row).not.toContain('PRIVATE-ENQUIRY-TEXT');
    expect(row).not.toContain('aria-3s-sofa');
    expect(row).not.toContain('Website');
  });

  it('Recent leads: a lead with only a phone shows just the phone', () => {
    const { fixture } = openAdmin({ leads: [{ ...leadsWith([0])[0], phone: '9876500000', email: null }] });
    const row = recentRows(fixture, 'leads')[0];

    expect(row).toContain('9876500000');
    expect(row).not.toMatch(/null|undefined|·/);
  });

  it('Recent leads: shows each lead\'s own status wording (New, In Progress, Closed)', () => {
    const rows = [0, 1, 2].map((status, i) => ({ ...leadsWith([status])[0], id: `s${i}`, name: `Status ${status}`, createdAt: dayAt(3 - i) }));
    const { fixture } = openAdmin({ leads: rows });
    const shown = recentRows(fixture, 'leads');

    expect(shown[0]).toContain('New');
    expect(shown[1]).toContain('In Progress');
    expect(shown[2]).toContain('Closed');
  });

  it('Recent proposals: each row shows a short id, the customer, the time, the amount and the payment state', () => {
    const base = proposals(1)[0];
    const rows = [
      { ...base, id: '11111111-a', customerEmail: 'a@test.local', estimatedAmount: 270000, isPaymentVerified: true, paymentAttemptCount: 2, createdAt: dayAt(3) },
      { ...base, id: '22222222-b', customerEmail: 'b@test.local', isPaymentVerified: false, paymentAttemptCount: 1, createdAt: dayAt(2) },
      { ...base, id: '33333333-c', customerEmail: null, isPaymentVerified: false, paymentAttemptCount: 0, createdAt: dayAt(1) },
    ];
    const { fixture } = openAdmin({ proposals: rows });
    const shown = recentRows(fixture, 'proposals');

    expect(shown[0]).toContain('Proposal 11111111');
    expect(shown[0]).not.toContain('11111111-a');
    expect(shown[0]).toContain('a@test.local');
    expect(shown[0]).toContain('₹2,70,000');
    expect(shown[0]).toContain('Token Payment Verified');
    expect(shown[1]).toContain('Payment Pending');
    expect(shown[2]).toContain('No Payment Attempt');
    expect(shown[2]).not.toMatch(/null|undefined/i);
  });

  it('a row with an unreadable date sorts last and shows no "Invalid Date"', () => {
    const rows = [{ ...orders(1)[0], id: 'bad-date-id', customerEmail: 'bad@test.local', createdAt: 'not-a-date' }, ...RECENT_CASES[0].build([5])];
    const { fixture } = openAdmin({ orders: rows });
    const shown = recentRows(fixture, 'orders');

    expect(shown.length).toBe(2);
    expect(shown[0]).toContain('day05@test.local');
    expect(shown[1]).toContain('bad@test.local');
    expect(blockText(fixture, 'orders')).not.toMatch(/Invalid Date|NaN/);
  });

  it('records with the same time keep the server\'s order', () => {
    const rows = [
      { ...orders(1)[0], id: 'first-id-aaaa', createdAt: dayAt(5) },
      { ...orders(1)[0], id: 'second-id-bbbb', createdAt: dayAt(5) },
    ];
    const { fixture } = openAdmin({ orders: rows });
    const shown = recentRows(fixture, 'orders');

    expect(shown[0]).toContain('Order first-id');
    expect(shown[1]).toContain('Order second-i');
  });

  it('Recent activity never changes the Summary: counts are still of every record, not of the 5 shown', () => {
    const { fixture } = openAdmin({ orders: RECENT_CASES[0].build([1, 2, 3, 4, 5, 6, 7, 8]) });

    expect(recentRows(fixture, 'orders').length).toBe(5);
    expect(valueOf(fixture, 'orders')).toBe('8');
  });

  // ── access, sessions ──

  for (const [who, token] of [['a logged-out visitor', null], ['Field Staff', STAFF_JWT], ['a customer', CUSTOMER_JWT]] as const) {
    it(`${who} gets no Recent activity: no section, no rows and no request`, () => {
      const { fixture, httpMock } = create(token);

      expect(root(fixture).querySelector('section[aria-label="Recent activity"]')).toBeNull();
      expect(root(fixture).querySelectorAll('.recent-block').length).toBe(0);
      expect(text(fixture)).not.toMatch(/Recent|Order [0-9a-z]|Proposal [0-9a-z]/);
      for (const metric of METRICS) {
        httpMock.expectNone(URLS[metric]);
      }
    });
  }

  it('logging out clears the recent rows, and a late answer from the old session never shows', () => {
    const { fixture, httpMock } = create(ADMIN_JWT);
    const first = take(httpMock);
    answer(first, {}, ['leads', 'proposals', 'products', 'rate']);
    fixture.detectChanges();
    expect(recentRows(fixture, 'leads').length).toBe(2);

    // Log out while the Orders request is still in flight.
    TestBed.inject(AuthService).logout();
    fixture.detectChanges();
    first.orders.flush([{ ...orders(1)[0], id: 'old-session-order', customerEmail: 'old-session@test.local' }]);
    fixture.detectChanges();
    expect(fixture.componentInstance.recent().every((b) => b.rows.length === 0)).toBeTrue();
    expect(root(fixture).querySelectorAll('.recent-block').length).toBe(0);
    expect(text(fixture)).not.toContain('old-session');

    // A new Admin session loads again and shows only its own rows.
    TestBed.inject(AuthService).login('admin@test.local', 'secret123').subscribe();
    httpMock.expectOne(LOGIN_URL).flush({ Token: ADMIN_JWT });
    fixture.detectChanges();
    const second = take(httpMock);
    answer(second, { orders: [{ ...orders(1)[0], id: 'new-session-order', customerEmail: 'new-session@test.local' }] });
    fixture.detectChanges();

    expect(recentRows(fixture, 'orders').length).toBe(1);
    expect(blockText(fixture, 'orders')).toContain('new-session@test.local');
    expect(text(fixture)).not.toContain('old-session');
  });

  it('a 401 from the leads request logs the session out and leaves no recent rows on screen', () => {
    const { fixture, httpMock } = create(ADMIN_JWT);
    const reqs = take(httpMock);

    reqs.leads.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
    expect(root(fixture).querySelectorAll('.recent-block').length).toBe(0);
    expect(text(fixture)).toContain('Log in to access the Admin dashboard');
    answer(reqs, {}, ['orders', 'proposals', 'products', 'rate']);
  });

  // ── layout (real component styles, measured) ──

  it('a very long email wraps inside its block instead of widening it', () => {
    const longEmail = `${'a'.repeat(60)}.${'b'.repeat(60)}.${'c'.repeat(60)}@${'d'.repeat(60)}.example`;
    const { fixture } = openAdmin({ orders: [{ ...orders(1)[0], id: 'long-email-order', customerEmail: longEmail }] });
    const host = root(fixture);
    host.style.display = 'block';
    host.style.width = '390px';
    fixture.detectChanges();

    const block = blockEl(fixture, 'orders');
    const detail = block.querySelector<HTMLElement>('.recent-detail')!;
    expect(detail.textContent).toContain(longEmail);
    expect(detail.scrollWidth).toBeLessThanOrEqual(detail.clientWidth + 1);
    expect(block.scrollWidth).toBeLessThanOrEqual(block.clientWidth + 1);
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
  });

  it('at a phone width (390px) the three blocks stack in one column inside the dashboard', () => {
    const { fixture } = openAdmin();
    const host = root(fixture);
    host.style.display = 'block';
    host.style.width = '390px';
    fixture.detectChanges();

    const rects = RECENT_CASES.map((c) => blockEl(fixture, c.metric).getBoundingClientRect());
    const hostRect = host.getBoundingClientRect();
    expect(new Set(rects.map((r) => Math.round(r.left))).size).toBe(1);
    expect(rects.every((r) => r.left >= hostRect.left - 0.5 && r.right <= hostRect.right + 0.5)).toBeTrue();
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
  });

  it('on a wide screen the three blocks sit side by side', () => {
    const { fixture } = openAdmin();
    const host = root(fixture);
    host.style.display = 'block';
    host.style.width = '1200px';
    fixture.detectChanges();

    const lefts = RECENT_CASES.map((c) => Math.round(blockEl(fixture, c.metric).getBoundingClientRect().left));
    expect(new Set(lefts).size).toBe(3);
  });

  // ── wording ─────────────────────────────────────────────────────────────

  it('has no demo or pricing-disclaimer wording', () => {
    const { fixture } = openAdmin();
    expect(text(fixture)).not.toMatch(/demo|not final pricing/i);
  });
});
