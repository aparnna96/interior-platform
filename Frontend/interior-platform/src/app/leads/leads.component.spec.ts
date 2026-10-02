import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { LeadsComponent } from './leads.component';
import type { LeadResponse } from './lead.service';
import { environment } from '../../environments/environment';

const LEADS_URL = `${environment.apiBaseUrl}/api/leads`;
const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;
const TOKEN = 'test-jwt';

const DOTNET_ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

/** Minimal unsigned JWT carrying role claims (tests only). */
function jwtWithRoles(roles: string[]): string {
  const enc = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ [DOTNET_ROLE_CLAIM]: roles })}.sig`;
}

const STAFF_JWT = jwtWithRoles(['FieldStaff']);
const ADMIN_JWT = jwtWithRoles(['Admin']);
const CUSTOMER_JWT = jwtWithRoles(['Customer']);

function leadRow(partial: Partial<LeadResponse> & { id: string }): LeadResponse {
  return {
    name: 'Asha Rao',
    phone: '+911234567890',
    email: 'asha@example.com',
    message: 'Living room makeover with warm neutrals.',
    interestedProductId: 'aria-3s-sofa',
    source: 'Furniture Product',
    status: 0,
    createdAt: '2026-10-01T10:00:00Z',
    ...partial,
  };
}

function productDto() {
  return {
    id: 'aria-3s-sofa',
    name: 'Aria 3-Seater Fabric Sofa',
    category: 'Sofas',
    room: 'Living Room',
    price: 42999,
    material: 'Fabric',
    finish: 'Matte',
    blurb: 'Blurb.',
    description: 'Description.',
    dimensions: '220 × 92 × 82 cm',
    image: 'https://example.com/sofa.jpg',
    details: ['Detail.'],
  };
}

describe('LeadsComponent', () => {
  let httpMock: HttpTestingController;

  function setup(token: string | null) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    TestBed.configureTestingModule({
      imports: [LeadsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(LeadsComponent);
    fixture.detectChanges();
    return fixture;
  }

  function setupStaff(list: LeadResponse[]) {
    const fixture = setup(STAFF_JWT);
    httpMock.expectOne(LEADS_URL).flush(list);
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

  it('loads leads with Bearer auth and renders lead information', () => {
    const fixture = setupStaff([leadRow({ id: 'lead-2' }), leadRow({ id: 'lead-1', status: 2 })]);
    const cmp = fixture.componentInstance;
    expect(cmp.list()?.length).toBe(2);
    // Backend order is preserved as returned.
    expect(cmp.list()![0].name).toBe('Asha Rao');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Asha Rao');
    expect(el.textContent).toContain('+911234567890');
    expect(el.textContent).toContain('asha@example.com');
    expect(el.textContent).toContain('Furniture Product');
    expect(el.textContent).toContain('aria-3s-sofa');
    expect(el.textContent).toContain('New');
    expect(el.textContent).toContain('Closed');
    expect(el.querySelector('.lead-rows')).toBeTruthy();
  });

  it('loads for Admin sessions too', () => {
    const fixture = setup(ADMIN_JWT);
    httpMock.expectOne(LEADS_URL).flush([leadRow({ id: 'lead-1' })]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Asha Rao');
  });

  it('shows an empty state when no leads exist', () => {
    const fixture = setupStaff([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No leads yet');
  });

  it('shows a loading state while fetching', () => {
    const fixture = setup(STAFF_JWT);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading leads');
    httpMock.expectOne(LEADS_URL).flush([]);
  });

  it('shows list errors with a retry that reloads', () => {
    const fixture = setupStaff([]);
    const cmp = fixture.componentInstance;
    cmp.loadLeads();
    httpMock.expectOne(LEADS_URL).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');

    (el.querySelector('.leads-error button') as HTMLButtonElement).click();
    httpMock.expectOne(LEADS_URL).flush([leadRow({ id: 'lead-1' })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Asha Rao');
  });

  it('status filter changes the displayed leads', () => {
    const fixture = setupStaff([
      leadRow({ id: 'lead-1', status: 0 }),
      leadRow({ id: 'lead-2', status: 1, name: 'Ravi Menon' }),
      leadRow({ id: 'lead-3', status: 2, name: 'Meera Iyer' }),
    ]);
    const cmp = fixture.componentInstance;

    cmp.setFilter(1);
    fixture.detectChanges();
    let el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Ravi Menon');
    expect(el.textContent).not.toContain('Asha Rao');
    expect(el.textContent).not.toContain('Meera Iyer');

    cmp.setFilter('all');
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Asha Rao');
    expect(el.textContent).toContain('Ravi Menon');
  });

  it('filter with no matches shows the appropriate state', () => {
    const fixture = setupStaff([leadRow({ id: 'lead-1', status: 0 })]);
    const cmp = fixture.componentInstance;

    cmp.setFilter(2);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No leads match this filter');
  });

  it('selecting a lead loads and displays the full detail', () => {
    const fixture = setupStaff([leadRow({ id: 'lead-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('lead-1');
    fixture.detectChanges();
    expect(cmp.selected()).toBeNull();

    const req = httpMock.expectOne(`${LEADS_URL}/lead-1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${STAFF_JWT}`);
    req.flush(leadRow({ id: 'lead-1' }));
    httpMock.expectOne(PRODUCTS_URL).flush([productDto()]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Asha Rao');
    expect(el.textContent).toContain('+911234567890');
    expect(el.textContent).toContain('asha@example.com');
    expect(el.textContent).toContain('Furniture Product');
    expect(el.textContent).toContain('Aria 3-Seater Fabric Sofa');
    expect(el.textContent).toContain('Living room makeover with warm neutrals.');
    expect(el.textContent).toContain('New');
  });

  it('shows a missing lead with a back action that needs no refetch', () => {
    const fixture = setupStaff([leadRow({ id: 'lead-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('lead-9');
    httpMock.expectOne(`${LEADS_URL}/lead-9`).flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Lead not found');

    (el.querySelector('.leads-empty .btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Asha Rao');
  });

  it('shows detail errors with a retry', () => {
    const fixture = setupStaff([leadRow({ id: 'lead-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('lead-1');
    httpMock.expectOne(`${LEADS_URL}/lead-1`).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();

    cmp.retryDetail();
    httpMock.expectOne(`${LEADS_URL}/lead-1`).flush(leadRow({ id: 'lead-1' }));
    httpMock.expectOne(PRODUCTS_URL).flush([productDto()]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Asha Rao');
  });

  it('status update sends PATCH and refreshes the UI with confirmation', () => {
    const fixture = setupStaff([leadRow({ id: 'lead-1', status: 0 })]);
    const cmp = fixture.componentInstance;
    cmp.viewDetails('lead-1');
    httpMock.expectOne(`${LEADS_URL}/lead-1`).flush(leadRow({ id: 'lead-1', status: 0 }));
    httpMock.expectOne(PRODUCTS_URL).flush([productDto()]);
    fixture.detectChanges();

    cmp.updateStatus(1);
    expect(cmp.savingTo()).toBe(1);
    const req = httpMock.expectOne(`${LEADS_URL}/lead-1/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 1 });
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${STAFF_JWT}`);
    req.flush(leadRow({ id: 'lead-1', status: 1 }));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Status updated to In Progress.');
    expect(el.textContent).toContain('In Progress');
    expect(cmp.list()![0].status).toBe(1);
    expect(cmp.selected()?.status).toBe(1);
  });

  it('duplicate status taps collapse into a single PATCH', () => {
    const fixture = setupStaff([leadRow({ id: 'lead-1', status: 0 })]);
    const cmp = fixture.componentInstance;
    cmp.viewDetails('lead-1');
    httpMock.expectOne(`${LEADS_URL}/lead-1`).flush(leadRow({ id: 'lead-1', status: 0 }));
    httpMock.expectOne(PRODUCTS_URL).flush([productDto()]);
    fixture.detectChanges();

    cmp.updateStatus(2);
    cmp.updateStatus(2);
    cmp.retryStatusUpdate();
    httpMock.expectOne(`${LEADS_URL}/lead-1/status`).flush(leadRow({ id: 'lead-1', status: 2 }));
    fixture.detectChanges();
    expect(cmp.selected()?.status).toBe(2);
  });

  it('failed status update preserves the old status and allows retry', () => {
    const fixture = setupStaff([leadRow({ id: 'lead-1', status: 0 })]);
    const cmp = fixture.componentInstance;
    cmp.viewDetails('lead-1');
    httpMock.expectOne(`${LEADS_URL}/lead-1`).flush(leadRow({ id: 'lead-1', status: 0 }));
    httpMock.expectOne(PRODUCTS_URL).flush([productDto()]);
    fixture.detectChanges();

    cmp.updateStatus(1);
    httpMock.expectOne(`${LEADS_URL}/lead-1/status`).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // Previous status untouched; error surfaced with retry.
    expect(cmp.selected()?.status).toBe(0);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');

    (el.querySelector('.leads-error button') as HTMLButtonElement).click();
    httpMock.expectOne(`${LEADS_URL}/lead-1/status`).flush(leadRow({ id: 'lead-1', status: 1 }));
    fixture.detectChanges();
    expect(el.textContent).toContain('Status updated to In Progress.');
  });

  it('asks logged-out visitors to log in and calls no lead endpoints', () => {
    const fixture = setup(null);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to access the Leads workspace');
    httpMock.expectNone(LEADS_URL);
  });

  it('customers see access-denied and load no lead data', () => {
    const fixture = setup(CUSTOMER_JWT);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain("You don't have access to this workspace.");
    httpMock.expectNone(LEADS_URL);
    expect(fixture.componentInstance.canAccess()).toBe(false);
  });

  it('direct access attempts by customers issue no requests', () => {
    const fixture = setup(CUSTOMER_JWT);
    const cmp = fixture.componentInstance;
    expect(cmp.canAccess()).toBe(false);
    cmp.loadLeads();
    cmp.viewDetails('lead-1');
    cmp.updateStatus(1);
    expect(cmp.list()).toBeNull();
    expect(cmp.selected()).toBeNull();
    httpMock.expectNone(LEADS_URL);
  });

  it('403 produces an access-denied state', () => {
    const fixture = setup(STAFF_JWT);
    httpMock.expectOne(LEADS_URL).flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "You don't have access to this workspace."
    );
  });

  it('403 on detail produces an access-denied state', () => {
    const fixture = setupStaff([leadRow({ id: 'lead-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('lead-1');
    httpMock.expectOne(`${LEADS_URL}/lead-1`).flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "You don't have access to this workspace."
    );
  });

  it('401 follows the existing logout/reset behavior', async () => {
    const fixture = setupStaff([leadRow({ id: 'lead-1' })]);
    const auth = TestBed.inject(AuthService);
    const cmp = fixture.componentInstance;

    cmp.loadLeads();
    httpMock.expectOne(LEADS_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(cmp.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to access the Leads workspace');
  });

  it('logout mid-visit clears the list so the next user starts clean', async () => {
    const fixture = setupStaff([leadRow({ id: 'lead-1' })]);
    expect(fixture.componentInstance.list()?.length).toBe(1);

    TestBed.inject(AuthService).logout();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to access the Leads workspace');
  });

  it('loads the list after a mid-visit login', async () => {
    const fixture = setup(null);
    const auth = TestBed.inject(AuthService);

    auth.login('staff@test.local', 'secret123').subscribe();
    httpMock.expectOne(LOGIN_URL).flush({ Token: STAFF_JWT });
    await fixture.whenStable();
    fixture.detectChanges();
    // Staff session established after login: the workspace loads itself.
    httpMock.expectOne(LEADS_URL).flush([leadRow({ id: 'lead-1' })]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Asha Rao');
  });

  it('stores no lead data in browser storage', () => {
    const fixture = setupStaff([leadRow({ id: 'lead-1' })]);
    const cmp = fixture.componentInstance;
    const localSet = spyOn(localStorage, 'setItem').and.callThrough();
    const sessionSet = spyOn(sessionStorage, 'setItem').and.callThrough();

    cmp.viewDetails('lead-1');
    httpMock.expectOne(`${LEADS_URL}/lead-1`).flush(leadRow({ id: 'lead-1' }));
    httpMock.expectOne(PRODUCTS_URL).flush([productDto()]);
    fixture.detectChanges();
    cmp.updateStatus(1);
    httpMock.expectOne(`${LEADS_URL}/lead-1/status`).flush(leadRow({ id: 'lead-1', status: 1 }));
    fixture.detectChanges();

    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });
});
