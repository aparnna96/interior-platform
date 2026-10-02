import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import type { Observable } from 'rxjs';
import { AuthService } from '../auth.service';

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

const LEADS_URL = `${environment.apiBaseUrl}/api/leads`;

/** Backend lead statuses: 0 New, 1 InProgress, 2 Closed. */
export const LEAD_STATUS_NEW = 0;
export const LEAD_STATUS_IN_PROGRESS = 1;
export const LEAD_STATUS_CLOSED = 2;

const LEAD_STATUS_LABELS = ['New', 'In Progress', 'Closed'];

/** Human label for a backend lead status number. */
export function leadStatusLabel(status: number): string {
  return LEAD_STATUS_LABELS[status] ?? 'Unknown';
}

/**
 * Public lead/enquiry submission client.
 * Anonymous use is supported — no authentication required.
 * Source is always supplied by the calling page, never hardcoded here.
 */
@Injectable({ providedIn: 'root' })
export class LeadService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

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

  /** GET /api/leads — staff/admin only, newest first. Requires Bearer auth. */
  getLeads(): Observable<LeadResponse[]> {
    return this.http.get<LeadResponse[]>(LEADS_URL, { headers: this.authHeaders() });
  }

  /** GET /api/leads/{id} — staff/admin only. Requires Bearer auth. */
  getLead(id: string): Observable<LeadResponse> {
    return this.http.get<LeadResponse>(`${LEADS_URL}/${id}`, { headers: this.authHeaders() });
  }

  /** PATCH /api/leads/{id}/status — staff/admin only. Status enum number. */
  updateLeadStatus(id: string, status: number): Observable<LeadResponse> {
    return this.http.patch<LeadResponse>(
      `${LEADS_URL}/${id}/status`, { status }, { headers: this.authHeaders() });
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.token();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
