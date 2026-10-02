import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { ProposalService } from './proposal.service';
import { ProposalsComponent } from './proposals.component';
import type { ProposalDetailDto, ProposalSummaryDto } from './proposal.service';
import { environment } from '../../environments/environment';

const PROPOSALS_URL = `${environment.apiBaseUrl}/api/proposals`;
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

function pdfBlob(): Blob {
  return new Blob(['%PDF-1.4 fake-bytes'], { type: 'application/pdf' });
}

describe('ProposalService downloadProposalPdf', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify();
    localStorage.clear();
  });

  it('calls GET /api/proposals/{id}/pdf with Bearer auth and returns the blob', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    const proposals = TestBed.inject(ProposalService);
    httpMock = TestBed.inject(HttpTestingController);

    let received: Blob | null = null;
    proposals.downloadProposalPdf('prop-1').subscribe((b) => (received = b));
    const req = httpMock.expectOne(`${PROPOSALS_URL}/prop-1/pdf`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    // No request body may influence the server-rendered snapshot document.
    expect(req.request.body).toBeNull();
    const blob = pdfBlob();
    req.flush(blob);
    expect(received as Blob | null).toBe(blob as Blob);
  });
});

describe('ProposalsComponent proposal PDF download', () => {
  let httpMock: HttpTestingController;

  function setupAuthenticatedWithDetail() {
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      imports: [ProposalsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProposalsComponent);
    fixture.detectChanges();
    httpMock.expectOne(PROPOSALS_URL).flush([summary({ id: 'prop-1' })]);
    const cmp = fixture.componentInstance;
    cmp.viewDetails('prop-1');
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1`).flush(detail({ id: 'prop-1' }));
    fixture.detectChanges();
    return { fixture, cmp };
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

  it('logged-out users see no download and never reach the PDF endpoint', () => {
    const fixture = setupAnonymous();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Log in to view your proposals');
    expect(el.querySelector('[aria-label^="Download proposal PDF"]')).toBeNull();

    fixture.componentInstance.downloadPdf();
    httpMock.expectNone(`${PROPOSALS_URL}/prop-1/pdf`);
  });

  it('detail shows a Download PDF button for the open proposal', () => {
    const { fixture } = setupAuthenticatedWithDetail();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '[aria-label="Download proposal PDF for prop-1"]'
    ) as HTMLButtonElement;
    expect(button?.textContent).toContain('Download PDF');
    expect(button.disabled).toBeFalse();
  });

  it('download calls the correct endpoint with Bearer auth and saves proposal-{id}.pdf', () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    const saveSpy = spyOn(
      cmp as unknown as { saveBlob(blob: Blob, name: string): void },
      'saveBlob'
    ).and.stub();

    cmp.downloadPdf();
    const req = httpMock.expectOne(`${PROPOSALS_URL}/prop-1/pdf`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    const blob = pdfBlob();
    req.flush(blob);
    fixture.detectChanges();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.calls.mostRecent().args[0]).toBe(blob);
    expect(saveSpy.calls.mostRecent().args[1]).toBe('proposal-prop-1.pdf');
    expect(cmp.pdfDownloading()).toBeFalse();
    expect(cmp.pdfError()).toBeNull();
    httpMock.expectNone(PRODUCTS_URL);
  });

  it('shows a generating state and prevents duplicate download requests', () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    spyOn(cmp as unknown as { saveBlob(blob: Blob, name: string): void }, 'saveBlob').and.stub();

    cmp.downloadPdf();
    cmp.downloadPdf();
    cmp.retryPdf();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Generating PDF…');
    const button = el.querySelector(
      '[aria-label="Download proposal PDF for prop-1"]'
    ) as HTMLButtonElement;
    expect(button.disabled).toBeTrue();

    // Exactly one request despite the repeated attempts.
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/pdf`).flush(pdfBlob());
    fixture.detectChanges();
    expect(cmp.pdfDownloading()).toBeFalse();
  });

  it('names downloads proposal-{proposalId}.pdf', () => {
    const { cmp } = setupAuthenticatedWithDetail();
    expect(cmp.pdfFileName('prop-1')).toBe('proposal-prop-1.pdf');
  });

  it('401 on download logs out and resets the view', async () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    const auth = TestBed.inject(AuthService);

    cmp.downloadPdf();
    // A null body avoids blob conversion in the test backend; the handler only reads status.
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/pdf`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(cmp.list()).toBeNull();
    expect(cmp.selected()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to view your proposals');
  });

  it('404 keeps the detail and offers a retry that succeeds', () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();
    const saveSpy = spyOn(
      cmp as unknown as { saveBlob(blob: Blob, name: string): void },
      'saveBlob'
    ).and.stub();

    cmp.downloadPdf();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/pdf`).flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    // The snapshot detail stays intact; only the download failed.
    expect(cmp.selected()?.id).toBe('prop-1');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('That proposal could not be found.');

    (el.querySelector('.proposals-error button') as HTMLButtonElement).click();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/pdf`).flush(pdfBlob());
    fixture.detectChanges();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(cmp.pdfError()).toBeNull();
  });

  it('server errors show a useful message without losing the detail', () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();

    cmp.downloadPdf();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/pdf`).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(cmp.selected()?.id).toBe('prop-1');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain(
      'Something went wrong'
    );
  });

  it('back to list clears the download state without refetching', () => {
    const { fixture, cmp } = setupAuthenticatedWithDetail();

    cmp.downloadPdf();
    httpMock.expectOne(`${PROPOSALS_URL}/prop-1/pdf`).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(cmp.pdfError()).not.toBeNull();

    cmp.backToProposals();
    fixture.detectChanges();
    expect(cmp.pdfError()).toBeNull();
    expect(cmp.pdfDownloading()).toBeFalse();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('prop-1');
    httpMock.expectNone(PROPOSALS_URL);
  });
});
