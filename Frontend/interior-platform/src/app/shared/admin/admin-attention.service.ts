import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../auth.service';
import { LEAD_STATUS_NEW } from '../../leads/lead.service';

/** Order status 0 is Pending: the order has been placed and nobody has acted on it. */
const ORDER_STATUS_PENDING = 0;

/**
 * The small "needs attention" counts shown as badges in the Admin sidebar.
 *
 * It makes no request of its own. The dashboard and the Orders, Proposals and
 * Leads pages already load these lists, and they report the rows here after
 * every load or change, so a badge always matches what the Admin has just
 * seen. A count is null until a page has reported it, and a badge shows only
 * a known, non-zero count (never a made-up zero). Everything is cleared when
 * the Admin session ends, so the next session starts without them.
 */
@Injectable({ providedIn: 'root' })
export class AdminAttentionService {
  private readonly auth = inject(AuthService);

  readonly pendingOrders = signal<number | null>(null);
  readonly newLeads = signal<number | null>(null);
  readonly pendingPayments = signal<number | null>(null);

  constructor() {
    effect(() => {
      if (!this.auth.isAdmin()) this.reset();
    });
  }

  reportOrders(rows: readonly { status: number }[]): void {
    this.pendingOrders.set(rows.filter((r) => r.status === ORDER_STATUS_PENDING).length);
  }

  reportLeads(rows: readonly { status: number }[]): void {
    this.newLeads.set(rows.filter((r) => r.status === LEAD_STATUS_NEW).length);
  }

  /** Proposals with a payment attempt that is not verified: the customer started paying and it is not confirmed. */
  reportProposals(rows: readonly { isPaymentVerified: boolean; paymentAttemptCount: number }[]): void {
    this.pendingPayments.set(rows.filter((r) => !r.isPaymentVerified && r.paymentAttemptCount > 0).length);
  }

  reset(): void {
    this.pendingOrders.set(null);
    this.newLeads.set(null);
    this.pendingPayments.set(null);
  }
}
