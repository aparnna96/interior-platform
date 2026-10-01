import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth.service';

/** One backend order line (snapshot name/price at order time). */
export interface OrderItemDto {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

/** Backend order detail (GET /api/orders/{id}, POST /api/orders). */
export interface OrderDetailDto {
  id: string;
  /** Enum number: 0 Pending, 1 Confirmed, 2 Processing, 3 Completed, 4 Cancelled. */
  status: number;
  createdAt: string;
  updatedAt: string;
  subtotal: number;
  items: OrderItemDto[];
}

/** Backend order list row (GET /api/orders). */
export interface OrderSummaryDto {
  id: string;
  status: number;
  createdAt: string;
  subtotal: number;
  itemCount: number;
}

const ORDERS_URL = `${environment.apiBaseUrl}/api/orders`;

const ORDER_STATUS_LABELS = ['Pending', 'Confirmed', 'Processing', 'Completed', 'Cancelled'];

/** Human label for a backend order status number. */
export function orderStatusLabel(status: number): string {
  return ORDER_STATUS_LABELS[status] ?? 'Unknown';
}

/**
 * Order API client. Thin like ProductService: no local state, no side
 * effects — callers own the UI state. Every call carries `Authorization:
 * Bearer` from the existing AuthService token; there is no second auth
 * system. POST sends an empty object: user, products, prices, totals and
 * status all derive server-side from the authenticated user's cart.
 */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** POST /api/orders — body intentionally carries no pricing/user data. */
  createOrder(): Observable<OrderDetailDto> {
    return this.http.post<OrderDetailDto>(ORDERS_URL, {}, { headers: this.authHeaders() });
  }

  /** GET /api/orders — newest first, current user only (server-scoped). */
  getOrders(): Observable<OrderSummaryDto[]> {
    return this.http.get<OrderSummaryDto[]>(ORDERS_URL, { headers: this.authHeaders() });
  }

  /** GET /api/orders/{id} — 404 unless it belongs to the current user. */
  getOrder(id: string): Observable<OrderDetailDto> {
    return this.http.get<OrderDetailDto>(`${ORDERS_URL}/${id}`, { headers: this.authHeaders() });
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.token();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
