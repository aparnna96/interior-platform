import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { SavedEstimatesComponent } from './saved-estimates.component';
import type { EstimateDto } from './estimate.service';
import type { ProposalDetailDto } from '../proposal/proposal.service';
import { environment } from '../../environments/environment';

const ESTIMATES_URL = `${environment.apiBaseUrl}/api/estimates`;
const PROPOSALS_URL = `${environment.apiBaseUrl}/api/proposals`;
const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
const CART_URL = `${environment.apiBaseUrl}/api/cart`;
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

function createdProposal(): ProposalDetailDto {
  return {
    id: 'prop-9',
    estimateId: 'est-1',
    status: 0,
    createdAt: '2026-10-02T10:00:00Z',
    width: 12,
    length: 15,
    area: 180,
    ratePerSquareFoot: 1500,
    estimatedAmount: 270000,
    isPaymentVerified: false,
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
  };
}

describe('SavedEstimatesComponent proposal creation', () => {
  let httpMock: HttpTestingController;

  function setupAuthenticated(list: EstimateDto[]) {
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      imports: [SavedEstimatesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
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

  it('shows a Create Proposal button for each saved estimate', () => {
    const fixture = setupAuthenticated([estimate({ id: 'est-1' }), estimate({ id: 'est-2' })]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[aria-label="Create proposal for estimate est-1"]')?.textContent).toContain('Create Proposal');
    expect(el.querySelector('[aria-label="Create proposal for estimate est-2"]')?.textContent).toContain('Create Proposal');
  });

  it('create sends exactly one POST with { estimateId } and Bearer auth', () => {
    const fixture = setupAuthenticated([estimate({ id: 'est-1' })]);
    const cmp = fixture.componentInstance;
    let emitted: ProposalDetailDto | null = null;
    cmp.proposalCreated.subscribe((p) => (emitted = p));

    cmp.createProposal('est-1');
    const req = httpMock.expectOne(PROPOSALS_URL);
    expect(req.request.method).toBe('POST');
    // Only the estimate id may leave the client: no userId, prices, names,
    // totals, status or timestamps.
    expect(req.request.body).toEqual({ estimateId: 'est-1' });
    expect(Object.keys(req.request.body)).toEqual(['estimateId']);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(createdProposal());
    fixture.detectChanges();

    expect(emitted!.id).toBe('prop-9');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Proposal created successfully.');
    // The saved estimate is unchanged and still listed.
    expect(cmp.list()?.length).toBe(1);
    expect(cmp.list()![0].id).toBe('est-1');
    httpMock.expectNone(PRODUCTS_URL);
    httpMock.expectNone(CART_URL);
  });

  it('duplicate create clicks collapse into a single POST with a creating state', () => {
    const fixture = setupAuthenticated([estimate({ id: 'est-1' })]);
    const cmp = fixture.componentInstance;

    cmp.createProposal('est-1');
    cmp.createProposal('est-1');
    cmp.createProposal('est-2');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Creating…');
    httpMock.expectOne(PROPOSALS_URL).flush(createdProposal());
    expect(cmp.creatingProposalFor()).toBeNull();
  });

  it('failed creation keeps the saved estimate and allows retry', () => {
    const fixture = setupAuthenticated([estimate({ id: 'est-1' })]);
    const cmp = fixture.componentInstance;

    cmp.createProposal('est-1');
    httpMock.expectOne(PROPOSALS_URL).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');
    // Nothing was removed or mutated: the estimate row is still there.
    expect(cmp.list()?.length).toBe(1);
    expect(el.textContent).toContain('est-1');

    (el.querySelector('.saved-error button') as HTMLButtonElement).click();
    const retry = httpMock.expectOne(PROPOSALS_URL);
    expect(retry.request.body).toEqual({ estimateId: 'est-1' });
    retry.flush(createdProposal());
    fixture.detectChanges();
    expect(el.textContent).toContain('Proposal created successfully.');
    expect(cmp.list()?.length).toBe(1);
  });

  it('logged-out create attempts never reach the API and ask for login', () => {
    const fixture = setupAnonymous();
    const cmp = fixture.componentInstance;

    // The existing login guidance is shown; there is no row to act on.
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to save estimates');
    cmp.createProposal('est-1');
    expect(cmp.createProposalError()).toContain('log in');
    httpMock.expectNone(PROPOSALS_URL);
    httpMock.expectNone(ESTIMATES_URL);
  });

  it('detail view offers Create Proposal for the selected estimate', () => {
    const fixture = setupAuthenticated([estimate({ id: 'est-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('est-1');
    httpMock.expectOne(`${ESTIMATES_URL}/est-1`).flush(estimate({ id: 'est-1' }));
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '[aria-label="Create proposal for estimate est-1"]'
    ) as HTMLButtonElement;
    expect(button?.textContent).toContain('Create Proposal');
    button.click();
    const req = httpMock.expectOne(PROPOSALS_URL);
    expect(req.request.body).toEqual({ estimateId: 'est-1' });
    req.flush(createdProposal());
    expect(cmp.selected()?.id).toBe('est-1');
  });

  it('401 on create logs out and clears proposal creation state', async () => {
    const fixture = setupAuthenticated([estimate({ id: 'est-1' })]);
    const auth = TestBed.inject(AuthService);
    const cmp = fixture.componentInstance;

    cmp.createProposal('est-1');
    httpMock.expectOne(PROPOSALS_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.isAuthenticated()).toBe(false);
    expect(cmp.list()).toBeNull();
    expect(cmp.creatingProposalFor()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to save estimates');
  });
});
