import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';

/** Payload for POST /api/leads. Optional fields are omitted when empty. */
export interface LeadCreateRequest {
  name: string;
  phone: string;
  email?: string;
  message: string;
  interestedProductId?: string;
  source?: string;
}

/** Shape returned by POST /api/leads. No UserId is ever exposed. */
export interface LeadResponse {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string;
  interestedProductId: string | null;
  source: string | null;
  /** Lead status as stored (0 = New). Kept numeric like the API. */
  status: number;
  createdAt: string;
}

const LEADS_URL = 'http://localhost:5175/api/leads';

/**
 * Public lead/enquiry submission client.
 * Anonymous use is supported — no authentication required.
 * Source is always supplied by the calling page, never hardcoded here.
 */
@Injectable({ providedIn: 'root' })
export class LeadService {
  private readonly http = inject(HttpClient);

  submitLead(request: LeadCreateRequest): Observable<LeadResponse> {
    const body: Record<string, unknown> = {
      name: request.name,
      phone: request.phone,
      message: request.message,
    };
    if (request.email) body['email'] = request.email;
    if (request.interestedProductId) body['interestedProductId'] = request.interestedProductId;
    if (request.source) body['source'] = request.source;
    return this.http.post<LeadResponse>(LEADS_URL, body);
  }
}
