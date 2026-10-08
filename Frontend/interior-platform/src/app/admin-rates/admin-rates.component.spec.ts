import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { AdminRatesComponent } from './admin-rates.component';
import type { AdminEstimateRateDto } from '../estimate/estimate-rate.service';
import { environment } from '../../environments/environment';

const RATES_URL = `${environment.apiBaseUrl}/api/admin/estimate-rates`;
const PUBLIC_RATE_URL = `${environment.apiBaseUrl}/api/estimate-rate`;
const ESTIMATES_URL = `${environment.apiBaseUrl}/api/estimates`;

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

function rate(partial: Partial<AdminEstimateRateDto> & { id: string }): AdminEstimateRateDto {
  return {
    ratePerSquareFoot: 1800,
    isActive: true,
    createdAt: '2026-10-02T08:30:00Z',
    createdByEmail: 'admin@test.local',
    ...partial,
  };
}

const ACTIVE = rate({ id: 'rate-2', ratePerSquareFoot: 1800 });
const OLDER = rate({
  id: 'rate-1',
  ratePerSquareFoot: 1500,
  isActive: false,
  createdAt: '2026-10-01T00:00:00Z',
  createdByEmail: null,
});

describe('AdminRatesComponent', () => {
  let httpMock: HttpTestingController;

  function setup(token: string | null) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    TestBed.configureTestingModule({
      imports: [AdminRatesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminRatesComponent);
    fixture.detectChanges();
    return fixture;
  }

  function setupAdmin(list: AdminEstimateRateDto[]) {
    const fixture = setup(ADMIN_JWT);
    httpMock.expectOne(RATES_URL).flush(list);
    httpMock.verify();
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: { nativeElement: unknown }): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify();
    localStorage.clear();
  });

  // ── reading ─────────────────────────────────────────────────────────

  it('loads the history with Bearer auth and shows the current rate and every row', () => {
    const fixture = setup(ADMIN_JWT);
    const req = httpMock.expectOne(RATES_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${ADMIN_JWT}`);
    req.flush([ACTIVE, OLDER]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const current = el.querySelector('section[aria-label="Current rate"]')!;
    expect(current.textContent).toContain('₹1,800');
    expect(current.textContent).toContain('Used for every new estimate');
    expect(current.textContent).toContain('admin@test.local');

    const rows = Array.from(el.querySelectorAll('.rate-row'));
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('₹1,800');
    expect(rows[0].textContent).toContain('Active');
    expect(rows[1].textContent).toContain('₹1,500');
    expect(rows[1].textContent).toContain('Initial rate');
    expect(el.querySelectorAll('.status-pill').length).toBe(1);
  });

  it('shows a loading state while fetching', () => {
    const fixture = setup(ADMIN_JWT);
    expect(text(fixture)).toContain('Loading rates');
    httpMock.expectOne(RATES_URL).flush([]);
  });

  it('says so when no rate is active and customers cannot save estimates', () => {
    const fixture = setupAdmin([]);
    expect(text(fixture)).toContain('No active rate');
    expect(text(fixture)).toContain('Customers cannot save estimates until a rate is set');
    expect(text(fixture)).toContain('No rates yet');
  });

  it('shows list errors with a retry that reloads', () => {
    const fixture = setup(ADMIN_JWT);
    httpMock.expectOne(RATES_URL).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');

    (el.querySelector('.admin-rates-error button') as HTMLButtonElement).click();
    httpMock.expectOne(RATES_URL).flush([ACTIVE]);
    fixture.detectChanges();
    expect(text(fixture)).toContain('₹1,800');
  });

  // ── access ──────────────────────────────────────────────────────────

  it('asks logged-out visitors to log in and calls nothing', () => {
    const fixture = setup(null);
    expect(text(fixture)).toContain('Log in to access the Estimate rate workspace');
    httpMock.expectNone(RATES_URL);
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('field staff and customers see access-denied and load nothing', () => {
    for (const token of [STAFF_JWT, CUSTOMER_JWT]) {
      TestBed.resetTestingModule();
      localStorage.clear();
      const fixture = setup(token);
      expect(text(fixture)).toContain("You don't have access to this workspace.");
      httpMock.expectNone(RATES_URL);
      expect(fixture.nativeElement.querySelector('form')).toBeNull();
      httpMock.verify();
    }
  });

  it('a non-admin who calls the actions directly sends nothing', () => {
    const fixture = setup(CUSTOMER_JWT);
    const cmp = fixture.componentInstance;
    cmp.loadRates();
    cmp.form.controls.rate.setValue(2000);
    cmp.requestSet();
    cmp.confirmSet();
    httpMock.expectNone(RATES_URL);
    expect(cmp.confirming()).toBeNull();
  });

  it('a 403 from the server shows access-denied', () => {
    const fixture = setup(ADMIN_JWT);
    httpMock.expectOne(RATES_URL).flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(text(fixture)).toContain("You don't have access to this workspace.");
  });

  it('a 401 on load logs the session out', () => {
    const fixture = setup(ADMIN_JWT);
    httpMock.expectOne(RATES_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(fixture.componentInstance['auth'].isAuthenticated()).toBeFalse();
  });

  it('logout clears the admin data so the next session starts clean', async () => {
    const fixture = setupAdmin([ACTIVE, OLDER]);
    expect(text(fixture)).toContain('₹1,800');

    fixture.componentInstance['auth'].logout();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.list()).toBeNull();
    expect(text(fixture)).not.toContain('₹1,800');
    expect(text(fixture)).toContain('Log in to access the Estimate rate workspace');
  });

  // ── the form ────────────────────────────────────────────────────────

  it('has a labelled rate input and a Set rate button', () => {
    const fixture = setupAdmin([ACTIVE]);
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input#rate-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe('number');
    expect(el.querySelector('label[for="rate-input"]')?.textContent).toContain('Rate per sq.ft.');
    expect(input.getAttribute('aria-describedby')).toBe('rate-hint');
    expect(el.querySelector('#rate-hint')?.textContent).toContain('1,00,000');
    expect(el.querySelector('button[type="submit"]')?.textContent).toContain('Set rate');
  });

  it('rejects empty, zero, negative, too large and over-precise rates without asking to confirm', () => {
    const fixture = setupAdmin([ACTIVE]);
    const cmp = fixture.componentInstance;

    for (const bad of [null, 0, -5, 100001, 1500.555]) {
      cmp.form.controls.rate.setValue(bad);
      cmp.requestSet();
      fixture.detectChanges();
      expect(cmp.confirming()).withContext(String(bad)).toBeNull();
      expect(cmp.formError()).withContext(String(bad)).toContain('greater than 0');
    }
    httpMock.expectNone(RATES_URL);
  });

  it('flags an invalid input for assistive technology', () => {
    const fixture = setupAdmin([ACTIVE]);
    const cmp = fixture.componentInstance;
    cmp.form.controls.rate.setValue(0);
    cmp.requestSet();
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input#rate-input')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();
  });

  it('accepts the boundaries: 0.01, 1499.99 and 100000', () => {
    const fixture = setupAdmin([ACTIVE]);
    const cmp = fixture.componentInstance;
    for (const good of [0.01, 1499.99, 100000]) {
      cmp.cancelConfirm();
      cmp.form.controls.rate.setValue(good);
      cmp.requestSet();
      expect(cmp.confirming()).withContext(String(good)).toBe(good);
    }
  });

  it('submitting the form opens a confirmation first and sends nothing', () => {
    const fixture = setupAdmin([ACTIVE]);
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input#rate-input') as HTMLInputElement;
    input.value = '2000';
    input.dispatchEvent(new Event('input'));
    (el.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.confirming()).toBe(2000);
    const box = el.querySelector('[aria-label="Confirm new rate"]')!;
    expect(box.textContent).toContain('₹2,000 per sq ft');
    expect(box.textContent).toContain('Existing estimates and proposals are not changed');
    expect(input.readOnly).toBeTrue();
    httpMock.expectNone(RATES_URL);
  });

  it('cancelling the confirmation sends nothing and lets the rate be edited again', () => {
    const fixture = setupAdmin([ACTIVE]);
    const cmp = fixture.componentInstance;
    cmp.form.controls.rate.setValue(2000);
    cmp.requestSet();
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.confirm-box .btn-secondary')!
      .click();
    fixture.detectChanges();

    expect(cmp.confirming()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('input#rate-input')).toBeTruthy();
    httpMock.expectNone(RATES_URL);
  });

  // ── setting a rate ──────────────────────────────────────────────────

  it('confirming posts only the rate, then reloads the history and announces it', () => {
    const fixture = setupAdmin([ACTIVE, OLDER]);
    const cmp = fixture.componentInstance;
    cmp.form.controls.rate.setValue(2000);
    cmp.requestSet();
    cmp.confirmSet();

    const post = httpMock.expectOne(RATES_URL);
    expect(post.request.method).toBe('POST');
    // No id, active flag, timestamp or user may leave the client.
    expect(post.request.body).toEqual({ ratePerSquareFoot: 2000 });
    expect(post.request.headers.get('Authorization')).toBe(`Bearer ${ADMIN_JWT}`);
    post.flush(rate({ id: 'rate-3', ratePerSquareFoot: 2000 }), { status: 201, statusText: 'Created' });

    const reload = httpMock.expectOne(RATES_URL);
    expect(reload.request.method).toBe('GET');
    reload.flush([
      rate({ id: 'rate-3', ratePerSquareFoot: 2000 }),
      { ...ACTIVE, isActive: false },
      OLDER,
    ]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="status"]')?.textContent).toContain(
      'Rate set to ₹2,000 / sq ft. New estimates will use it.'
    );
    expect(el.querySelector('section[aria-label="Current rate"]')?.textContent).toContain('₹2,000');
    expect(el.querySelectorAll('.rate-row').length).toBe(3);
    expect(el.querySelectorAll('.status-pill').length).toBe(1);
    expect(cmp.confirming()).toBeNull();
    expect(cmp.form.controls.rate.value).toBeNull();
    httpMock.verify();
  });

  it('setting the rate that is already active says nothing changed', () => {
    const fixture = setupAdmin([ACTIVE]);
    const cmp = fixture.componentInstance;
    cmp.form.controls.rate.setValue(1800);
    cmp.requestSet();
    cmp.confirmSet();
    httpMock.expectOne(RATES_URL).flush(ACTIVE, { status: 200, statusText: 'OK' });
    httpMock.expectOne(RATES_URL).flush([ACTIVE]);
    fixture.detectChanges();

    expect(text(fixture)).toContain('₹1,800 / sq ft is already the current rate. Nothing changed.');
  });

  it('repeated confirm clicks produce only one POST', () => {
    const fixture = setupAdmin([ACTIVE]);
    const cmp = fixture.componentInstance;
    cmp.form.controls.rate.setValue(2000);
    cmp.requestSet();
    cmp.confirmSet();
    cmp.confirmSet();
    cmp.confirmSet();

    const post = httpMock.expectOne(RATES_URL);
    expect(cmp.saving()).toBeTrue();
    post.flush(rate({ id: 'rate-3', ratePerSquareFoot: 2000 }), { status: 201, statusText: 'Created' });
    httpMock.expectOne(RATES_URL).flush([rate({ id: 'rate-3', ratePerSquareFoot: 2000 })]);
  });

  it('a server validation error is shown, the confirmation stays open, and retry works', () => {
    const fixture = setupAdmin([ACTIVE]);
    const cmp = fixture.componentInstance;
    cmp.form.controls.rate.setValue(2000);
    cmp.requestSet();
    cmp.confirmSet();
    httpMock
      .expectOne(RATES_URL)
      .flush(
        { errors: { RatePerSquareFoot: ['Rate must be greater than 0 and at most 100000 per sq.ft.'] } },
        { status: 400, statusText: 'Bad Request' }
      );
    fixture.detectChanges();

    expect(cmp.saving()).toBeFalse();
    expect(cmp.confirming()).toBe(2000);
    expect(text(fixture)).toContain('Rate must be greater than 0');

    cmp.confirmSet();
    httpMock.expectOne(RATES_URL).flush(rate({ id: 'rate-3', ratePerSquareFoot: 2000 }), {
      status: 201,
      statusText: 'Created',
    });
    httpMock.expectOne(RATES_URL).flush([rate({ id: 'rate-3', ratePerSquareFoot: 2000 })]);
    fixture.detectChanges();
    expect(cmp.confirming()).toBeNull();
  });

  it('a 409 (someone else changed the rate) refreshes the history and closes the confirmation', () => {
    const fixture = setupAdmin([ACTIVE]);
    const cmp = fixture.componentInstance;
    cmp.form.controls.rate.setValue(2000);
    cmp.requestSet();
    cmp.confirmSet();
    httpMock
      .expectOne(RATES_URL)
      .flush(
        { title: 'The rate was changed by someone else. Reload and try again.' },
        { status: 409, statusText: 'Conflict' }
      );
    expect(cmp.confirming()).toBeNull();

    httpMock.expectOne(RATES_URL).flush([rate({ id: 'rate-9', ratePerSquareFoot: 2400 }), { ...ACTIVE, isActive: false }]);
    fixture.detectChanges();

    expect(text(fixture)).toContain('The rate was changed by someone else');
    expect(text(fixture)).toContain('₹2,400');
  });

  it('a 403 on save shows access-denied', () => {
    const fixture = setupAdmin([ACTIVE]);
    const cmp = fixture.componentInstance;
    cmp.form.controls.rate.setValue(2000);
    cmp.requestSet();
    cmp.confirmSet();
    httpMock.expectOne(RATES_URL).flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(text(fixture)).toContain("You don't have access to this workspace.");
  });

  it('a 401 on save logs the session out', () => {
    const fixture = setupAdmin([ACTIVE]);
    const cmp = fixture.componentInstance;
    cmp.form.controls.rate.setValue(2000);
    cmp.requestSet();
    cmp.confirmSet();
    httpMock.expectOne(RATES_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    expect(cmp['auth'].isAuthenticated()).toBeFalse();
  });

  it('never calls the customer endpoints', () => {
    const fixture = setupAdmin([ACTIVE]);
    const cmp = fixture.componentInstance;
    cmp.form.controls.rate.setValue(2000);
    cmp.requestSet();
    cmp.confirmSet();
    httpMock.expectNone(PUBLIC_RATE_URL);
    httpMock.expectNone(ESTIMATES_URL);
    httpMock.expectOne(RATES_URL).flush(ACTIVE, { status: 200, statusText: 'OK' });
    httpMock.expectOne(RATES_URL).flush([ACTIVE]);
  });
});
