import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { SavedEstimatesComponent } from './saved-estimates.component';
import type { EstimateDto } from './estimate.service';
import { environment } from '../../environments/environment';

const ESTIMATES_URL = `${environment.apiBaseUrl}/api/estimates`;
const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;
const TOKEN = 'test-jwt';

function estimate(partial: Partial<EstimateDto> & { id: string }): EstimateDto {
  return {
    width: 12,
    length: 15,
    area: 180,
    ratePerSquareFoot: 1500,
    estimatedAmount: 270000,
    createdAt: '2026-10-01T10:00:00Z',
    ...partial,
  };
}

describe('SavedEstimatesComponent', () => {
  let httpMock: HttpTestingController;

  function setupAuthenticated(list: EstimateDto[]) {
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      imports: [SavedEstimatesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    // Component construction fires the constructor load for the session.
    const fixture = TestBed.createComponent(SavedEstimatesComponent);
    fixture.detectChanges();
    httpMock.expectOne(ESTIMATES_URL).flush(list);
    httpMock.verify();
    fixture.detectChanges();
    return fixture;
  }

  function setupAnonymous() {
    TestBed.configureTestingModule({
      imports: [SavedEstimatesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SavedEstimatesComponent);
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

  it('loads the saved list with Bearer auth and renders server values', () => {
    const fixture = setupAuthenticated([estimate({ id: 'est-2' }), estimate({ id: 'est-1' })]);
    const cmp = fixture.componentInstance;
    expect(cmp.list()?.length).toBe(2);
    // Backend order is preserved as returned.
    expect(cmp.list()![0].id).toBe('est-2');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('est-2');
    expect(el.textContent).toContain('12 × 15 ft');
    expect(el.textContent).toContain('180 sq ft');
    expect(el.textContent).toContain(`₹${(270000).toLocaleString('en-IN')}`);
    expect(el.querySelector('.saved-rows')).toBeTruthy();
  });

  it('shows an empty state when nothing is saved', () => {
    const fixture = setupAuthenticated([]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No saved estimates yet');
  });

  it('shows a loading state while fetching', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      imports: [SavedEstimatesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SavedEstimatesComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading your estimates');
    httpMock.expectOne(ESTIMATES_URL).flush([]);
  });

  it('shows list errors with a retry that reloads', () => {
    const fixture = setupAuthenticated([]);
    const cmp = fixture.componentInstance;
    cmp.loadEstimates();
    httpMock.expectOne(ESTIMATES_URL).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');

    (el.querySelector('.saved-error button') as HTMLButtonElement).click();
    httpMock.expectOne(ESTIMATES_URL).flush([estimate({ id: 'est-1' })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('est-1');
  });

  it('asks logged-out visitors to log in and calls no estimate endpoints', () => {
    const fixture = setupAnonymous();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Log in to save estimates');
  });

  it('selecting a record loads its detail, never the Product API', () => {
    const fixture = setupAuthenticated([estimate({ id: 'est-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('est-1');
    fixture.detectChanges();
    expect(cmp.selected()).toBeNull();

    const req = httpMock.expectOne(`${ESTIMATES_URL}/est-1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(estimate({ id: 'est-1' }));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('est-1');
    expect(el.textContent).toContain('12 ft');
    expect(el.textContent).toContain('15 ft');
    expect(el.textContent).toContain('180 sq ft');
    expect(el.textContent).toContain(`₹${(1500).toLocaleString('en-IN')} / sq ft`);
    expect(el.textContent).toContain(`₹${(270000).toLocaleString('en-IN')}`);
    httpMock.expectNone(PRODUCTS_URL);
  });

  it('clears stale detail while loading another record', () => {
    const fixture = setupAuthenticated([estimate({ id: 'est-1' }), estimate({ id: 'est-2' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('est-1');
    httpMock.expectOne(`${ESTIMATES_URL}/est-1`).flush(estimate({ id: 'est-1' }));
    expect(cmp.selected()?.id).toBe('est-1');

    cmp.viewDetails('est-2');
    fixture.detectChanges();
    expect(cmp.selected()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading estimate');
    httpMock.expectOne(`${ESTIMATES_URL}/est-2`).flush(estimate({ id: 'est-2' }));
    fixture.detectChanges();
    expect(cmp.selected()?.id).toBe('est-2');
  });

  it('shows not-found with a back action that needs no refetch', () => {
    const fixture = setupAuthenticated([estimate({ id: 'est-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('est-9');
    httpMock.expectOne(`${ESTIMATES_URL}/est-9`).flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Estimate not found');

    (el.querySelector('.saved-empty .btn-secondary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('est-1');
  });

  it('shows detail errors with a retry', () => {
    const fixture = setupAuthenticated([estimate({ id: 'est-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('est-1');
    httpMock.expectOne(`${ESTIMATES_URL}/est-1`).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();

    cmp.retryDetail();
    httpMock.expectOne(`${ESTIMATES_URL}/est-1`).flush(estimate({ id: 'est-1' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('est-1');
  });

  it('401 resets the view and follows the existing logout behavior', async () => {
    const fixture = setupAuthenticated([estimate({ id: 'est-1' })]);
    const auth = TestBed.inject(AuthService);
    const cmp = fixture.componentInstance;

    cmp.loadEstimates();
    httpMock.expectOne(ESTIMATES_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(cmp.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to save estimates');
  });

  it('logout mid-visit clears the list so the next user starts clean', async () => {
    const fixture = setupAuthenticated([estimate({ id: 'est-1' })]);
    expect(fixture.componentInstance.list()?.length).toBe(1);

    TestBed.inject(AuthService).logout();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to save estimates');
  });

  it('loads the list after a mid-visit login', async () => {
    const fixture = setupAnonymous();
    const auth = TestBed.inject(AuthService);

    auth.login('a@test.local', 'secret123').subscribe();
    httpMock.expectOne(LOGIN_URL).flush({ Token: TOKEN });
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(ESTIMATES_URL).flush([estimate({ id: 'est-1' })]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('est-1');
  });
});
