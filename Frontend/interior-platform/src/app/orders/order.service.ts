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

/** Delivery details stored on an order (null on orders placed before checkout collected them). */
export interface DeliveryDetailsDto {
  fullName: string;
  /** The 10 digit mobile number. */
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  deliveryNotes: string | null;
}

/**
 * The delivery form sent with POST /api/orders. Exactly these 8 fields and nothing
 * else: the server takes the user, products, prices and status from its own records.
 */
export interface CreateOrderRequest {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  deliveryNotes: string;
}

/** Backend order detail (GET /api/orders/{id}, POST /api/orders). */
export interface OrderDetailDto {
  id: string;
  /** Enum number: 0 Pending, 1 Confirmed, 2 Processing, 3 Completed, 4 Cancelled. */
  status: number;
  createdAt: string;
  updatedAt: string;
  subtotal: number;
  /** Where the order is going; absent or null for orders placed before checkout collected it. */
  delivery?: DeliveryDetailsDto | null;
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

/** Backend admin order list row (GET /api/admin/orders). */
export interface AdminOrderSummaryDto {
  id: string;
  userId: string;
  customerEmail: string | null;
  status: number;
  createdAt: string;
  subtotal: number;
  itemCount: number;
}

/** Backend admin order detail (GET /api/admin/orders/{id}). */
export interface AdminOrderDetailDto {
  id: string;
  userId: string;
  customerEmail: string | null;
  status: number;
  createdAt: string;
  updatedAt: string;
  subtotal: number;
  /** Statuses the server allows this order to move to next (empty when final). */
  allowedNextStatuses?: number[];
  /** Where the order is going; absent or null for orders placed before checkout collected it. */
  delivery?: DeliveryDetailsDto | null;
  items: OrderItemDto[];
}

const ORDERS_URL = `${environment.apiBaseUrl}/api/orders`;

const ADMIN_ORDERS_URL = `${environment.apiBaseUrl}/api/admin/orders`;

const ORDER_STATUS_LABELS = ['Pending', 'Confirmed', 'Processing', 'Completed', 'Cancelled'];

/** Human label for a backend order status number. */
export function orderStatusLabel(status: number): string {
  return ORDER_STATUS_LABELS[status] ?? 'Unknown';
}

/**
 * Order API client. Thin like ProductService: no local state, no side
 * effects — callers own the UI state. Every call carries `Authorization:
 * Bearer` from the existing AuthService token; there is no second auth
 * system. POST sends only the delivery form: user, products, prices, totals and
 * status all derive server-side from the authenticated user's cart.
 */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** POST /api/orders — body carries the delivery details only, never pricing or user data. */
  createOrder(delivery: CreateOrderRequest): Observable<OrderDetailDto> {
    return this.http.post<OrderDetailDto>(ORDERS_URL, delivery, { headers: this.authHeaders() });
  }

  /** GET /api/orders — newest first, current user only (server-scoped). */
  getOrders(): Observable<OrderSummaryDto[]> {
    return this.http.get<OrderSummaryDto[]>(ORDERS_URL, { headers: this.authHeaders() });
  }

  /** GET /api/orders/{id} — 404 unless it belongs to the current user. */
  getOrder(id: string): Observable<OrderDetailDto> {
    return this.http.get<OrderDetailDto>(`${ORDERS_URL}/${id}`, { headers: this.authHeaders() });
  }

  /** GET /api/admin/orders — Admin only, every order newest first. Bearer auth. */
  getAdminOrders(): Observable<AdminOrderSummaryDto[]> {
    return this.http.get<AdminOrderSummaryDto[]>(ADMIN_ORDERS_URL, { headers: this.authHeaders() });
  }

  /** GET /api/admin/orders/{id} — Admin only, any owner. Bearer auth. */
  getAdminOrder(id: string): Observable<AdminOrderDetailDto> {
    return this.http.get<AdminOrderDetailDto>(`${ADMIN_ORDERS_URL}/${id}`, { headers: this.authHeaders() });
  }

  /**
   * PATCH /api/admin/orders/{id}/status — Admin only. Sends just the new status
   * number; the server decides whether the move is legal and answers with the
   * updated order (409 for an illegal move).
   */
  updateAdminOrderStatus(id: string, status: number): Observable<AdminOrderDetailDto> {
    return this.http.patch<AdminOrderDetailDto>(
      `${ADMIN_ORDERS_URL}/${id}/status`,
      { status },
      { headers: this.authHeaders() }
    );
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.token();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
