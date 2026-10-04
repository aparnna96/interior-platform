import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { AdminProposalsComponent } from './admin-proposals.component';
import type {
  AdminProposalDetailDto,
  AdminProposalSummaryDto,
} from '../proposal/proposal.service';
import { environment } from '../../environments/environment';

const ADMIN_PROPOSALS_URL = `${environment.apiBaseUrl}/api/admin/proposals`;
const CUSTOMER_PROPOSALS_URL = `${environment.apiBaseUrl}/api/proposals`;
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

function adminRow(partial: Partial<AdminProposalSummaryDto> & { id: string }): AdminProposalSummaryDto {
  return {
    userId: 'user-a',
    customerEmail: 'a@test.local',
    estimateId: 'est-1',
    area: 180,
    ratePerSquareFoot: 1500,
    estimatedAmount: 270000,
    status: 0,
    createdAt: '2026-10-02T10:00:00Z',
    isPaymentVerified: false,
    paymentAttemptCount: 0,
    ...partial,
  };
}

function adminPayment(partial: Partial<AdminProposalDetailDto['payments'][number]> = {}) {
  return {
    id: 'pay-1',
    status: 1,
    provider: 'Razorpay',
    providerOrderId: 'order-test-1',
    providerPaymentId: 'pay-test-1',
    amount: 500,
    currency: 'INR',
    createdAt: '2026-10-02T10:00:00Z',
    verifiedAt: '2026-10-02T11:00:00Z',
    ...partial,
  };
}

function adminDetail(partial: Partial<AdminProposalDetailDto> & { id: string }): AdminProposalDetailDto {
  return {
    userId: 'user-a',
    customerEmail: 'a@test.local',
    estimateId: 'est-1',
    width: 12,
    length: 15,
    area: 180,
    ratePerSquareFoot: 1500,
    estimatedAmount: 270000,
    status: 0,
    createdAt: '2026-10-02T10:00:00Z',
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
    payments: [],
    ...partial,
  };
}

function pdfBlob(): Blob {
  return new Blob(['%PDF-1.4 fake-bytes'], { type: 'application/pdf' });
}

describe('AdminProposalsComponent', () => {
  let httpMock: HttpTestingController;

  function setup(token: string | null) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    TestBed.configureTestingModule({
      imports: [AdminProposalsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminProposalsComponent);
    fixture.detectChanges();
    return fixture;
  }

  function setupAdmin(list: AdminProposalSummaryDto[]) {
    const fixture = setup(ADMIN_JWT);
    httpMock.expectOne(ADMIN_PROPOSALS_URL).flush(list);
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

  it('loads every proposal with Bearer auth and renders operational rows', () => {
    const fixture = setupAdmin([
      adminRow({ id: 'prop-2', userId: 'user-b', customerEmail: 'b@test.local', isPaymentVerified: true, paymentAttemptCount: 1 }),
      adminRow({ id: 'prop-1', status: 0 }),
    ]);
    const cmp = fixture.componentInstance;
    expect(cmp.list()?.length).toBe(2);
    // Server order is preserved as returned.
    expect(cmp.list()![0].id).toBe('prop-2');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('b@test.local');
    expect(el.textContent).toContain('a@test.local');
    expect(el.textContent).toContain('Draft');
    expect(el.textContent).toContain('Token Payment Verified');
    expect(el.textContent).toContain('No Payment Attempt');
    expect(el.textContent).toContain('180 sq ft');
    expect(el.textContent).toContain(`₹${(270000).toLocaleString('en-IN')}`);
    expect(el.querySelector('.proposal-rows')).toBeTruthy();
  });

  it('shows Payment Pending for proposals with attempts but no verification', () => {
    const fixture = setupAdmin([adminRow({ id: 'prop-1', paymentAttemptCount: 2 })]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Payment Pending');
  });

  it('shows short identifiers in rows and the full id in detail', () => {
    const fixture = setupAdmin([adminRow({ id: 'prop-abcdef-1234' })]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('prop-abc');

    const cmp = fixture.componentInstance;
    cmp.viewDetails('prop-abcdef-1234');
    httpMock.expectOne(`${ADMIN_PROPOSALS_URL}/prop-abcdef-1234`).flush(
      adminDetail({ id: 'prop-abcdef-1234' })
    );
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('prop-abcdef-1234');
  });

  it('shows an empty state when no proposals exist', () => {
    const fixture = setupAdmin([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No proposals yet');
  });

  it('shows a loading state while fetching', () => {
    const fixture = setup(ADMIN_JWT);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading proposals');
    httpMock.expectOne(ADMIN_PROPOSALS_URL).flush([]);
  });

  it('shows list errors with a retry that reloads', () => {
    const fixture = setupAdmin([]);
    const cmp = fixture.componentInstance;
    cmp.loadProposals();
    httpMock.expectOne(ADMIN_PROPOSALS_URL).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');

    (el.querySelector('.admin-proposals-error button') as HTMLButtonElement).click();
    httpMock.expectOne(ADMIN_PROPOSALS_URL).flush([adminRow({ id: 'prop-1' })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('a@test.local');
  });

  it('selecting a proposal loads detail with snapshot items, payments and verification state', () => {
    const fixture = setupAdmin([adminRow({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('prop-1');
    fixture.detectChanges();
    expect(cmp.selected()).toBeNull();

    const req = httpMock.expectOne(`${ADMIN_PROPOSALS_URL}/prop-1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${ADMIN_JWT}`);
    req.flush(adminDetail({
      id: 'prop-1',
      isPaymentVerified: true,
      payments: [
        adminPayment({ id: 'pay-2', status: 1 }),
        adminPayment({ id: 'pay-1', status: 2, providerPaymentId: null, verifiedAt: null }),
      ],
    }));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('prop-1');
    expect(el.textContent).toContain('a@test.local');
    expect(el.textContent).toContain('user-a');
    expect(el.textContent).toContain('est-1');
    expect(el.textContent).toContain('Draft');
    expect(el.textContent).toContain('12 × 15 ft');
    expect(el.textContent).toContain('180 sq ft');
    expect(el.textContent).toContain('Aria 3-Seater Fabric Sofa');
    expect(el.textContent).toContain('aria-3s-sofa');
    expect(el.textContent).toContain('× 2');
    expect(el.textContent).toContain(`₹${(42999).toLocaleString('en-IN')} each`);
    expect(el.textContent).toContain(`₹${(85998).toLocaleString('en-IN')}`);
    expect(el.textContent).toContain('Token payment verified');
    expect(el.textContent).toContain('pay-2');
    expect(el.textContent).toContain('pay-1');
    expect(el.textContent).toContain('Payment Failed');
    expect(el.textContent).toContain('Razorpay');
    expect(el.textContent).toContain('order-test-1');
    expect(el.textContent).toContain('pay-test-1');
    httpMock.expectNone(PRODUCTS_URL);
    httpMock.expectNone(CUSTOMER_PROPOSALS_URL);
  });

  it('shows the not-verified state with payment attempts but no PDF action', () => {
    const fixture = setupAdmin([adminRow({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('prop-1');
    httpMock.expectOne(`${ADMIN_PROPOSALS_URL}/prop-1`).flush(
      adminDetail({ id: 'prop-1', payments: [adminPayment({ id: 'pay-1', status: 0, providerPaymentId: null, verifiedAt: null })] })
    );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Token payment not verified');
    expect(el.textContent).toContain('Payment Pending');
    expect(el.textContent).toContain('PDF available after token payment');
    expect(el.querySelector('[aria-label="Download proposal PDF for prop-1"]')).toBeNull();
  });

  it('shows a locked PDF with no payment attempts', () => {
    const fixture = setupAdmin([adminRow({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('prop-1');
    httpMock.expectOne(`${ADMIN_PROPOSALS_URL}/prop-1`).flush(adminDetail({ id: 'prop-1' }));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No payment attempts recorded for this proposal.');
    expect(el.textContent).toContain('PDF available after token payment');
  });

  it('verified detail enables PDF download through the existing endpoint', () => {
    const fixture = setupAdmin([adminRow({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('prop-1');
    httpMock.expectOne(`${ADMIN_PROPOSALS_URL}/prop-1`).flush(
      adminDetail({ id: 'prop-1', isPaymentVerified: true, payments: [adminPayment()] })
    );
    fixture.detectChanges();

    const saveSpy = spyOn(
      cmp as unknown as { saveBlob(blob: Blob, name: string): void },
      'saveBlob'
    ).and.stub();
    (fixture.nativeElement as HTMLElement)
      .querySelector('[aria-label="Download proposal PDF for prop-1"]')!
      .dispatchEvent(new Event('click'));
    const req = httpMock.expectOne(`${CUSTOMER_PROPOSALS_URL}/prop-1/pdf`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${ADMIN_JWT}`);
    const blob = pdfBlob();
    req.flush(blob);
    fixture.detectChanges();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.calls.mostRecent().args[0]).toBe(blob);
    expect(saveSpy.calls.mostRecent().args[1]).toBe('proposal-prop-1.pdf');
    expect(cmp.pdfDownloading()).toBeFalse();
  });

  it('download failure shows an error without losing the detail', () => {
    const fixture = setupAdmin([adminRow({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('prop-1');
    httpMock.expectOne(`${ADMIN_PROPOSALS_URL}/prop-1`).flush(
      adminDetail({ id: 'prop-1', isPaymentVerified: true })
    );
    fixture.detectChanges();

    cmp.downloadPdf();
    httpMock.expectOne(`${CUSTOMER_PROPOSALS_URL}/prop-1/pdf`).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(cmp.selected()?.id).toBe('prop-1');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain(
      'Something went wrong'
    );
  });

  it('prevents duplicate download requests while downloading', () => {
    const fixture = setupAdmin([adminRow({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('prop-1');
    httpMock.expectOne(`${ADMIN_PROPOSALS_URL}/prop-1`).flush(
      adminDetail({ id: 'prop-1', isPaymentVerified: true })
    );
    fixture.detectChanges();
    spyOn(cmp as unknown as { saveBlob(blob: Blob, name: string): void }, 'saveBlob').and.stub();

    cmp.downloadPdf();
    cmp.downloadPdf();
    cmp.retryPdf();
    httpMock.expectOne(`${CUSTOMER_PROPOSALS_URL}/prop-1/pdf`).flush(pdfBlob());
    fixture.detectChanges();
    expect(cmp.pdfDownloading()).toBeFalse();
  });

  it('shows not-found with a back action that needs no refetch', () => {
    const fixture = setupAdmin([adminRow({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('prop-9');
    httpMock.expectOne(`${ADMIN_PROPOSALS_URL}/prop-9`).flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Proposal not found');

    (el.querySelector('.admin-proposals-empty .btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('a@test.local');
  });

  it('shows detail errors with a retry', () => {
    const fixture = setupAdmin([adminRow({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('prop-1');
    httpMock.expectOne(`${ADMIN_PROPOSALS_URL}/prop-1`).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();

    cmp.retryDetail();
    httpMock.expectOne(`${ADMIN_PROPOSALS_URL}/prop-1`).flush(adminDetail({ id: 'prop-1' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aria 3-Seater Fabric Sofa');
  });

  it('back returns to the list without an unnecessary refetch', () => {
    const fixture = setupAdmin([adminRow({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;

    cmp.viewDetails('prop-1');
    httpMock.expectOne(`${ADMIN_PROPOSALS_URL}/prop-1`).flush(adminDetail({ id: 'prop-1' }));
    fixture.detectChanges();
    cmp.backToList();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('a@test.local');
    httpMock.expectNone(ADMIN_PROPOSALS_URL);
  });

  it('asks logged-out visitors to log in and calls no admin endpoints', () => {
    const fixture = setup(null);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to access the Proposals workspace');
    httpMock.expectNone(ADMIN_PROPOSALS_URL);
  });

  it('field staff sees access-denied and loads no admin data', () => {
    const fixture = setup(STAFF_JWT);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "You don't have access to this workspace."
    );
    expect(fixture.componentInstance.canAccess()).toBe(false);
    httpMock.expectNone(ADMIN_PROPOSALS_URL);
    httpMock.expectNone(CUSTOMER_PROPOSALS_URL);
  });

  it('customers see access-denied and load no admin data', () => {
    const fixture = setup(CUSTOMER_JWT);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "You don't have access to this workspace."
    );
    expect(fixture.componentInstance.canAccess()).toBe(false);
    httpMock.expectNone(ADMIN_PROPOSALS_URL);
    httpMock.expectNone(CUSTOMER_PROPOSALS_URL);
  });

  it('direct access attempts by non-admins issue no requests', () => {
    const fixture = setup(STAFF_JWT);
    const cmp = fixture.componentInstance;
    expect(cmp.canAccess()).toBe(false);
    cmp.loadProposals();
    cmp.viewDetails('prop-1');
    cmp.downloadPdf();
    expect(cmp.list()).toBeNull();
    expect(cmp.selected()).toBeNull();
    httpMock.expectNone(ADMIN_PROPOSALS_URL);
  });

  it('403 produces an access-denied state', () => {
    const fixture = setup(ADMIN_JWT);
    httpMock.expectOne(ADMIN_PROPOSALS_URL).flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "You don't have access to this workspace."
    );
  });

  it('401 follows the existing logout/reset behavior', async () => {
    const fixture = setupAdmin([adminRow({ id: 'prop-1' })]);
    const auth = TestBed.inject(AuthService);
    const cmp = fixture.componentInstance;

    cmp.loadProposals();
    httpMock.expectOne(ADMIN_PROPOSALS_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(cmp.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to access the Proposals workspace');
  });

  it('logout mid-visit clears the list so the next user starts clean', async () => {
    const fixture = setupAdmin([adminRow({ id: 'prop-1' })]);
    expect(fixture.componentInstance.list()?.length).toBe(1);

    TestBed.inject(AuthService).logout();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to access the Proposals workspace');
  });

  it('loads the list after a mid-visit login', async () => {
    const fixture = setup(null);
    const auth = TestBed.inject(AuthService);

    auth.login('admin@test.local', 'secret123').subscribe();
    httpMock.expectOne(LOGIN_URL).flush({ Token: ADMIN_JWT });
    await fixture.whenStable();
    fixture.detectChanges();
    // Admin session established after login: the workspace loads itself.
    httpMock.expectOne(ADMIN_PROPOSALS_URL).flush([adminRow({ id: 'prop-1' })]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('a@test.local');
  });

  it('stores no proposal data in browser storage', () => {
    const fixture = setupAdmin([adminRow({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;
    const localSet = spyOn(localStorage, 'setItem').and.callThrough();
    const sessionSet = spyOn(sessionStorage, 'setItem').and.callThrough();

    cmp.viewDetails('prop-1');
    httpMock.expectOne(`${ADMIN_PROPOSALS_URL}/prop-1`).flush(adminDetail({ id: 'prop-1' }));
    fixture.detectChanges();

    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });
});
