import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import {
  ProposalService,
  proposalStatusLabel,
  type ProposalDetailDto,
} from './proposal.service';
import { environment } from '../../environments/environment';

const PROPOSALS_URL = `${environment.apiBaseUrl}/api/proposals`;
const TOKEN = 'test-jwt';

function detail(): ProposalDetailDto {
  return {
    id: 'prop-1',
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

describe('ProposalService', () => {
  let proposals: ProposalService;
  let httpMock: HttpTestingController;

  function setup(token: string | null) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    proposals = TestBed.inject(ProposalService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify();
    localStorage.clear();
  });

  it('createProposal sends POST to /api/proposals with exactly { estimateId }', () => {
    setup(TOKEN);
    let received: ProposalDetailDto | null = null;
    proposals.createProposal('est-1').subscribe((p) => (received = p));
    const req = httpMock.expectOne(PROPOSALS_URL);
    expect(req.request.method).toBe('POST');
    // No userId, prices, names, totals, status or timestamps may leave the client.
    expect(req.request.body).toEqual({ estimateId: 'est-1' });
    expect(Object.keys(req.request.body)).toEqual(['estimateId']);
    req.flush(detail());
    expect(received!.id).toBe('prop-1');
    expect(received!.estimateId).toBe('est-1');
    expect(received!.status).toBe(0);
  });

  it('createProposal attaches the Bearer header', () => {
    setup(TOKEN);
    proposals.createProposal('est-1').subscribe();
    const req = httpMock.expectOne(PROPOSALS_URL);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(detail());
  });

  it('getProposals lists with Bearer auth', () => {
    setup(TOKEN);
    let received: unknown = null;
    proposals.getProposals().subscribe((p) => (received = p));
    const req = httpMock.expectOne(PROPOSALS_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush([{ id: 'prop-1', estimateId: 'est-1', status: 0, createdAt: '2026-10-02T10:00:00Z', area: 180, estimatedAmount: 270000 }]);
    expect(Array.isArray(received)).toBe(true);
  });

  it('getProposal fetches one proposal by id with Bearer auth', () => {
    setup(TOKEN);
    let received: ProposalDetailDto | null = null;
    proposals.getProposal('prop-9').subscribe((p) => (received = p));
    const req = httpMock.expectOne(`${PROPOSALS_URL}/prop-9`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(detail());
    expect(received!.id).toBe('prop-1');
  });

  it('sends no Authorization header when logged out', () => {
    setup(null);
    proposals.getProposals().subscribe({ error: () => undefined });
    const req = httpMock.expectOne(PROPOSALS_URL);
    expect(req.request.headers.get('Authorization')).toBeNull();
    req.flush([]);
  });

  it('labels proposal statuses', () => {
    expect(proposalStatusLabel(0)).toBe('Draft');
    expect(proposalStatusLabel(99)).toBe('Unknown');
  });
});
