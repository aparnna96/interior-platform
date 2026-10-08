import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders, type HttpResponse } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth.service';

/** GET /api/estimate-rate — the rate new estimates use (public, no user data). */
export interface EstimateRateDto {
  ratePerSquareFoot: number;
  updatedAt: string;
}

/** One row of the Admin rate history (GET /api/admin/estimate-rates). */
export interface AdminEstimateRateDto {
  id: string;
  ratePerSquareFoot: number;
  isActive: boolean;
  createdAt: string;
  /** Email of the Admin who set the rate; null for the rate seeded at startup. */
  createdByEmail: string | null;
}

/** Largest rate the server accepts (₹ per sq.ft.). Mirrors the API rule. */
export const MAX_ESTIMATE_RATE = 100000;

export type EstimateRateStatus = 'idle' | 'loading' | 'ready' | 'error';

const RATE_URL = `${environment.apiBaseUrl}/api/estimate-rate`;
const ADMIN_RATES_URL = `${environment.apiBaseUrl}/api/admin/estimate-rates`;

function isUsableRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * The Admin-managed rate, for the on-screen estimate preview only. The
 * server computes every saved estimate from its own copy of the rate, so
 * this value can only affect what is displayed, never what is stored.
 *
 * There is deliberately no built-in fallback: until the rate has loaded (or
 * when it cannot be loaded) `rate()` is null and the UI shows a dash instead
 * of a made-up number.
 */
@Injectable({ providedIn: 'root' })
export class EstimateRateService {
  private readonly http = inject(HttpClient);

  private readonly rateState = signal<number | null>(null);
  private readonly statusState = signal<EstimateRateStatus>('idle');

  /** ₹ per sq.ft., or null until the first successful load. */
  readonly rate = this.rateState.asReadonly();
  readonly status = this.statusState.asReadonly();

  /**
   * GET the active rate. Public, so it works for logged-out visitors. A
   * request already in flight is not repeated. Failures never throw: the
   * status becomes 'error' and any rate loaded earlier is kept.
   */
  load(): void {
    if (this.statusState() === 'loading') return;
    this.statusState.set('loading');
    this.http.get<EstimateRateDto>(RATE_URL).subscribe({
      next: (dto) => {
        if (isUsableRate(dto?.ratePerSquareFoot)) {
          this.rateState.set(dto.ratePerSquareFoot);
          this.statusState.set('ready');
        } else {
          this.statusState.set('error');
        }
      },
      error: () => this.statusState.set('error'),
    });
  }

  /**
   * Takes the rate from a server-created estimate: it is the rate the server
   * actually used, so it is at least as fresh as anything shown on screen.
   */
  adopt(rate: number): void {
    if (!isUsableRate(rate)) return;
    this.rateState.set(rate);
    this.statusState.set('ready');
  }
}

/**
 * Admin-only Rate Master client (GET history, POST a new rate). Every call
 * carries the Bearer token; the backend remains the authorization boundary.
 * POST sends the rate and nothing else: the id, active flag, timestamp and
 * the acting Admin all derive server-side.
 */
@Injectable({ providedIn: 'root' })
export class AdminEstimateRateService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** GET /api/admin/estimate-rates — the active rate and history, newest first. */
  getRates(): Observable<AdminEstimateRateDto[]> {
    return this.http.get<AdminEstimateRateDto[]>(ADMIN_RATES_URL, { headers: this.authHeaders() });
  }

  /**
   * POST /api/admin/estimate-rates. The full response is returned so the
   * caller can tell 201 (new rate recorded) from 200 (already the active rate).
   */
  setRate(ratePerSquareFoot: number): Observable<HttpResponse<AdminEstimateRateDto>> {
    return this.http.post<AdminEstimateRateDto>(
      ADMIN_RATES_URL,
      { ratePerSquareFoot },
      { headers: this.authHeaders(), observe: 'response' }
    );
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.token();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
