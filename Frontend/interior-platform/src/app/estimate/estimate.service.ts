import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth.service';

/** Backend estimate shape (POST responses, GET detail). */
export interface EstimateDto {
  id: string;
  width: number;
  length: number;
  area: number;
  ratePerSquareFoot: number;
  estimatedAmount: number;
  createdAt: string;
}

/** Backend estimate list row (GET /api/estimates). Same fields for now. */
export type EstimateSummaryDto = EstimateDto;

const ESTIMATES_URL = `${environment.apiBaseUrl}/api/estimates`;

/**
 * Estimate persistence client. Thin like OrderService: no local state, no
 * side effects — callers own the UI state. Every call carries
 * `Authorization: Bearer` from the existing AuthService token; there is no
 * second auth system. POST sends only room dimensions: user, area, rate,
 * amount and timestamps all derive server-side.
 */
@Injectable({ providedIn: 'root' })
export class EstimateService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** POST /api/estimates — body intentionally carries only dimensions. */
  createEstimate(width: number, length: number): Observable<EstimateDto> {
    return this.http.post<EstimateDto>(ESTIMATES_URL, { width, length }, { headers: this.authHeaders() });
  }

  /** GET /api/estimates — newest first, current user only (server-scoped). */
  getEstimates(): Observable<EstimateSummaryDto[]> {
    return this.http.get<EstimateSummaryDto[]>(ESTIMATES_URL, { headers: this.authHeaders() });
  }

  /** GET /api/estimates/{id} — 404 unless it belongs to the current user. */
  getEstimate(id: string): Observable<EstimateDto> {
    return this.http.get<EstimateDto>(`${ESTIMATES_URL}/${id}`, { headers: this.authHeaders() });
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.token();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
