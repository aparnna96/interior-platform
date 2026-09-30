import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  LeadService,
  type LeadCreateRequest,
  type LeadResponse,
} from './lead.service';

const LEADS_URL = 'http://localhost:5175/api/leads';

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
});
