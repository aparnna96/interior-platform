import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { ProposalsComponent } from './proposals.component';
import type { ProposalDetailDto, ProposalSummaryDto } from './proposal.service';
import { environment } from '../../environments/environment';

const PROPOSALS_URL = `${environment.apiBaseUrl}/api/proposals`;
const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;
const TOKEN = 'test-jwt';

function summary(partial: Partial<ProposalSummaryDto> & { id: string }): ProposalSummaryDto {
  return {
    estimateId: 'est-1',
    status: 0,
    createdAt: '2026-10-02T10:00:00Z',
    area: 180,
    estimatedAmount: 270000,
    ...partial,
  };
}

function detail(partial: Partial<ProposalDetailDto> & { id: string }): ProposalDetailDto {
  return {
    estimateId: 'est-1',
    status: 0,
    createdAt: '2026-10-02T10:00:00Z',
    width: 12,
    length: 15,
    area: 180,
    ratePerSquareFoot: 1500,
    estimatedAmount: 270000,
    items: [
      {
        id: 'pi-1',
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

describe('ProposalsComponent', () => {
  let httpMock: HttpTestingController;

  function setupAuthenticated(list: ProposalSummaryDto[]) {
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      imports: [ProposalsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    // Component construction fires the constructor load for the session.
    const fixture = TestBed.createComponent(ProposalsComponent);
    fixture.detectChanges();
    httpMock.expectOne(PROPOSALS_URL).flush(list);
    httpMock.verify();
    fixture.detectChanges();
    return fixture;
  }

  function setupAnonymous() {
    TestBed.configureTestingModule({
      imports: [ProposalsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProposalsComponent);
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

  it('loads the authenticated proposal list with Bearer auth', () => {
    const fixture = setupAuthenticated([summary({ id: 'prop-2' }), summary({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;
    expect(cmp.list()?.length).toBe(2);
    // Server order is preserved (newest first comes from the server).
    expect(cmp.list()![0].id).toBe('prop-2');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('prop-2');
    expect(el.textContent).toContain('Draft');
    expect(el.textContent).toContain(`₹${(270000).toLocaleString('en-IN')}`);
  });

  it('renders ID, status, date, area and amount per row with a View button', () => {
    const fixture = setupAuthenticated([summary({ id: 'prop-7', area: 200, estimatedAmount: 100500 })]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('prop-7');
    expect(el.textContent).toContain('Draft');
    expect(el.textContent).toContain('200 sq ft');
    expect(el.textContent).toContain(`₹${(100500).toLocaleString('en-IN')}`);
    expect(el.querySelector('.proposal-rows')).toBeTruthy();
    expect(el.querySelector('[aria-label="View details for proposal prop-7"]')?.textContent).toContain('View');
  });

  it('shows an empty state with a browse action', () => {
    const fixture = setupAuthenticated([]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No proposals yet');
    let browsed = false;
    fixture.componentInstance.browse.subscribe(() => (browsed = true));
    (el.querySelector('.proposals-empty .btn-primary') as HTMLButtonElement).click();
    expect(browsed).toBeTrue();
  });

  it('shows a loading state while fetching', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      imports: [ProposalsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProposalsComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading your proposals');
    httpMock.expectOne(PROPOSALS_URL).flush([]);
  });

  it('shows list errors with a retry that reloads', () => {
    const fixture = setupAuthenticated([]);
    const cmp = fixture.componentInstance;
    cmp.loadProposals();
    httpMock.expectOne(PROPOSALS_URL).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');

    (el.querySelector('.proposals-error button') as HTMLButtonElement).click();
    httpMock.expectOne(PROPOSALS_URL).flush([summary({ id: 'prop-1' })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('prop-1');
  });

  it('asks logged-out visitors to log in and calls no proposal endpoints', () => {
    const fixture = setupAnonymous();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Log in to view your proposals');
    httpMock.expectNone(PROPOSALS_URL);
  });

  it('selecting a proposal loads its detail from snapshots, never the Product API', () => {
    const fixture = setupAuthenticated([summary({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('prop-1');
    fixture.detectChanges();
    // Stale data is impossible: the previous (empty) detail stays empty.
    expect(cmp.selected()).toBeNull();

    const req = httpMock.expectOne(`${PROPOSALS_URL}/prop-1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(detail({ id: 'prop-1' }));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Proposal preview');
    expect(el.textContent).toContain('prop-1');
    expect(el.textContent).toContain('Draft');
    expect(el.textContent).toContain('12 × 15 ft');
    expect(el.textContent).toContain('180 sq ft');
    expect(el.textContent).toContain(`₹${(1500).toLocaleString('en-IN')} / sq ft`);
    expect(el.textContent).toContain(`₹${(270000).toLocaleString('en-IN')}`);
    // Snapshot lines render directly from the Proposal API.
    expect(el.textContent).toContain('Aria 3-Seater Fabric Sofa');
    expect(el.textContent).toContain('× 2');
    expect(el.textContent).toContain(`₹${(42999).toLocaleString('en-IN')} each`);
    expect(el.textContent).toContain(`₹${(85998).toLocaleString('en-IN')}`);
    expect(el.textContent).toContain('Token payments are processed securely via Razorpay.');
    httpMock.expectNone(PRODUCTS_URL);
  });

  it('clears stale detail while loading another proposal', () => {
    const fixture = setupAuthenticated([summary({ id: 'prop-1' }), summary({ id: 'prop-2' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('prop-1');
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1`).flush(detail({ id: 'prop-1' }));
    expect(cmp.selected()?.id).toBe('prop-1');

    cmp.viewDetails('prop-2');
    fixture.detectChanges();
    expect(cmp.selected()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading proposal');
    httpMock.expectOne(`${PROPOSALS_URL}/prop-2`).flush(detail({ id: 'prop-2' }));
    fixture.detectChanges();
    expect(cmp.selected()?.id).toBe('prop-2');
  });

  it('shows not-found with a back action that needs no refetch', () => {
    const fixture = setupAuthenticated([summary({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('prop-9');
    httpMock.expectOne(`${PROPOSALS_URL}/prop-9`).flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Proposal not found');

    (el.querySelector('.proposals-empty .btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('prop-1');
    httpMock.expectNone(PROPOSALS_URL);
  });

  it('shows detail errors with a retry', () => {
    const fixture = setupAuthenticated([summary({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('prop-1');
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1`).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();

    cmp.retryDetail();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1`).flush(detail({ id: 'prop-1' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aria 3-Seater Fabric Sofa');
  });

  it('back returns to the list without an unnecessary refetch', () => {
    const fixture = setupAuthenticated([summary({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('prop-1');
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1`).flush(detail({ id: 'prop-1' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Proposal preview');

    cmp.backToProposals();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('prop-1');
    expect(fixture.nativeElement.textContent).not.toContain('Proposal preview');
    httpMock.expectNone(PROPOSALS_URL);
  });

  it('uses the shared Draft status mapping', () => {
    const fixture = setupAuthenticated([summary({ id: 'prop-d', status: 0 })]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Draft');
  });

  it('401 resets the view and follows the existing logout behavior', async () => {
    const fixture = setupAuthenticated([summary({ id: 'prop-1' })]);
    const auth = TestBed.inject(AuthService);
    const cmp = fixture.componentInstance;

    cmp.loadProposals();
    httpMock.expectOne(PROPOSALS_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(cmp.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to view your proposals');
  });

  it('logout mid-visit clears the list so the next user starts clean', async () => {
    const fixture = setupAuthenticated([summary({ id: 'prop-1' })]);
    expect(fixture.componentInstance.list()?.length).toBe(1);

    TestBed.inject(AuthService).logout();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to view your proposals');
  });

  it('loads the list after a mid-visit login', async () => {
    const fixture = setupAnonymous();
    const auth = TestBed.inject(AuthService);

    auth.login('a@test.local', 'secret123').subscribe();
    httpMock.expectOne(LOGIN_URL).flush({ Token: TOKEN });
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(PROPOSALS_URL).flush([summary({ id: 'prop-1' })]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('prop-1');
  });

  it('showCreated opens the new detail without a detail GET and refreshes the list entry', () => {
    const fixture = setupAuthenticated([summary({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;

    cmp.showCreated(detail({ id: 'prop-9', estimateId: 'est-9' }));
    fixture.detectChanges();

    expect(cmp.selected()?.id).toBe('prop-9');
    expect(cmp.list()![0].id).toBe('prop-9');
    expect(cmp.list()?.length).toBe(2);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Proposal created successfully.');
    expect(el.textContent).toContain('Proposal preview');
    expect(el.textContent).toContain('Aria 3-Seater Fabric Sofa');
    // No detail fetch was needed: the snapshot was already in hand.
    httpMock.expectNone(`${PROPOSALS_URL}/prop-9`);
  });

  it('createdDetail input opens the snapshot detail while the list refreshes from the server', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      imports: [ProposalsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProposalsComponent);
    fixture.componentRef.setInput('createdDetail', detail({ id: 'prop-9', estimateId: 'est-9' }));
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.selected()?.id).toBe('prop-9');
    // The constructor list load is the server refresh; it resolves separately.
    httpMock.expectOne(PROPOSALS_URL).flush([summary({ id: 'prop-9', estimateId: 'est-9' }), summary({ id: 'prop-1' })]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Proposal preview');
    expect(el.textContent).toContain('prop-9');
    httpMock.expectNone(`${PROPOSALS_URL}/prop-9`);
  });

  it('emits browse to return to the Furniture catalogue', () => {
    const fixture = setupAnonymous();
    let browsed = false;
    fixture.componentInstance.browse.subscribe(() => (browsed = true));
    fixture.componentInstance.goBrowse();
    expect(browsed).toBeTrue();
  });
});
