import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth.service';

/** One backend proposal line (name/price snapshotted at proposal time). */
export interface ProposalItemDto {
  id: string;
  /** Catalogue slug for legacy lines; null for visualizer furniture lines. */
  productId: string | null;
  /** Visualizer furniture key (e.g. "sofa"); null for legacy catalogue lines. */
  furnitureType?: string | null;
  widthFt?: number | null;
  lengthFt?: number | null;
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
  /**
   * Read-only availability derived server-side: true only when the proposal
   * has a verified token payment. The PDF endpoint enforces the same rule
   * independently — this flag is a display hint, never an authorization.
   */
  isPaymentVerified: boolean;
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

/** Backend token-payment order (POST /api/proposals/{id}/payment). */
export interface CreateProposalPaymentResponse {
  paymentId: string;
  proposalId: string;
  provider: string;
  providerOrderId: string;
  /** Token amount in major currency units, determined by the backend. */
  amount: number;
  currency: string;
  /** Public Key ID for Razorpay Checkout (never a secret). */
  providerKeyId: string;
}

/** Backend verification request (POST /api/payments/verify). */
export interface VerifyProposalPaymentRequest {
  paymentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/** Backend verification outcome (POST /api/payments/verify). */
export interface VerifyProposalPaymentResponse {
  paymentId: string;
  proposalId: string;
  /** Enum number: 0 Created, 1 Verified, 2 Failed. */
  status: number;
  verifiedAt: string | null;
}

/** Backend payment statuses for token payments. */
export const ProposalPaymentStatus = {
  Created: 0,
  Verified: 1,
  Failed: 2,
} as const;

const PROPOSAL_PAYMENT_STATUS_LABELS = ['Payment Pending', 'Token Payment Verified', 'Payment Failed'];

/** Human label for a backend token-payment status number. */
export function proposalPaymentStatusLabel(status: number): string {
  return PROPOSAL_PAYMENT_STATUS_LABELS[status] ?? 'Unknown';
}

/** One persisted token payment attempt (GET /api/admin/proposals/{id}). */
export interface AdminProposalPaymentDto {
  id: string;
  status: number;
  provider: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amount: number;
  currency: string;
  createdAt: string;
  verifiedAt: string | null;
}

/** Backend admin proposal list row (GET /api/admin/proposals). */
export interface AdminProposalSummaryDto {
  id: string;
  userId: string;
  customerEmail: string | null;
  estimateId: string;
  area: number;
  ratePerSquareFoot: number;
  estimatedAmount: number;
  status: number;
  createdAt: string;
  isPaymentVerified: boolean;
  paymentAttemptCount: number;
}

/** Backend admin proposal detail (GET /api/admin/proposals/{id}). */
export interface AdminProposalDetailDto {
  id: string;
  userId: string;
  customerEmail: string | null;
  estimateId: string;
  width: number;
  length: number;
  area: number;
  ratePerSquareFoot: number;
  estimatedAmount: number;
  status: number;
  createdAt: string;
  isPaymentVerified: boolean;
  items: ProposalItemDto[];
  payments: AdminProposalPaymentDto[];
}

const PROPOSALS_URL = `${environment.apiBaseUrl}/api/proposals`;

const ADMIN_PROPOSALS_URL = `${environment.apiBaseUrl}/api/admin/proposals`;

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

  /**
   * GET /api/proposals/{id}/pdf — the server-rendered proposal document as a
   * PDF blob. The bytes come entirely from the persisted proposal snapshot;
   * no product, estimate or profile data is consulted client-side.
   */
  downloadProposalPdf(id: string): Observable<Blob> {
    return this.http.get(`${PROPOSALS_URL}/${id}/pdf`, { headers: this.authHeaders(), responseType: 'blob' });
  }

  /**
   * POST /api/proposals/{id}/payment — create (or reuse) the backend token
   * payment order. The body intentionally carries no amount: the backend
   * determines the token amount from its own configuration.
   */
  createProposalPayment(proposalId: string): Observable<CreateProposalPaymentResponse> {
    return this.http.post<CreateProposalPaymentResponse>(
      `${PROPOSALS_URL}/${proposalId}/payment`, {}, { headers: this.authHeaders() });
  }

  /**
   * POST /api/payments/verify — ask the backend to verify a Checkout result.
   * Sends only the Razorpay values plus the local payment id; the backend
   * response is the sole authority on whether payment succeeded.
   */
  verifyProposalPayment(request: VerifyProposalPaymentRequest): Observable<VerifyProposalPaymentResponse> {
    return this.http.post<VerifyProposalPaymentResponse>(
      `${environment.apiBaseUrl}/api/payments/verify`, request, { headers: this.authHeaders() });
  }

  /** GET /api/admin/proposals — Admin only, every proposal newest first. Bearer auth. */
  getAdminProposals(): Observable<AdminProposalSummaryDto[]> {
    return this.http.get<AdminProposalSummaryDto[]>(ADMIN_PROPOSALS_URL, { headers: this.authHeaders() });
  }

  /** GET /api/admin/proposals/{id} — Admin only, any owner. Bearer auth. */
  getAdminProposal(id: string): Observable<AdminProposalDetailDto> {
    return this.http.get<AdminProposalDetailDto>(`${ADMIN_PROPOSALS_URL}/${id}`, { headers: this.authHeaders() });
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.token();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
