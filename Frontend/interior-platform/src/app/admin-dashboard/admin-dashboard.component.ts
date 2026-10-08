import { Component, DestroyRef, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import type { Observable } from 'rxjs';
import { AuthService } from '../auth.service';
import type { AppView } from '../app-paths';
import { OrderService } from '../orders/order.service';
import { LeadService, LEAD_STATUS_NEW } from '../leads/lead.service';
import { ProposalService } from '../proposal/proposal.service';
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
 * The rate of the one active row, or null. A missing, zero or non-numeric
 * rate is "unavailable": the dashboard never shows ₹0 or invents a number.
 */
function activeRate(rows: readonly AdminEstimateRateDto[]): number | null {
  const rate = rows.find((r) => r.isActive)?.ratePerSquareFoot;
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * Admin back-office landing page at /admin.
 *
 * Stage 1: an Admin-only page with quick actions to the existing workspaces.
 * Stage 2 (this file): five summary cards fed by the existing Admin APIs.
 *
 * Each card loads independently, so one failing endpoint never blanks the
 * others, and Retry re-requests only that card. Nothing shows a number until
 * its response arrives (no fake zeros). The rate card shows the active row of
 * the Rate Master, or "Unavailable" - never a hardcoded fallback.
 *
 * The route guard keeps other roles out of /admin and this component repeats
 * the check (like the other admin pages): a non-Admin session makes no
 * dashboard requests and sees a login or access-denied state. A 401 reuses
 * the existing session handling (log out). The backend remains the real
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

  /** One existing Admin API per metric, reduced to the number the card shows. */
  private readonly sources: Record<MetricKey, () => Observable<number | null>> = {
    orders: () => this.orders.getAdminOrders().pipe(map((rows) => (rows ?? []).length)),
    leads: () =>
      this.leads
        .getLeads()
        .pipe(map((rows) => (rows ?? []).filter((l) => l.status === LEAD_STATUS_NEW).length)),
    proposals: () => this.proposals.getAdminProposals().pipe(map((rows) => (rows ?? []).length)),
    products: () => this.products.getAdminProducts().pipe(map((rows) => (rows ?? []).length)),
    rate: () => this.rates.getRates().pipe(map((rows) => activeRate(rows ?? []))),
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

  /** Re-requests one failed card only; the other four are left alone. */
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
        next: (value) => this.finish(key, generation, { status: 'ready', value }),
        error: (err: unknown) => {
          if ((err as { status?: number })?.status === 401) {
            // Same as every other admin page: an expired session ends here.
            this.auth.logout();
          }
          this.finish(key, generation, { status: 'error', value: null });
        },
      });
  }

  private finish(key: MetricKey, generation: number, state: MetricState): void {
    if (generation !== this.generation) return;
    this.inFlight.delete(key);
    this.setMetric(key, state);
  }

  private setMetric(key: MetricKey, state: MetricState): void {
    this.metrics.update((m) => ({ ...m, [key]: state }));
  }

  /** Back to the empty loading state, never leaving one session's numbers for the next. */
  private reset(): void {
    this.started = false;
    this.generation++;
    this.inFlight.clear();
    this.metrics.set(INITIAL);
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
