import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AppComponent } from './app.component';
import { AuthService, AUTH_TOKEN_KEY } from './auth.service';
import { environment } from '../environments/environment';

const TOKEN = 'test-jwt';
const CART_URL = `${environment.apiBaseUrl}/api/cart`;
const ESTIMATES_URL = `${environment.apiBaseUrl}/api/estimates`;
const PROPOSALS_URL = `${environment.apiBaseUrl}/api/proposals`;
const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;

function savedRow(id: string) {
  return {
    id,
    width: 12,
    length: 15,
    area: 180,
    ratePerSquareFoot: 1500,
    estimatedAmount: 270000,
    createdAt: '2026-10-01T10:00:00Z',
  };
}

function createdDetail() {
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

function proposalSummary(id: string, estimateId = 'est-1') {
  return {
    id,
    estimateId,
    status: 0,
    createdAt: '2026-10-02T10:00:00Z',
    area: 180,
    estimatedAmount: 270000,
  };
}

describe('AppComponent proposals integration', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
  });

  function createAuthedApp() {
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    const fixture = TestBed.createComponent(AppComponent);
    httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
    return fixture;
  }

  function openEstimates(fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>) {
    const app = fixture.componentInstance;
    app.activeView.set('estimates');
    fixture.detectChanges();
    httpMock.expectOne(ESTIMATES_URL).flush([savedRow('est-1')]);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows a Proposals entry in the public navbar near Orders and Cart', () => {
    const fixture = createAuthedApp();
    fixture.detectChanges();
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.pubnav-links button')
    ).map((b) => (b as HTMLElement).textContent?.trim());
    expect(labels).toContain('Proposals');
    // Near the existing customer entries.
    expect(labels.indexOf('Proposals')).toBeGreaterThan(labels.indexOf('Cart'));
  });

  it('shows a Proposals entry in the workspace sidebar', () => {
    const fixture = createAuthedApp();
    fixture.componentInstance.activeView.set('estimates');
    fixture.detectChanges();
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('#app-sidebar .nav-item')
    ).map((b) => (b as HTMLElement).textContent?.trim());
    expect(labels).toContain('Proposals');
  });

  it('opens the proposals view from the navbar', () => {
    const fixture = createAuthedApp();
    fixture.detectChanges();
    // The default home view loads the public catalogue.
    httpMock.expectOne(PRODUCTS_URL).flush([]);
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.pubnav-links button')
    ) as HTMLButtonElement[];
    buttons.find((b) => b.textContent?.trim() === 'Proposals')!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.activeView()).toBe('proposals');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-proposals')).toBeTruthy();
    httpMock.expectOne(PROPOSALS_URL).flush([]);
    httpMock.verify();
  });

  it('logged-out proposals view asks for login and calls no proposal endpoints', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.componentInstance.activeView.set('proposals');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to view your proposals');
    httpMock.expectNone(PROPOSALS_URL);
    httpMock.verify();
  });

  it('loads the proposal list in the proposals view when authenticated', () => {
    const fixture = createAuthedApp();
    fixture.componentInstance.activeView.set('proposals');
    fixture.detectChanges();

    const listReq = httpMock.expectOne(PROPOSALS_URL);
    expect(listReq.request.method).toBe('GET');
    expect(listReq.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    listReq.flush([proposalSummary('prop-2'), proposalSummary('prop-1')]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('prop-2');
    expect(el.textContent).toContain('Draft');
    // Server order is preserved.
    const text = el.textContent ?? '';
    expect(text.indexOf('prop-2')).toBeLessThan(text.indexOf('prop-1'));
    httpMock.verify();
  });

  it('creating from a saved estimate posts exactly { estimateId } and opens the new detail', () => {
    const fixture = createAuthedApp();
    const el = openEstimates(fixture);
    expect(el.textContent).toContain('est-1');

    const createButton = el.querySelector(
      '[aria-label="Create proposal for estimate est-1"]'
    ) as HTMLButtonElement;
    expect(createButton?.textContent).toContain('Create Proposal');
    createButton.click();

    const post = httpMock.expectOne(PROPOSALS_URL);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ estimateId: 'est-1' });
    expect(Object.keys(post.request.body)).toEqual(['estimateId']);
    expect(post.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    post.flush(createdDetail());
    fixture.detectChanges();

    // The shell navigated to Proposals and the list refresh fired.
    expect(fixture.componentInstance.activeView()).toBe('proposals');
    httpMock.expectOne(PROPOSALS_URL).flush([proposalSummary('prop-9')]);
    fixture.detectChanges();

    const view = fixture.nativeElement as HTMLElement;
    expect(view.textContent).toContain('Proposal preview');
    expect(view.textContent).toContain('prop-9');
    expect(view.textContent).toContain('Aria 3-Seater Fabric Sofa');
    expect(view.textContent).toContain('A small token payment unlocks the proposal PDF.');
    // The snapshot opened without a detail fetch.
    httpMock.expectNone(`${PROPOSALS_URL}/prop-9`);
    // The saved estimate and the cart were never written to.
    httpMock.expectNone(ESTIMATES_URL, 'POST');
    httpMock.expectNone(ESTIMATES_URL, 'PUT');
    httpMock.expectNone(ESTIMATES_URL, 'DELETE');
    httpMock.expectNone(`${CART_URL}/items`);
    httpMock.expectNone(CART_URL, 'POST');
    httpMock.verify();
  });

  it('estimates Proposal panel links to the proposals view', () => {
    const fixture = createAuthedApp();
    const el = openEstimates(fixture);
    const panel = el.querySelector('section[aria-label="Proposal"]') as HTMLElement;
    expect(panel?.textContent).toContain('pay the token amount to unlock its PDF');
    (panel.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.activeView()).toBe('proposals');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-proposals')).toBeTruthy();
    httpMock.expectOne(PROPOSALS_URL).flush([]);
    httpMock.verify();
  });

  it('logout after creation clears proposal state for the next user', async () => {
    const fixture = createAuthedApp();
    const el = openEstimates(fixture);
    (el.querySelector('[aria-label="Create proposal for estimate est-1"]') as HTMLButtonElement).click();
    httpMock.expectOne(PROPOSALS_URL).flush(createdDetail());
    fixture.detectChanges();
    httpMock.expectOne(PROPOSALS_URL).flush([proposalSummary('prop-9')]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Proposal preview');

    TestBed.inject(AuthService).logout();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.createdProposal()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to view your proposals');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('prop-9');
    httpMock.verify();
  });
});
