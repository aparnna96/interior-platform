import { Component, DestroyRef, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import type { Observable } from 'rxjs';
import { AuthService } from '../auth.service';
import type { AppView } from '../app-paths';
import { OrderService, orderStatusLabel, type AdminOrderSummaryDto } from '../orders/order.service';
import { LeadService, LEAD_STATUS_NEW, leadStatusLabel, type LeadResponse } from '../leads/lead.service';
import { ProposalService, type AdminProposalSummaryDto } from '../proposal/proposal.service';
import { ProductService } from '../catalogue/product.service';
import { AdminEstimateRateService, type AdminEstimateRateDto } from '../estimate/estimate-rate.service';

/** One shortcut on the dashboard: the page it opens and what that page is for. */
interface QuickAction {
  readonly view: AppView;
  readonly label: string;
  readonly description: string;
}

/** The five summary metrics. Each loads, fails and retries on its own. */
type MetricKey = 'orders' | 'leads' | 'proposals' | 'products' | 'rate';
const METRIC_KEYS: readonly MetricKey[] = ['orders', 'leads', 'proposals', 'products', 'rate'];

type MetricStatus = 'loading' | 'ready' | 'error';

/** `value` is null until ready; for the rate it stays null when no rate is active. */
interface MetricState {
  readonly status: MetricStatus;
  readonly value: number | null;
}

const LOADING: MetricState = { status: 'loading', value: null };
const INITIAL: Record<MetricKey, MetricState> = {
  orders: LOADING,
  leads: LOADING,
  proposals: LOADING,
  products: LOADING,
  rate: LOADING,
};

/** What one summary card renders. */
interface SummaryCard {
  readonly key: MetricKey;
  readonly label: string;
  readonly status: MetricStatus;
  readonly display: string;
  readonly caption: string;
  readonly unavailable: boolean;
}

/**
 * What one request yields: the number its summary card shows and, for the
 * three list endpoints, a step that keeps the rows for the Recent activity
 * block. The step runs only if the session that asked is still the current one.
 */
interface Loaded {
  readonly value: number | null;
  readonly apply?: () => void;
}

/** Recent activity: how many rows each block shows. */
const RECENT_LIMIT = 5;

/** The three Recent activity blocks. Each reads the list its summary card already fetched. */
type RecentKey = 'orders' | 'leads' | 'proposals';

/** One compact row. Built only from fields the existing list APIs already return. */
interface RecentRow {
  readonly id: string;
  readonly title: string;
  readonly detail: string | null;
  readonly when: string;
  readonly pill: string;
  readonly amount: string | null;
}

interface RecentBlock {
  readonly key: RecentKey;
  readonly title: string;
  readonly emptyText: string;
  readonly status: MetricStatus;
  readonly rows: readonly RecentRow[];
}

/**
 * The rate of the one active row, or null. A missing, zero or non-numeric
 * rate is "unavailable": the dashboard never shows ₹0 or invents a number.
 */
function activeRate(rows: readonly AdminEstimateRateDto[]): number | null {
  const rate = rows.find((r) => r.isActive)?.ratePerSquareFoot;
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** Milliseconds for sorting; an unreadable date sorts as the oldest. */
function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * The newest rows first, at most RECENT_LIMIT of them. The lists already
 * arrive newest-first, but this does not rely on it. Equal times keep the
 * server's order (Array.prototype.sort is stable).
 */
function newest<T>(rows: readonly T[], createdAt: (row: T) => string): T[] {
  return [...rows].sort((a, b) => timeOf(createdAt(b)) - timeOf(createdAt(a))).slice(0, RECENT_LIMIT);
}

/** "8 Oct 2026, 3:19 pm" - safe for any input (an unreadable date shows nothing). */
function whenText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function rupees(n: number | null | undefined): string | null {
  return typeof n === 'number' && Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : null;
}

/** Short recognizable identifier, as on the Orders and Proposals pages. */
function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** The same wording the Manage proposals list uses for payment state (display only). */
function proposalPaymentLabel(p: AdminProposalSummaryDto): string {
  if (p.isPaymentVerified) return 'Token Payment Verified';
  if (p.paymentAttemptCount > 0) return 'Payment Pending';
  return 'No Payment Attempt';
}

/**
 * Admin back-office landing page at /admin.
 *
 * Stage 1: an Admin-only page with quick actions to the existing workspaces.
 * Stage 2: five summary cards fed by the existing Admin APIs.
 * Stage 3 (this file): Recent activity - the latest 5 orders, leads and
 * proposals - between the summary and the quick actions.
 *
 * One request per endpoint, no more: the orders, leads and proposals answers
 * feed both the count card and the matching recent block, so the dashboard
 * still makes exactly five requests. Everything loads independently, so one
 * failing endpoint never blanks the others; Retry on a card or a block
 * re-requests only that endpoint (and refreshes both places that show it).
 * Nothing shows a number or a row until its response arrives (no fake zeros,
 * no premature "No orders yet"). The rate card shows the active row of the
 * Rate Master, or "Unavailable" - never a hardcoded fallback.
 *
 * The route guard keeps other roles out of /admin and this component repeats
 * the check (like the other admin pages): a non-Admin session makes no
 * dashboard requests and sees a login or access-denied state. A 401 reuses
 * the existing session handling (log out), and a late answer from a session
 * that has since ended is ignored. The backend remains the real
 * authorization boundary.
 *
 * Navigation is reported to the shell through the `navigate` output so the
 * address bar and the page stay in step in one place.
 */
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css',
})
export class AdminDashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly orders = inject(OrderService);
  private readonly leads = inject(LeadService);
  private readonly proposals = inject(ProposalService);
  private readonly products = inject(ProductService);
  private readonly rates = inject(AdminEstimateRateService);
  private readonly destroyRef = inject(DestroyRef);

  /** Admin-only gate; anyone else never sees a shortcut or a number. */
  readonly canAccess = computed(() => this.auth.isAdmin());
  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());

  /** Asks the shell to open another page. */
  readonly navigate = output<AppView>();

  readonly actions: readonly QuickAction[] = [
    {
      view: 'admin-products',
      label: 'Manage products',
      description: 'Add, edit and deactivate catalogue products.',
    },
    {
      view: 'admin-orders',
      label: 'Manage orders',
      description: 'Review customer orders, delivery details and status.',
    },
    {
      view: 'admin-proposals',
      label: 'Manage proposals',
      description: 'See proposals, their token payments and the PDF.',
    },
    {
      view: 'admin-rates',
      label: 'Estimate rate',
      description: 'Set the ₹ per sq.ft. rate used for new estimates.',
    },
    {
      view: 'leads',
      label: 'Leads',
      description: 'Follow up website enquiries and update their status.',
    },
  ];

  private readonly metrics = signal<Record<MetricKey, MetricState>>(INITIAL);

  /** The rows behind the Recent activity blocks; null until that endpoint has answered. */
  private readonly orderRows = signal<readonly AdminOrderSummaryDto[] | null>(null);
  private readonly leadRows = signal<readonly LeadResponse[] | null>(null);
  private readonly proposalRows = signal<readonly AdminProposalSummaryDto[] | null>(null);

  /** The five cards in display order, ready to render. */
  readonly cards = computed<readonly SummaryCard[]>(() => {
    const m = this.metrics();
    return [
      this.countCard('orders', 'Orders', 'All customer orders', m.orders),
      this.countCard('leads', 'New leads', 'Status: New', m.leads),
      this.countCard('proposals', 'Proposals', 'All proposals', m.proposals),
      this.countCard('products', 'Products', 'Active and inactive', m.products),
      this.rateCard(m.rate),
    ];
  });

  /** The three Recent activity blocks, each with its own status and at most 5 rows. */
  readonly recent = computed<readonly RecentBlock[]>(() => {
    const m = this.metrics();
    return [
      this.recentBlock(
        'orders', 'Recent orders', 'No orders yet.', m.orders.status, this.orderRows(),
        (o) => o.createdAt,
        (o) => ({
          id: o.id,
          title: `Order ${shortId(o.id)}`,
          detail: o.customerEmail || null,
          when: whenText(o.createdAt),
          pill: orderStatusLabel(o.status),
          amount: rupees(o.subtotal),
        })
      ),
      this.recentBlock(
        'leads', 'Recent leads', 'No leads yet.', m.leads.status, this.leadRows(),
        (l) => l.createdAt,
        (l) => ({
          id: l.id,
          title: l.name,
          detail: [l.phone, l.email].filter((v) => !!v).join(' · ') || null,
          when: whenText(l.createdAt),
          pill: leadStatusLabel(l.status),
          amount: null,
        })
      ),
      this.recentBlock(
        'proposals', 'Recent proposals', 'No proposals yet.', m.proposals.status, this.proposalRows(),
        (p) => p.createdAt,
        (p) => ({
          id: p.id,
          title: `Proposal ${shortId(p.id)}`,
          detail: p.customerEmail || null,
          when: whenText(p.createdAt),
          pill: proposalPaymentLabel(p),
          amount: rupees(p.estimatedAmount),
        })
      ),
    ];
  });

  /** One existing Admin API per metric, reduced to the number the card shows. */
  private readonly sources: Record<MetricKey, () => Observable<Loaded>> = {
    orders: () =>
      this.orders.getAdminOrders().pipe(
        map((rows) => {
          const list = rows ?? [];
          return { value: list.length, apply: () => this.orderRows.set(list) };
        })
      ),
    leads: () =>
      this.leads.getLeads().pipe(
        map((rows) => {
          const list = rows ?? [];
          return {
            value: list.filter((l) => l.status === LEAD_STATUS_NEW).length,
            apply: () => this.leadRows.set(list),
          };
        })
      ),
    proposals: () =>
      this.proposals.getAdminProposals().pipe(
        map((rows) => {
          const list = rows ?? [];
          return { value: list.length, apply: () => this.proposalRows.set(list) };
        })
      ),
    products: () => this.products.getAdminProducts().pipe(map((rows) => ({ value: (rows ?? []).length }))),
    rate: () => this.rates.getRates().pipe(map((rows) => ({ value: activeRate(rows ?? []) }))),
  };

  /** Metrics with a request in flight: a repeated call never doubles a request. */
  private readonly inFlight = new Set<MetricKey>();

  /** Bumped on logout so a late response from an old session is ignored. */
  private generation = 0;

  /** True once this session's five requests were issued, so they are never issued twice. */
  private started = false;

  constructor() {
    if (this.auth.isAdmin()) {
      this.start();
    }
    effect(() => {
      const admin = this.auth.isAdmin();
      untracked(() => (admin ? this.start() : this.reset()));
    });
  }

  /** Opens one of the shortcuts. A no-op for anyone who is not an Admin. */
  open(view: AppView): void {
    if (!this.auth.isAdmin()) return;
    this.navigate.emit(view);
  }

  /** Re-requests one failed endpoint only; the other four are left alone. */
  retry(key: MetricKey): void {
    if (this.metrics()[key].status !== 'error') return;
    this.load(key);
  }

  /** Issues the five independent requests once per Admin session. */
  private start(): void {
    if (this.started) return;
    this.started = true;
    for (const key of METRIC_KEYS) {
      this.load(key);
    }
  }

  private load(key: MetricKey): void {
    if (!this.auth.isAdmin() || this.inFlight.has(key)) return;
    this.inFlight.add(key);
    this.setMetric(key, LOADING);
    const generation = this.generation;
    this.sources[key]()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => this.finish(key, generation, { status: 'ready', value: result.value }, result.apply),
        error: (err: unknown) => {
          if ((err as { status?: number })?.status === 401) {
            // Same as every other admin page: an expired session ends here.
            this.auth.logout();
          }
          this.finish(key, generation, { status: 'error', value: null });
        },
      });
  }

  private finish(key: MetricKey, generation: number, state: MetricState, apply?: () => void): void {
    if (generation !== this.generation) return;
    this.inFlight.delete(key);
    apply?.();
    this.setMetric(key, state);
  }

  private setMetric(key: MetricKey, state: MetricState): void {
    this.metrics.update((m) => ({ ...m, [key]: state }));
  }

  /** Back to the empty loading state, never leaving one session's numbers or rows for the next. */
  private reset(): void {
    this.started = false;
    this.generation++;
    this.inFlight.clear();
    this.metrics.set(INITIAL);
    this.orderRows.set(null);
    this.leadRows.set(null);
    this.proposalRows.set(null);
  }

  private recentBlock<T>(
    key: RecentKey,
    title: string,
    emptyText: string,
    status: MetricStatus,
    rows: readonly T[] | null,
    createdAt: (row: T) => string,
    toRow: (row: T) => RecentRow
  ): RecentBlock {
    // Rows are shown only for a settled, successful response - never while loading or after a failure.
    const shown = status === 'ready' && rows !== null ? newest(rows, createdAt).map(toRow) : [];
    return { key, title, emptyText, status, rows: shown };
  }

  private countCard(key: MetricKey, label: string, caption: string, state: MetricState): SummaryCard {
    const display = state.status === 'ready' && state.value !== null ? state.value.toLocaleString('en-IN') : '';
    return { key, label, status: state.status, display, caption, unavailable: false };
  }

  private rateCard(state: MetricState): SummaryCard {
    const base = { key: 'rate' as const, label: 'Current rate' };
    if (state.status !== 'ready') {
      return { ...base, status: state.status, display: '', caption: 'per sq.ft.', unavailable: false };
    }
    if (state.value === null) {
      return { ...base, status: 'ready', display: 'Unavailable', caption: 'No active rate is set', unavailable: true };
    }
    return {
      ...base,
      status: 'ready',
      display: `₹${state.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
      caption: 'per sq.ft.',
      unavailable: false,
    };
  }
}
