import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import {
  AdminEstimateRateService,
  EstimateRateService,
  type AdminEstimateRateDto,
} from './estimate-rate.service';
import { environment } from '../../environments/environment';

const RATE_URL = `${environment.apiBaseUrl}/api/estimate-rate`;
const ADMIN_RATES_URL = `${environment.apiBaseUrl}/api/admin/estimate-rates`;
const TOKEN = 'test-jwt';

function adminRate(partial: Partial<AdminEstimateRateDto> = {}): AdminEstimateRateDto {
  return {
    id: 'rate-1',
    ratePerSquareFoot: 1800,
    isActive: true,
    createdAt: '2026-10-02T08:30:00Z',
    createdByEmail: 'admin@test.local',
    ...partial,
  };
}

describe('EstimateRateService', () => {
  let service: EstimateRateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EstimateRateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('starts with no rate: there is no built-in number to fall back to', () => {
    expect(service.rate()).toBeNull();
    expect(service.status()).toBe('idle');
  });

  it('loads the public rate without any Authorization header', () => {
    // Even with a session present, the public read carries no credentials.
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.inject(AuthService);

    service.load();
    expect(service.status()).toBe('loading');
    const req = httpMock.expectOne(RATE_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ ratePerSquareFoot: 1800, updatedAt: '2026-10-02T08:30:00Z' });

    expect(service.rate()).toBe(1800);
    expect(service.status()).toBe('ready');
  });

  it('does not repeat a request that is already in flight', () => {
    service.load();
    service.load();
    service.load();
    httpMock.expectOne(RATE_URL).flush({ ratePerSquareFoot: 1500, updatedAt: '2026-10-01T00:00:00Z' });

    // Once settled, a later load fetches again so the preview stays current.
    service.load();
    httpMock.expectOne(RATE_URL).flush({ ratePerSquareFoot: 1600, updatedAt: '2026-10-03T00:00:00Z' });
    expect(service.rate()).toBe(1600);
  });

  it('keeps the rate null and reports an error when the request fails', () => {
    service.load();
    httpMock.expectOne(RATE_URL).flush(null, { status: 503, statusText: 'Service Unavailable' });

    expect(service.rate()).toBeNull();
    expect(service.status()).toBe('error');
  });

  it('keeps an earlier rate when a later refresh fails, and recovers on the next success', () => {
    service.load();
    httpMock.expectOne(RATE_URL).flush({ ratePerSquareFoot: 1500, updatedAt: '2026-10-01T00:00:00Z' });

    service.load();
    httpMock.expectOne(RATE_URL).error(new ProgressEvent('error'));
    expect(service.rate()).toBe(1500);
    expect(service.status()).toBe('error');

    service.load();
    httpMock.expectOne(RATE_URL).flush({ ratePerSquareFoot: 1700, updatedAt: '2026-10-04T00:00:00Z' });
    expect(service.rate()).toBe(1700);
    expect(service.status()).toBe('ready');
  });

  it('ignores an unusable rate in the response instead of showing it', () => {
    for (const bad of [0, -5, null, 'abc', Number.NaN]) {
      service.load();
      httpMock.expectOne(RATE_URL).flush({ ratePerSquareFoot: bad, updatedAt: '2026-10-01T00:00:00Z' });
      expect(service.rate()).toBeNull();
      expect(service.status()).toBe('error');
    }
  });

  it('adopt() takes the rate a saved estimate was actually priced with', () => {
    service.adopt(2000);
    expect(service.rate()).toBe(2000);
    expect(service.status()).toBe('ready');

    service.adopt(0);
    service.adopt(-3);
    service.adopt(Number.NaN);
    expect(service.rate()).toBe(2000);
  });
});

describe('AdminEstimateRateService', () => {
  let service: AdminEstimateRateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    service = TestBed.inject(AdminEstimateRateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('getRates sends the Bearer token and returns the server order', () => {
    let received: AdminEstimateRateDto[] = [];
    service.getRates().subscribe((rows) => (received = rows));

    const req = httpMock.expectOne(ADMIN_RATES_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush([adminRate(), adminRate({ id: 'rate-0', ratePerSquareFoot: 1500, isActive: false })]);

    expect(received.map((r) => r.id)).toEqual(['rate-1', 'rate-0']);
  });

  it('setRate posts only the rate, with Bearer auth, and exposes the status code', () => {
    let status = 0;
    service.setRate(1800).subscribe((res) => (status = res.status));

    const req = httpMock.expectOne(ADMIN_RATES_URL);
    expect(req.request.method).toBe('POST');
    // No id, active flag, timestamp or user may leave the client.
    expect(req.request.body).toEqual({ ratePerSquareFoot: 1800 });
    expect(Object.keys(req.request.body)).toEqual(['ratePerSquareFoot']);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush(adminRate(), { status: 201, statusText: 'Created' });

    expect(status).toBe(201);
  });
});
