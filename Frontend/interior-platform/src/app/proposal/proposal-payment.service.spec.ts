import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import {
  ProposalService,
  type CreateProposalPaymentResponse,
  type VerifyProposalPaymentResponse,
} from './proposal.service';
import { environment } from '../../environments/environment';

const PROPOSALS_URL = `${environment.apiBaseUrl}/api/proposals`;
const VERIFY_URL = `${environment.apiBaseUrl}/api/payments/verify`;
const TOKEN = 'test-jwt';

function paymentOrder(): CreateProposalPaymentResponse {
  return {
    paymentId: 'pay-local-1',
    proposalId: 'prop-1',
    provider: 'Razorpay',
    providerOrderId: 'order-test-1',
    amount: 500,
    currency: 'INR',
    providerKeyId: 'rzp_test_key',
  };
}

describe('ProposalService proposal payments', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify();
    localStorage.clear();
  });

  function setup(token: string | null) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(ProposalService);
  }

  it('createProposalPayment posts to the proposal payment endpoint with no amount', () => {
    const proposals = setup(TOKEN);
    let received: CreateProposalPaymentResponse | null = null;
    proposals.createProposalPayment('prop-1').subscribe((p) => (received = p));
    const req = httpMock.expectOne(`${PROPOSALS_URL}/prop-1/payment`);
    expect(req.request.method).toBe('POST');
    // The backend owns the token amount: the client sends an empty body and
    // must have nowhere to put a client-selected amount.
    expect(req.request.body).toEqual({});
    expect(Object.keys(req.request.body)).toEqual([]);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(paymentOrder());
    const created = received as CreateProposalPaymentResponse | null;
    expect(created?.paymentId).toBe('pay-local-1');
    expect(created?.providerOrderId).toBe('order-test-1');
    expect(created?.amount).toBe(500);
  });

  it('verifyProposalPayment posts only the Razorpay values and local payment id', () => {
    const proposals = setup(TOKEN);
    let received: VerifyProposalPaymentResponse | null = null;
    proposals
      .verifyProposalPayment({
        paymentId: 'pay-local-1',
        razorpayOrderId: 'order-test-1',
        razorpayPaymentId: 'pay-test-1',
        razorpaySignature: 'sig',
      })
      .subscribe((p) => (received = p));
    const req = httpMock.expectOne(VERIFY_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      paymentId: 'pay-local-1',
      razorpayOrderId: 'order-test-1',
      razorpayPaymentId: 'pay-test-1',
      razorpaySignature: 'sig',
    });
    expect(Object.keys(req.request.body).sort()).toEqual(
      ['paymentId', 'razorpayOrderId', 'razorpayPaymentId', 'razorpaySignature']
    );
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush({ paymentId: 'pay-local-1', proposalId: 'prop-1', status: 1, verifiedAt: '2026-10-03T10:00:00Z' });
    expect((received as VerifyProposalPaymentResponse | null)?.status).toBe(1);
  });

  it('sends no Authorization header when logged out', () => {
    const proposals = setup(null);
    proposals.createProposalPayment('prop-1').subscribe({ error: () => undefined });
    const req = httpMock.expectOne(`${PROPOSALS_URL}/prop-1/payment`);
    expect(req.request.headers.get('Authorization')).toBeNull();
    req.flush(paymentOrder());
  });
});
