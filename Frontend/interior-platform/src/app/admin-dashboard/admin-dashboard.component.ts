import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import type { Observable } from 'rxjs';
import { AuthService } from '../auth.service';
import type { AppView } from '../app-paths';
import { OrderService, orderStatusLabel, type AdminOrderSummaryDto } from '../orders/order.service';
import {
  LeadService,
  LEAD_STATUS_CLOSED,
  LEAD_STATUS_IN_PROGRESS,
  LEAD_STATUS_NEW,
  leadStatusLabel,
  type LeadResponse,
} from '../leads/lead.service';
import { ProposalService, type AdminProposalSummaryDto } from '../proposal/proposal.service';
import { ProductService, type AdminProductDto } from '../catalogue/product.service';
import { AdminEstimateRateService, type AdminEstimateRateDto } from '../estimate/estimate-rate.service';
import { AdminAttentionService } from '../shared/admin/admin-attention.service';
import { BadgeComponent, leadTone, orderTone, proposalPaymentTone, type Tone } from '../shared/admin/badge.component';
import { BarChartComponent } from '../shared/admin/charts/bar-chart.component';
import { DonutChartComponent } from '../shared/admin/charts/donut-chart.component';
import { LineChartComponent } from '../shared/admin/charts/line-chart.component';
import { ORDER_STATUS_COLORS, compactRupees, type ChartDatum } from '../shared/admin/charts/chart-utils';
import { AdminStateComponent } from '../shared/admin/admin-state.component';

/** The five loaded metrics. Each loads, fails and retries on its own. */
type MetricKey = 'orders' | 'leads' | 'proposals' | 'products' | 'rate';
const METRIC_KEYS: readonly MetricKey[] = ['orders', 'leads', 'proposals', 'products', 'rate'];

/** The six cards: the five metrics plus order value, which is worked out from the orders answer. */
type CardKey = MetricKey | 'value';

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
  readonly key: CardKey;
  readonly label: string;
  readonly status: MetricStatus;
  readonly display: string;
  readonly caption: string;
  readonly unavailable: boolean;
}

/**
 * What one request yields: the number its summary card shows and, for the
 * list endpoints, a step that keeps the rows for the charts and the Recent
 * activity block. The step runs only if the session that asked is still the
 * current one.
 */
interface Loaded {
  readonly value: number | null;
  readonly apply?: () => void;
}

/** Recent activity: how many rows each block shows. */
const RECENT_LIMIT = 5;

/** How many days the trend charts cover. */
const TREND_DAYS = 14;

/** Order status 4 is Cancelled: it does not count towards order value. */
const ORDER_STATUS_CANCELLED = 4;

/** The three Recent activity blocks. Each reads the list its summary card already fetched. */
type RecentKey = 'orders' | 'leads' | 'proposals';

/** One compact row. Built only from fields the existing list APIs already return. */
interface RecentRow {
  readonly id: string;
  readonly title: string;
  readonly detail: string | null;
  readonly when: string;
  readonly pill: string;
  readonly tone: Tone;
  readonly amount: string | null;
}

interface RecentBlock {
  readonly key: RecentKey;
  readonly title: string;
  readonly emptyText: string;
  readonly status: MetricStatus;
  readonly rows: readonly RecentRow[];
}

/** One line in "Needs attention": what is waiting and where to deal with it. */
interface AttentionItem {
  readonly view: AppView;
  readonly label: string;
  readonly detail: string;
  readonly tone: Tone;
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

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
}

/** Local calendar day as "2026-10-8" - the bucket key for the trend charts. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Admin back-office landing page at /admin.
 *
 * Six summary cards, four charts, a "Needs attention" list and Recent
 * activity - all drawn from the existing Admin APIs, with no new endpoint.
 * One request per endpoint, no more: the orders, leads and proposals
 * answers feed the count card, the charts and the matching recent block, so
 * the dashboard makes exactly five requests (six cards share them).
 * Everything loads independently, so one failing endpoint never blanks the
 * others; Retry on a card, chart or block re-requests only that endpoint.
 * "Refresh" re-requests all five and keeps the old numbers on screen until
 * the new ones arrive. Nothing shows a number or a row until its response
 * arrives (no fake zeros, no premature "No orders yet"). The rate card shows
 * the active row of the Rate Master, or "Unavailable" - never a hardcoded
 * fallback.
 *
 * Order value adds up the subtotals of orders that are not cancelled. It is
 * order value, not money received: the app has no payment ledger for orders.
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
  imports: [NgTemplateOutlet, AdminStateComponent, BadgeComponent, BarChartComponent, DonutChartComponent, LineChartComponent],
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
  private readonly attention = inject(AdminAttentionService);
  private readonly destroyRef = inject(DestroyRef);

  /** Admin-only gate; anyone else never sees a shortcut or a number. */
  readonly canAccess = computed(() => this.auth.isAdmin());
  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());

  /** Asks the shell to open another page. */
  readonly navigate = output<AppView>();

  readonly trendTitle = `Orders per day, last ${TREND_DAYS} days`;
  readonly valueTitle = `Order value per day, last ${TREND_DAYS} days`;
  readonly formatRupees = compactRupees;
  readonly formatPlain = (n: number): string => n.toLocaleString('en-IN');

  private readonly metrics = signal<Record<MetricKey, MetricState>>(INITIAL);

  /** The rows behind the charts and the Recent activity blocks; null until that endpoint has answered. */
  private readonly orderRows = signal<readonly AdminOrderSummaryDto[] | null>(null);
  private readonly leadRows = signal<readonly LeadResponse[] | null>(null);
  private readonly proposalRows = signal<readonly AdminProposalSummaryDto[] | null>(null);
  private readonly productRows = signal<readonly AdminProductDto[] | null>(null);

  /** When the newest answer arrived; null until something has loaded. */
  readonly updatedAt = signal<Date | null>(null);
  readonly updatedText = computed(() => {
    const at = this.updatedAt();
    return at === null ? '' : `Updated ${at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
  });
  /** True while any request is in flight. */
  readonly busy = signal(false);

  /** The six cards in display order, ready to render. */
  readonly cards = computed<readonly SummaryCard[]>(() => {
    const m = this.metrics();
    const orders = this.orderRows();
    const proposals = this.proposalRows();
    const products = this.productRows();
    const pending = orders?.filter((o) => o.status === 0).length ?? 0;
    const unpaid = proposals?.filter((p) => !p.isPaymentVerified && p.paymentAttemptCount > 0).length ?? 0;
    const active = products?.filter((p) => p.isActive).length ?? 0;
    return [
      this.valueCard(m.orders),
      this.countCard('orders', 'Orders', orders && pending > 0 ? `${pending.toLocaleString('en-IN')} pending` : 'All customer orders', m.orders),
      this.countCard('leads', 'New leads', 'Awaiting follow-up', m.leads),
      this.countCard(
        'proposals',
        'Proposals',
        proposals && unpaid > 0 ? `${unpaid.toLocaleString('en-IN')} payment pending` : 'All proposals',
        m.proposals
      ),
      this.countCard('products', 'Products', products ? `${active.toLocaleString('en-IN')} active` : 'Active and inactive', m.products),
      this.rateCard(m.rate),
    ];
  });

  // ── chart data (every chart reads the rows its summary already fetched) ──

  /** Order count and order value for each of the last TREND_DAYS days, oldest first. */
  private readonly trend = computed(() => {
    const rows = this.orderRows() ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: TREND_DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (TREND_DAYS - 1 - i));
      return d;
    });
    const counts = new Map<string, number>();
    const values = new Map<string, number>();
    for (const o of rows) {
      const created = new Date(o.createdAt);
      if (Number.isNaN(created.getTime())) continue;
      const key = dayKey(created);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (o.status !== ORDER_STATUS_CANCELLED) values.set(key, (values.get(key) ?? 0) + (o.subtotal || 0));
    }
    const label = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return {
      orders: days.map((d): ChartDatum => ({ label: label(d), value: counts.get(dayKey(d)) ?? 0 })),
      value: days.map((d): ChartDatum => ({ label: label(d), value: values.get(dayKey(d)) ?? 0 })),
    };
  });
  readonly ordersTrend = computed(() => this.trend().orders);
  readonly valueTrend = computed(() => this.trend().value);

  readonly ordersByStatus = computed<readonly ChartDatum[]>(() => {
    const rows = this.orderRows() ?? [];
    return [0, 1, 2, 3, 4].map((status) => ({
      label: orderStatusLabel(status),
      value: rows.filter((o) => o.status === status).length,
      color: ORDER_STATUS_COLORS[status],
    }));
  });

  readonly leadPipeline = computed<readonly ChartDatum[]>(() => {
    const rows = this.leadRows() ?? [];
    return [LEAD_STATUS_NEW, LEAD_STATUS_IN_PROGRESS, LEAD_STATUS_CLOSED].map((status) => ({
      label: leadStatusLabel(status),
      value: rows.filter((l) => l.status === status).length,
    }));
  });

  readonly proposalPayments = computed<readonly ChartDatum[]>(() => {
    const rows = this.proposalRows() ?? [];
    return [
      { label: 'Payment verified', value: rows.filter((p) => p.isPaymentVerified).length, color: '#2e8b57' },
      { label: 'Payment pending', value: rows.filter((p) => !p.isPaymentVerified && p.paymentAttemptCount > 0).length, color: '#b07d1f' },
      { label: 'No attempt', value: rows.filter((p) => !p.isPaymentVerified && p.paymentAttemptCount === 0).length, color: '#6b7a99' },
    ];
  });

  /** What is waiting for the Admin, from the figures that have loaded. Empty means nothing needs doing. */
  readonly attentionItems = computed<readonly AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    const orders = this.orderRows();
    const leads = this.leadRows();
    const proposals = this.proposalRows();
    const pending = orders?.filter((o) => o.status === 0).length ?? 0;
    const fresh = leads?.filter((l) => l.status === LEAD_STATUS_NEW).length ?? 0;
    const unpaid = proposals?.filter((p) => !p.isPaymentVerified && p.paymentAttemptCount > 0).length ?? 0;
    if (pending > 0) {
      items.push({ view: 'admin-orders', label: `${plural(pending, 'order')} pending`, detail: 'Confirm or cancel them in Orders.', tone: 'warn' });
    }
    if (fresh > 0) {
      items.push({ view: 'admin-leads', label: `${plural(fresh, 'new lead')} to follow up`, detail: 'Call or message them, then update the status.', tone: 'warn' });
    }
    if (unpaid > 0) {
      items.push({ view: 'admin-proposals', label: `${plural(unpaid, 'proposal')} with a payment pending`, detail: 'A token payment was started but not verified.', tone: 'info' });
    }
    const rate = this.metrics().rate;
    if (rate.status === 'ready' && rate.value === null) {
      items.push({ view: 'admin-rates', label: 'No active estimate rate', detail: 'Customers cannot save estimates until a rate is set.', tone: 'danger' });
    }
    return items;
  });

  /**
   * Whether the figures "Needs attention" is built from have all answered:
   * still loading, answered but some failed (the list may be incomplete), or all in.
   */
  readonly attentionState = computed<'loading' | 'incomplete' | 'clear'>(() => {
    const m = this.metrics();
    const all = [m.orders.status, m.leads.status, m.proposals.status, m.rate.status];
    if (all.includes('loading')) return 'loading';
    return all.includes('error') ? 'incomplete' : 'clear';
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
          tone: orderTone(o.status),
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
          tone: leadTone(l.status),
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
          tone: proposalPaymentTone(p),
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
          return {
            value: list.length,
            apply: () => {
              this.orderRows.set(list);
              this.attention.reportOrders(list);
            },
          };
        })
      ),
    leads: () =>
      this.leads.getLeads().pipe(
        map((rows) => {
          const list = rows ?? [];
          return {
            value: list.filter((l) => l.status === LEAD_STATUS_NEW).length,
            apply: () => {
              this.leadRows.set(list);
              this.attention.reportLeads(list);
            },
          };
        })
      ),
    proposals: () =>
      this.proposals.getAdminProposals().pipe(
        map((rows) => {
          const list = rows ?? [];
          return {
            value: list.length,
            apply: () => {
              this.proposalRows.set(list);
              this.attention.reportProposals(list);
            },
          };
        })
      ),
    products: () =>
      this.products.getAdminProducts().pipe(
        map((rows) => {
          const list = rows ?? [];
          return { value: list.length, apply: () => this.productRows.set(list) };
        })
      ),
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

  /** Opens another Admin page (from "Needs attention"). A no-op for anyone who is not an Admin. */
  open(view: AppView): void {
    if (!this.auth.isAdmin()) return;
    this.navigate.emit(view);
  }

  /** Re-requests one failed endpoint only; the other four are left alone. */
  retry(key: CardKey | RecentKey): void {
    const metric: MetricKey = key === 'value' ? 'orders' : key;
    if (this.metrics()[metric].status !== 'error') return;
    this.load(metric);
  }

  /** The loading state of one metric, for the charts. */
  statusOf(key: MetricKey): MetricStatus {
    return this.metrics()[key].status;
  }

  /** Re-requests all five endpoints. Numbers already on screen stay until the new ones arrive. */
  refresh(): void {
    if (!this.auth.isAdmin()) return;
    for (const key of METRIC_KEYS) {
      this.load(key, true);
    }
  }

  /** Issues the five independent requests once per Admin session. */
  private start(): void {
    if (this.started) return;
    this.started = true;
    for (const key of METRIC_KEYS) {
      this.load(key);
    }
  }

  private load(key: MetricKey, keepShown = false): void {
    if (!this.auth.isAdmin() || this.inFlight.has(key)) return;
    this.inFlight.add(key);
    this.busy.set(true);
    // A refresh leaves a figure that is already showing in place until its answer arrives.
    if (!(keepShown && this.metrics()[key].status === 'ready')) this.setMetric(key, LOADING);
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
    this.busy.set(this.inFlight.size > 0);
    apply?.();
    this.setMetric(key, state);
    if (state.status === 'ready') this.updatedAt.set(new Date());
  }

  private setMetric(key: MetricKey, state: MetricState): void {
    this.metrics.update((m) => ({ ...m, [key]: state }));
  }

  /** Back to the empty loading state, never leaving one session's numbers or rows for the next. */
  private reset(): void {
    this.started = false;
    this.generation++;
    this.inFlight.clear();
    this.busy.set(false);
    this.metrics.set(INITIAL);
    this.orderRows.set(null);
    this.leadRows.set(null);
    this.proposalRows.set(null);
    this.productRows.set(null);
    this.updatedAt.set(null);
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

  /** Order value: the sum of non-cancelled order subtotals, ready when the orders answer is. */
  private valueCard(orders: MetricState): SummaryCard {
    const rows = this.orderRows();
    const base = { key: 'value' as const, label: 'Order value', caption: 'Excluding cancelled orders', unavailable: false };
    if (orders.status !== 'ready' || rows === null) {
      return { ...base, status: orders.status, display: '' };
    }
    const total = rows.filter((o) => o.status !== ORDER_STATUS_CANCELLED).reduce((n, o) => n + (o.subtotal || 0), 0);
    return { ...base, status: 'ready', display: rupees(total) ?? '' };
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
