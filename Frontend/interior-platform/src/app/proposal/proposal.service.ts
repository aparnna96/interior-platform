import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth.service';

/** One backend proposal line (name/price snapshotted at proposal time). */
export interface ProposalItemDto {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

/** Backend proposal detail (GET /api/proposals/{id}, POST /api/proposals). */
export interface ProposalDetailDto {
  id: string;
  estimateId: string;
  /** Enum number: 0 Draft (the only v1 status). */
  status: number;
  createdAt: string;
  width: number;
  length: number;
  area: number;
  ratePerSquareFoot: number;
  estimatedAmount: number;
  items: ProposalItemDto[];
}

/** Backend proposal list row (GET /api/proposals). */
export interface ProposalSummaryDto {
  id: string;
  estimateId: string;
  status: number;
  createdAt: string;
  area: number;
  estimatedAmount: number;
}

const PROPOSALS_URL = `${environment.apiBaseUrl}/api/proposals`;

const PROPOSAL_STATUS_LABELS = ['Draft'];

/** Human label for a backend proposal status number. */
export function proposalStatusLabel(status: number): string {
  return PROPOSAL_STATUS_LABELS[status] ?? 'Unknown';
}

/**
 * Proposal API client. Thin like OrderService: no local state, no side
 * effects — callers own the UI state. Every call carries `Authorization:
 * Bearer` from the existing AuthService token; there is no second auth
 * system. POST sends only the source estimate id: user, dimensions, prices,
 * names, totals, status and timestamps all derive server-side as snapshots.
 */
@Injectable({ providedIn: 'root' })
export class ProposalService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** POST /api/proposals — body intentionally carries only the estimate id. */
  createProposal(estimateId: string): Observable<ProposalDetailDto> {
    return this.http.post<ProposalDetailDto>(PROPOSALS_URL, { estimateId }, { headers: this.authHeaders() });
  }

  /** GET /api/proposals — newest first, current user only (server-scoped). */
  getProposals(): Observable<ProposalSummaryDto[]> {
    return this.http.get<ProposalSummaryDto[]>(PROPOSALS_URL, { headers: this.authHeaders() });
  }

  /** GET /api/proposals/{id} — 404 unless it belongs to the current user. */
  getProposal(id: string): Observable<ProposalDetailDto> {
    return this.http.get<ProposalDetailDto>(`${PROPOSALS_URL}/${id}`, { headers: this.authHeaders() });
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.token();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
