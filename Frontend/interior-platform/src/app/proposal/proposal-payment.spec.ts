import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { ProposalsComponent } from './proposals.component';
import { RazorpayCheckoutService } from './razorpay-checkout.service';
import type {
  RazorpayCheckoutOptions,
  RazorpayCheckoutResponse,
} from './razorpay-checkout';
import type {
  CreateProposalPaymentResponse,
  ProposalDetailDto,
  ProposalSummaryDto,
  VerifyProposalPaymentResponse,
} from './proposal.service';
import { environment } from '../../environments/environment';

const PROPOSALS_URL = `${environment.apiBaseUrl}/api/proposals`;
const VERIFY_URL = `${environment.apiBaseUrl}/api/payments/verify`;
const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
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
    ...partial,
  };
}

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

function checkoutResponse(): RazorpayCheckoutResponse {
  return {
    razorpay_order_id: 'order-test-1',
    razorpay_payment_id: 'pay-test-1',
    razorpay_signature: 'sig',
  };
}

function verified(): VerifyProposalPaymentResponse {
  return {
    paymentId: 'pay-local-1',
    proposalId: 'prop-1',
    status: 1,
    verifiedAt: '2026-10-03T10:00:00Z',
  };
}

/** Deterministic stand-in for window.Razorpay (no network, no real payment). */
class FakeCheckoutInstance {
  opened = false;
  throwOnOpen = false;
  failedHandlers: Array<(response: unknown) => void> = [];

  constructor(readonly options: RazorpayCheckoutOptions) {}

  open(): void {
    if (this.throwOnOpen) {
      throw new Error('checkout failed to open');
    }
    this.opened = true;
  }

  on(_event: 'payment.failed', handler: (response: unknown) => void): void {
    this.failedHandlers.push(handler);
  }

  succeed(response: RazorpayCheckoutResponse): void {
    this.options.handler?.(response);
  }

  dismiss(): void {
    this.options.modal?.ondismiss?.();
  }

  failLast(): void {
    this.failedHandlers.forEach((handler) => handler({ error: 'declined' }));
  }
}

class FakeCheckoutService {
  instances: FakeCheckoutInstance[] = [];
  loadCalls = 0;
  loadResult = true;
  returnNull = false;

  async load(): Promise<boolean> {
    this.loadCalls++;
    return this.loadResult;
  }

  open(options: RazorpayCheckoutOptions): FakeCheckoutInstance | null {
    if (this.returnNull) {
      return null;
    }
    const instance = new FakeCheckoutInstance(options);
    this.instances.push(instance);
    return instance;
  }
}

describe('ProposalsComponent token payment', () => {
  let httpMock: HttpTestingController;
  let checkout: FakeCheckoutService;

  function setupAuthenticatedWithDetail(verifiedPayment = false) {
    checkout = new FakeCheckoutService();
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      imports: [ProposalsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RazorpayCheckoutService, useValue: checkout },
      ],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProposalsComponent);
    fixture.detectChanges();
    httpMock.expectOne(PROPOSALS_URL).flush([summary({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;
    cmp.viewDetails('prop-1');
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1`).flush(detail({ id: 'prop-1', isPaymentVerified: verifiedPayment }));
    fixture.detectChanges();
    return { fixture, cmp };
  }

  function setupAnonymous() {
    checkout = new FakeCheckoutService();
    TestBed.configureTestingModule({
      imports: [ProposalsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RazorpayCheckoutService, useValue: checkout },
      ],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProposalsComponent);
    fixture.detectChanges();
    return fixture;
  }

  /** Starts payment and flushes the backend order, then settles checkout load. */
  async function startPayment(
    cmp: ProposalsComponent,
    fixture: ReturnType<typeof TestBed.createComponent<ProposalsComponent>>
  ): Promise<FakeCheckoutInstance> {
    cmp.payToken();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/payment`).flush(paymentOrder());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(checkout.instances.length).toBe(1);
    return checkout.instances[0];
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify();
    localStorage.clear();
  });

  it('shows a Pay Token action for the open proposal', () => {
    const { fixture } = setupAuthenticatedWithDetail();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '[aria-label="Pay token payment for proposal prop-1"]'
    ) as HTMLButtonElement;
    expect(button?.textContent).toContain('Pay Token');
  });

  it('payToken posts the payment order with no amount and Bearer auth', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    cmp.payToken();
    const req = httpMock.expectOne(`${PROPOSALS_URL}/prop-1/payment`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(paymentOrder());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(checkout.instances.length).toBe(1);
  });

  it('prevents duplicate order creation while creating', () => {
    const { cmp } = setupAuthenticatedWithDetail();
    cmp.payToken();
    cmp.payToken();
    cmp.retryPayment();
    expect(cmp.paymentBusy()).toBeTrue();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/payment`).flush(paymentOrder());
  });

  it('displays the backend token amount once the order exists', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    await startPayment(cmp, fixture);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Pay ₹500');
  });

  it('opens Checkout with the backend key, paise amount, currency and order id', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    const instance = await startPayment(cmp, fixture);
    expect(instance.opened).toBeTrue();
    expect(instance.options.key).toBe('rzp_test_key');
    expect(instance.options.amount).toBe(50000);
    expect(instance.options.currency).toBe('INR');
    expect(instance.options.order_id).toBe('order-test-1');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Checkout is open');
  });

  it('verifies with the backend and shows success only after verification', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    const instance = await startPayment(cmp, fixture);

    instance.succeed(checkoutResponse());
    const verify = httpMock.expectOne(VERIFY_URL);
    expect(verify.request.method).toBe('POST');
    expect(verify.request.body).toEqual({
      paymentId: 'pay-local-1',
      razorpayOrderId: 'order-test-1',
      razorpayPaymentId: 'pay-test-1',
      razorpaySignature: 'sig',
    });
    expect(verify.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    fixture.detectChanges();
    // Verifying — but success must not show before the backend answers.
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Confirming your payment…');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Payment verified');

    verify.flush(verified());
    // The component refreshes backend detail for the PDF gate.
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1`).flush(detail({ id: 'prop-1', isPaymentVerified: true }));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Payment verified');
    expect(el.textContent).toContain('Your token payment has been verified successfully.');
    expect(el.textContent).toContain('pay-local-1');
    httpMock.expectNone(`${PROPOSALS_URL}/prop-1/pdf`);
  });

  it('shows failure when backend verification rejects the payment', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    const instance = await startPayment(cmp, fixture);

    instance.succeed(checkoutResponse());
    httpMock.expectOne(VERIFY_URL).flush(null, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');
    expect(el.textContent).not.toContain('Payment verified');
  });

  it('treats a non-Verified verify response as failure without claiming success', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    const instance = await startPayment(cmp, fixture);

    instance.succeed(checkoutResponse());
    httpMock.expectOne(VERIFY_URL).flush({ ...verified(), status: 2, verifiedAt: null });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Payment verified');
    expect(cmp.paymentState()).toBe('failed');
  });

  it('dismissing Checkout shows cancellation without calling verification', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    const instance = await startPayment(cmp, fixture);

    instance.dismiss();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "Payment was cancelled. You can try again when you're ready."
    );
    httpMock.expectNone(VERIFY_URL);
  });

  it('a Razorpay payment failure shows failure without calling verification', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    const instance = await startPayment(cmp, fixture);

    instance.failLast();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('The payment did not go through.');
    httpMock.expectNone(VERIFY_URL);
  });

  it('order creation failure shows an error and allows retry', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    cmp.payToken();
    httpMock
      .expectOne(`${PROPOSALS_URL}/prop-1/payment`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();
    expect(checkout.instances.length).toBe(0);

    cmp.retryPayment();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/payment`).flush(paymentOrder());
    await fixture.whenStable();
    expect(checkout.instances.length).toBe(1);
  });

  it('409 reports the verified payment without offering a blind retry', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    cmp.payToken();
    httpMock
      .expectOne(`${PROPOSALS_URL}/prop-1/payment`)
      .flush({ title: 'This proposal already has a verified token payment.' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('This proposal already has a verified token payment.');
    expect(el.querySelector('.payment-box .linklike')).toBeNull();
    expect(checkout.instances.length).toBe(0);
    httpMock.expectNone(`${PROPOSALS_URL}/prop-1/pdf`);
  });

  it('401 during payment logs out and resets according to existing behavior', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    const auth = TestBed.inject(AuthService);
    cmp.payToken();
    httpMock
      .expectOne(`${PROPOSALS_URL}/prop-1/payment`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(cmp.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to view your proposals');
  });

  it('401 during verification logs out and resets', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    const instance = await startPayment(cmp, fixture);
    instance.succeed(checkoutResponse());
    httpMock.expectOne(VERIFY_URL).flush(null, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
    expect(cmp.selected()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to view your proposals');
  });

  it('unavailable checkout script shows payment-unavailable and allows retry', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    checkout.loadResult = false;
    cmp.payToken();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/payment`).flush(paymentOrder());
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Payments are currently unavailable.');
    expect(checkout.instances.length).toBe(0);

    checkout.loadResult = true;
    cmp.retryPayment();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/payment`).flush(paymentOrder());
    await fixture.whenStable();
    expect(checkout.instances.length).toBe(1);
  });

  it('checkout initialization failure shows an error without crashing', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    checkout.returnNull = true;
    cmp.payToken();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/payment`).flush(paymentOrder());
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Payments are currently unavailable.');
  });

  it('checkout open throwing shows an error without crashing', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    const instance = await startPayment(cmp, fixture);
    instance.dismiss();
    fixture.detectChanges();
    checkout.instances.length = 0;
    spyOn(checkout, 'open').and.throwError('boom');
    cmp.retryPayment();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/payment`).flush(paymentOrder());
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Could not start the payment.');
  });

  it('navigating away mid-creation never opens a stale checkout', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    cmp.payToken();
    cmp.backToProposals();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/payment`).flush(paymentOrder());
    await fixture.whenStable();
    fixture.detectChanges();

    expect(checkout.instances.length).toBe(0);
    expect(cmp.paymentState()).toBe('idle');
  });

  it('reopening the proposal resets payment state to the backend truth', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    const instance = await startPayment(cmp, fixture);
    instance.succeed(checkoutResponse());
    httpMock.expectOne(VERIFY_URL).flush(verified());
    // The component refreshes backend detail for the PDF gate.
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1`).flush(detail({ id: 'prop-1', isPaymentVerified: true }));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Payment verified');

    cmp.viewDetails('prop-1');
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1`).flush(detail({ id: 'prop-1' }));
    fixture.detectChanges();

    expect(cmp.paymentState()).toBe('idle');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Payment verified');
    expect(
      el.querySelector('[aria-label="Pay token payment for proposal prop-1"]')?.textContent
    ).toContain('Pay Token');
  });

  it('logged-out users see no Pay action and never reach the payment API', () => {
    const fixture = setupAnonymous();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Log in to view your proposals');
    expect(el.querySelector('[aria-label^="Pay token payment"]')).toBeNull();

    fixture.componentInstance.payToken();
    httpMock.expectNone(`${PROPOSALS_URL}/prop-1/payment`);
    httpMock.expectNone(VERIFY_URL);
  });

  it('never consults the Product API for payment', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    const instance = await startPayment(cmp, fixture);
    instance.succeed(checkoutResponse());
    httpMock.expectOne(VERIFY_URL).flush(verified());
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1`).flush(detail({ id: 'prop-1', isPaymentVerified: true }));
    fixture.detectChanges();
    httpMock.expectNone(PRODUCTS_URL);
  });

  it('unverified proposal locks PDF download without calling the endpoint', () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail(false);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('PDF available after token payment');
    expect(el.querySelector('[aria-label="Download proposal PDF for prop-1"]')).toBeNull();
    expect(cmp.selected()?.isPaymentVerified).toBeFalse();
    httpMock.expectNone(`${PROPOSALS_URL}/prop-1/pdf`);
  });

  it('verified proposal shows Download PDF from the backend flag', () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelector('[aria-label="Download proposal PDF for prop-1"]')?.textContent
    ).toContain('Download PDF');
    expect(el.textContent).not.toContain('PDF available after token payment');
    expect(cmp.selected()?.isPaymentVerified).toBeTrue();
  });

  it('checkout success alone does not enable PDF before backend verification', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail(false);
    const instance = await startPayment(cmp, fixture);

    instance.succeed(checkoutResponse());
    httpMock.expectOne(VERIFY_URL);
    fixture.detectChanges();

    // Still verifying: the PDF stays locked until the backend answers.
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Confirming your payment…');
    expect(el.textContent).toContain('PDF available after token payment');
    expect(el.querySelector('[aria-label="Download proposal PDF for prop-1"]')).toBeNull();
    httpMock.expectNone(`${PROPOSALS_URL}/prop-1/pdf`);
  });

  it('successful verification refreshes backend detail and enables PDF', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail(false);
    const saveSpy = spyOn(
      cmp as unknown as { saveBlob(blob: Blob, name: string): void },
      'saveBlob'
    ).and.stub();
    const instance = await startPayment(cmp, fixture);

    instance.succeed(checkoutResponse());
    httpMock.expectOne(VERIFY_URL).flush(verified());
    // The component re-reads the detail so the PDF gate follows backend truth.
    const refresh = httpMock.expectOne(`${PROPOSALS_URL}/prop-1`);
    expect(refresh.request.method).toBe('GET');
    expect(refresh.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    refresh.flush(detail({ id: 'prop-1', isPaymentVerified: true }));
    fixture.detectChanges();

    // The payment confirmation survives the refresh; the PDF unlocks.
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Payment verified');
    expect(
      el.querySelector('[aria-label="Download proposal PDF for prop-1"]')?.textContent
    ).toContain('Download PDF');
    expect(el.textContent).not.toContain('PDF available after token payment');
    expect(cmp.selected()?.isPaymentVerified).toBeTrue();

    // The unlocked download still goes through the backend gate.
    cmp.downloadPdf();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/pdf`).flush(new Blob(['%PDF-1.4 fake']));
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('failed detail refresh keeps verified UI but PDF stays locked', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail(false);
    const instance = await startPayment(cmp, fixture);

    instance.succeed(checkoutResponse());
    httpMock.expectOne(VERIFY_URL).flush(verified());
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1`).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // The authoritative verify response still stands; the PDF gate, lacking
    // fresh backend truth, stays locked rather than opening on stale state.
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Payment verified');
    expect(el.textContent).toContain('PDF available after token payment');
    expect(el.querySelector('[aria-label="Download proposal PDF for prop-1"]')).toBeNull();
  });

  it('stores no payment authorization in browser storage', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail(false);
    const localSet = spyOn(localStorage, 'setItem').and.callThrough();
    const sessionSet = spyOn(sessionStorage, 'setItem').and.callThrough();
    const saveSpy = spyOn(
      cmp as unknown as { saveBlob(blob: Blob, name: string): void },
      'saveBlob'
    ).and.stub();

    const instance = await startPayment(cmp, fixture);
    instance.succeed(checkoutResponse());
    httpMock.expectOne(VERIFY_URL).flush(verified());
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1`).flush(detail({ id: 'prop-1', isPaymentVerified: true }));
    fixture.detectChanges();
    cmp.downloadPdf();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/pdf`).flush(new Blob(['%PDF-1.4 fake']));
    fixture.detectChanges();

    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });
});
