import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  LeadService,
  leadStatusLabel,
  type LeadCreateRequest,
  type LeadResponse,
} from './lead.service';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { environment } from '../../environments/environment';

const LEADS_URL = `${environment.apiBaseUrl}/api/leads`;

const API_RESPONSE: LeadResponse = {
  id: 'lead-id-1',
  name: 'Asha Rao',
  phone: '+911234567890',
  email: 'asha@example.com',
  message: 'Living room makeover.',
  interestedProductId: 'aria-3s-sofa',
  source: 'Furniture Product',
  status: 0,
  createdAt: '2026-09-30T10:00:00Z',
};

describe('LeadService', () => {
  let service: LeadService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(LeadService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('can be created', () => {
    expect(service).toBeTruthy();
  });

  it('POSTs to /api/leads with the request payload', () => {
    const request: LeadCreateRequest = {
      name: 'Asha Rao',
      phone: '+911234567890',
      email: 'asha@example.com',
      message: 'Living room makeover.',
      interestedProductId: 'aria-3s-sofa',
      source: 'Furniture Product',
    };
    service.submitLead(request).subscribe();
    const req = httpMock.expectOne(LEADS_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Asha Rao',
      phone: '+911234567890',
      email: 'asha@example.com',
      message: 'Living room makeover.',
      interestedProductId: 'aria-3s-sofa',
      source: 'Furniture Product',
    });
    req.flush(API_RESPONSE);
  });

  it('omits optional fields when they are not supplied', () => {
    service
      .submitLead({ name: 'Asha Rao', phone: '123', message: 'Hello.' })
      .subscribe();
    const req = httpMock.expectOne(LEADS_URL);
    expect(req.request.body).toEqual({
      name: 'Asha Rao',
      phone: '123',
      message: 'Hello.',
    });
    req.flush({ ...API_RESPONSE, email: null, interestedProductId: null, source: null });
  });

  it('returns the API response to the caller', () => {
    let result: LeadResponse | null = null;
    service
      .submitLead({ name: 'Asha Rao', phone: '123', message: 'Hello.' })
      .subscribe((r) => (result = r));
    httpMock.expectOne(LEADS_URL).flush(API_RESPONSE);
    expect(result!).toEqual(API_RESPONSE);
  });

  it('labels lead statuses', () => {
    expect(leadStatusLabel(0)).toBe('New');
    expect(leadStatusLabel(1)).toBe('In Progress');
    expect(leadStatusLabel(2)).toBe('Closed');
    expect(leadStatusLabel(99)).toBe('Unknown');
  });

  describe('staff endpoints', () => {
    const TOKEN = 'staff-jwt';

    // AuthService snapshots localStorage at construction, so the token must
    // be stored before a fresh injector is built for each test.
    function setupWithToken(token: string | null): void {
      TestBed.resetTestingModule();
      localStorage.clear();
      if (token) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
      }
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      TestBed.inject(AuthService);
      service = TestBed.inject(LeadService);
      httpMock = TestBed.inject(HttpTestingController);
    }

    afterEach(() => {
      localStorage.clear();
    });

    it('getLeads lists with Bearer auth', () => {
      setupWithToken(TOKEN);
      let received: LeadResponse[] | null = null;
      service.getLeads().subscribe((leads) => (received = leads));
      const req = httpMock.expectOne(LEADS_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
      req.flush([API_RESPONSE]);
      expect(received!).toEqual([API_RESPONSE]);
    });

    it('getLead fetches one lead by id with Bearer auth', () => {
      setupWithToken(TOKEN);
      let received: LeadResponse | null = null;
      service.getLead('lead-id-1').subscribe((lead) => (received = lead));
      const req = httpMock.expectOne(`${LEADS_URL}/lead-id-1`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
      req.flush(API_RESPONSE);
      expect(received!).toEqual(API_RESPONSE);
    });

    it('updateLeadStatus patches the status number with Bearer auth', () => {
      setupWithToken(TOKEN);
      let received: LeadResponse | null = null;
      service.updateLeadStatus('lead-id-1', 1).subscribe((lead) => (received = lead));
      const req = httpMock.expectOne(`${LEADS_URL}/lead-id-1/status`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ status: 1 });
      expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
      req.flush({ ...API_RESPONSE, status: 1 });
      expect(received!.status).toBe(1);
    });

    it('sends no Authorization header when logged out', () => {
      setupWithToken(null);
      service.getLeads().subscribe({ error: () => undefined });
      const req = httpMock.expectOne(LEADS_URL);
      expect(req.request.headers.get('Authorization')).toBeNull();
      req.flush([]);
    });
  });
});
