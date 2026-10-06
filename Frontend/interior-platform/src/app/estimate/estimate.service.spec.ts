import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { EstimateService, type EstimateDto } from './estimate.service';
import { environment } from '../../environments/environment';

const ESTIMATES_URL = `${environment.apiBaseUrl}/api/estimates`;
const TOKEN = 'test-jwt';

function estimate(): EstimateDto {
  return {
    id: 'est-1',
    width: 12,
    length: 15,
    area: 180,
    ratePerSquareFoot: 1500,
    estimatedAmount: 270000,
    createdAt: '2026-10-01T10:00:00Z',
  };
}

describe('EstimateService', () => {
  let estimates: EstimateService;
  let httpMock: HttpTestingController;

  function setup(token: string | null) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    estimates = TestBed.inject(EstimateService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify();
    localStorage.clear();
  });

  it('createEstimate sends only dimensions and furniture lines with Bearer auth', () => {
    setup(TOKEN);
    let received: EstimateDto | null = null;
    estimates.createEstimate(12, 15).subscribe((e) => (received = e));
    const req = httpMock.expectOne(ESTIMATES_URL);
    expect(req.request.method).toBe('POST');
    // No userId, area, rate, amount or timestamps may leave the client.
    expect(req.request.body).toEqual({ width: 12, length: 15, items: [] });
    expect(Object.keys(req.request.body).sort()).toEqual(['items', 'length', 'width']);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(estimate());
    expect(received!.id).toBe('est-1');
    expect(received!.estimatedAmount).toBe(270000);
  });

  it('createEstimate sends furniture as type and quantity only', () => {
    setup(TOKEN);
    estimates
      .createEstimate(12, 15, [
        { furnitureType: 'sofa', quantity: 1 },
        { furnitureType: 'chair', quantity: 4 },
      ])
      .subscribe();
    const req = httpMock.expectOne(ESTIMATES_URL);
    expect(req.request.body.items).toEqual([
      { furnitureType: 'sofa', quantity: 1 },
      { furnitureType: 'chair', quantity: 4 },
    ]);
    // Names, sizes and prices are server-resolved and never sent.
    for (const line of req.request.body.items) {
      expect(Object.keys(line).sort()).toEqual(['furnitureType', 'quantity']);
    }
    req.flush(estimate());
  });

  it('getEstimates lists with Bearer auth', () => {
    setup(TOKEN);
    let received: EstimateDto[] | null = null;
    estimates.getEstimates().subscribe((e) => (received = e));
    const req = httpMock.expectOne(ESTIMATES_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush([estimate()]);
    expect(received!.length).toBe(1);
  });

  it('getEstimate fetches one estimate by id with Bearer auth', () => {
    setup(TOKEN);
    let received: EstimateDto | null = null;
    estimates.getEstimate('est-9').subscribe((e) => (received = e));
    const req = httpMock.expectOne(`${ESTIMATES_URL}/est-9`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(estimate());
    expect(received!.id).toBe('est-1');
  });

  it('sends no Authorization header when logged out', () => {
    setup(null);
    estimates.getEstimates().subscribe({ error: () => undefined });
    const req = httpMock.expectOne(ESTIMATES_URL);
    expect(req.request.headers.get('Authorization')).toBeNull();
    req.flush([]);
  });
});
