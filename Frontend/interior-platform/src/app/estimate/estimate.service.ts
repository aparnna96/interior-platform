import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth.service';

/** One visualizer furniture line saved with an estimate (server-resolved). */
export interface EstimateItemDto {
  furnitureType: string;
  name: string;
  widthFt: number;
  lengthFt: number;
  quantity: number;
}

/** Furniture line sent on save: a type key and a quantity only. */
export interface EstimateItemRequest {
  furnitureType: string;
  quantity: number;
}

/** Backend estimate shape (POST responses, GET detail). */
export interface EstimateDto {
  id: string;
  width: number;
  length: number;
  area: number;
  ratePerSquareFoot: number;
  estimatedAmount: number;
  createdAt: string;
  /** Visualizer furniture saved with the estimate (may be empty). */
  items?: EstimateItemDto[];
}

/** Backend estimate list row (GET /api/estimates). Same fields for now. */
export type EstimateSummaryDto = EstimateDto;

const ESTIMATES_URL = `${environment.apiBaseUrl}/api/estimates`;

/**
 * Estimate persistence client. Thin like OrderService: no local state, no
 * side effects — callers own the UI state. Every call carries
 * `Authorization: Bearer` from the existing AuthService token; there is no
 * second auth system. POST sends room dimensions plus furniture type/qty: user, area, rate,
 * amount and timestamps all derive server-side.
 */
@Injectable({ providedIn: 'root' })
export class EstimateService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /**
   * POST /api/estimates — the body carries dimensions and the visualizer
   * furniture as type + quantity only; names, sizes, money, ownership and
   * timestamps all derive server-side.
   */
  createEstimate(width: number, length: number, items: EstimateItemRequest[] = []): Observable<EstimateDto> {
    return this.http.post<EstimateDto>(ESTIMATES_URL, { width, length, items }, { headers: this.authHeaders() });
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
