import { Component, HostListener, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { RoomVisualizerComponent } from './room-visualizer/room-visualizer.component';
import { FloorPlanComponent } from './floor-plan/floor-plan.component';
import { ElevationViewComponent } from './elevation/elevation-view.component';
import { TextureChipsComponent } from './finishes/texture-chips.component';
import { findFreeSpot } from './floor-plan/furniture-placement';
import { DEFAULT_PATTERN_ID, FABRIC_PATTERNS, FLOOR_PATTERNS, WALL_PATTERNS } from './finishes/finish-patterns';
import {
  DEFAULT_CEILING_HEIGHT_FT,
  ElevationWall,
  MAX_CEILING_HEIGHT_FT,
  MIN_CEILING_HEIGHT_FT,
} from './elevation/elevation-geometry';
import { LoginPageComponent } from './auth/login-page.component';
import { RegisterPageComponent } from './auth/register-page.component';
import { AccountPageComponent } from './auth/account-page.component';
import { pathForView, requiresLogin, safeReturnUrl, viewForPath, type AppView } from './app-paths';
import { CatalogueComponent } from './catalogue/catalogue.component';
import { CartComponent } from './catalogue/cart.component';
import { CartService } from './catalogue/cart.service';
import { AuthService } from './auth.service';
import { OrdersComponent } from './orders/orders.component';
import { ProposalsComponent } from './proposal/proposals.component';
import type { ProposalDetailDto } from './proposal/proposal.service';
import { EstimateService, type EstimateDto } from './estimate/estimate.service';
import { SavedEstimatesComponent } from './estimate/saved-estimates.component';
import { HomeComponent } from './home/home.component';
import { InteriorsComponent } from './home/interiors.component';
import { LeadsComponent } from './leads/leads.component';
import { AdminProductsComponent } from './admin-products/admin-products.component';
import { AdminOrdersComponent } from './admin-orders/admin-orders.component';
import { AdminProposalsComponent } from './admin-proposals/admin-proposals.component';
import { AdminRatesComponent } from './admin-rates/admin-rates.component';
import { EstimateRateService } from './estimate/estimate-rate.service';
import {
  calculateEstimateTotal,
  calculateRoomArea,
  sanitizeRoomDimension,
} from './estimate/estimate-calculator';

interface Swatch {
  name: string;
  value: string;
  code: string;
}

interface FurnitureDef {
  id: 'bed' | 'wardrobe' | 'sofa' | 'table' | 'chair';
  name: string;
  short: string;
  w: number; // feet
  l: number; // feet
}

interface PlacedItem {
  uid: string;
  defId: FurnitureDef['id'];
  name: string;
  short: string;
  w: number; // feet
  l: number; // feet
  x: number; // % left
  y: number; // % top
}

interface SavedProject {
  id: string;
  name: string;
  room: string;
  width: number;
  length: number;
  area: number;
  scheme: string;
  total: number;
  created: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RoomVisualizerComponent, FloorPlanComponent, ElevationViewComponent, TextureChipsComponent, LoginPageComponent, RegisterPageComponent, AccountPageComponent, CatalogueComponent, CartComponent, OrdersComponent, ProposalsComponent, SavedEstimatesComponent, HomeComponent, InteriorsComponent, LeadsComponent, AdminProductsComponent, AdminOrdersComponent, AdminProposalsComponent, AdminRatesComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  title = 'interior-platform';

  // ── views ──────────────────────────────────
  /** The Router owns the address bar; this shell keeps it in step with `activeView`. */
  private readonly router = inject(Router);

  /**
   * The page being shown. The URL and this signal follow each other: a click
   * sets the signal and the address updates; opening, reloading or going back
   * to an address updates the signal. Starts from the current address, so a
   * deep link renders the right page on first paint.
   */
  activeView = signal<AppView>(viewForPath(this.router.url)?.view ?? 'home');

  /** Product id from a /furniture/:id address; the catalogue shows its details page. */
  routeProductId = signal<string | null>(viewForPath(this.router.url)?.productId ?? null);

  /** Shared frontend cart store (Pillar 2) — badge count in the navbar. */
  readonly cart = inject(CartService);

  /** Session state — gates customer-only nav entries such as Orders. */
  readonly auth = inject(AuthService);

  /** Public website views use the top navbar; workspace views keep the sidebar. */
  isPublicView = computed(
    () =>
      this.activeView() === 'home' ||
      this.activeView() === 'interiors' ||
      this.activeView() === 'catalogue' ||
      this.activeView() === 'cart' ||
      this.activeView() === 'orders' ||
      this.activeView() === 'proposals' ||
      this.activeView() === 'login' ||
      this.activeView() === 'register' ||
      this.activeView() === 'account'
  );

  /** The room controls header belongs to the design workspace views only. */
  showWorkspaceHeader = computed(
    () =>
      this.activeView() === 'visualizer' ||
      this.activeView() === 'field' ||
      this.activeView() === 'estimates' ||
      this.activeView() === 'projects'
  );

  /** Highlights the Account entry on the account, login and register pages. */
  isAccountView = computed(
    () =>
      this.activeView() === 'account' ||
      this.activeView() === 'login' ||
      this.activeView() === 'register'
  );

  constructor() {
    // All views render in the same document and the Router (configured in
    // app.config.ts) owns the address bar. No app container owns the scroll
    // (verified: no overflow-y on .shell/.main); the Router scrolls to the
    // top on each new page and restores the position on Back.
    // Reset it instantly whenever the Visualizer is entered, from any entry
    // point (Home buttons, navbar, sidebar, project loading).
    effect(() => {
      if (this.activeView() === 'visualizer' || this.activeView() === 'field') {
        window.scrollTo(0, 0);
      }
    });
    // The FieldStaff entry (/field) is the same workspace, opened on the Elevation view
    // every time it is entered. Tracks only the page, so switching tabs while on it sticks.
    effect(() => {
      if (this.activeView() === 'field') untracked(() => this.canvasTab.set('elevation'));
    });
    // The rate is only needed where an estimate or project total is shown, so
    // it is fetched when one of those pages opens (and again on each return,
    // keeping the preview current) rather than at app start.
    effect(() => {
      const view = this.activeView();
      if (view === 'visualizer' || view === 'field' || view === 'estimates' || view === 'projects') {
        untracked(() => this.estimateRate.load());
      }
    });
    // Address -> page: opening, reloading, Back/Forward and guard redirects.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe((e) => this.applyUrl(e.urlAfterRedirects));
    // Page -> address: a click (or code) that changes the page updates the URL.
    // Guards still apply, so a logged-out visitor asking for a private page
    // ends up on /login with a return address.
    effect(() => {
      const view = this.activeView();
      untracked(() => {
        if (viewForPath(this.router.url)?.view === view) return;
        this.router.navigateByUrl(pathForView(view)).catch(() => undefined);
      });
    });
    // Session ended while on a private page (expired token, a 401 from the API):
    // go to the login page and come back here afterwards. Tracks only the login
    // state, so an explicit "Log out" (which moves to Home in the same click)
    // and normal navigation never trigger it.
    effect(() => {
      const authed = this.auth.isAuthenticated();
      untracked(() => {
        if (!authed && requiresLogin(this.activeView())) this.openLogin();
      });
    });
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        // Never carry one user's save state into another session.
        this.savingEstimate.set(false);
        this.saveEstimateError.set(null);
        this.savedEstimate.set(null);
        this.createdProposal.set(null);
      }
    });
    effect(() => {
      if (this.activeView() !== 'proposals' && this.createdProposal() !== null) {
        // The handoff snapshot served its purpose: drop it so the next
        // visit to Proposals starts from the server-refreshed list.
        this.createdProposal.set(null);
      }
    });
  }

  /**
   * Opens the server-created proposal snapshot in the Proposals view. The
   * saved estimate, the cart and the visualizer are untouched — only the
   * new detail is shown (via the ProposalsComponent `createdDetail` input,
   * which opens it without refetching).
   */
  onProposalCreated(proposal: ProposalDetailDto): void {
    this.createdProposal.set(proposal);
    this.activeView.set('proposals');
    this.closeDrawer();
  }

  /** Follows the address bar: shows the page the URL stands for. */
  private applyUrl(url: string): void {
    const resolved = viewForPath(url);
    if (!resolved) return;
    if (this.activeView() !== resolved.view) this.activeView.set(resolved.view);
    if (this.routeProductId() !== resolved.productId) this.routeProductId.set(resolved.productId);
    this.closeDrawer();
  }

  /** Furniture categories in the catalogue and the matching Visualizer piece. */
  private static readonly VISUALIZER_PIECE: Record<string, FurnitureDef['id']> = {
    Sofas: 'sofa',
    Beds: 'bed',
    Tables: 'table',
    Chairs: 'chair',
    Wardrobes: 'wardrobe',
  };

  /** "Add to Visualizer" on a product page: place the matching piece, then open the Visualizer. */
  onVisualizerRequested(category: string): void {
    const piece = AppComponent.VISUALIZER_PIECE[category];
    if (piece) this.addFurniture(piece);
    this.activeView.set('visualizer');
    this.closeDrawer();
  }

  /** The catalogue opened or closed a product details page: mirror it in the address. */
  onProductRoute(productId: string | null): void {
    if (this.routeProductId() === productId) return;
    this.routeProductId.set(productId);
    this.router.navigateByUrl(pathForView('catalogue', productId)).catch(() => undefined);
  }

  /**
   * POSTs the current visualizer dimensions and furniture (type + quantity) and shows
   * the server-created estimate. The local calculation is untouched: saved
   * records are snapshots and never follow later dimension edits.
   */
  saveEstimate(): void {
    if (this.savingEstimate()) return;
    if (!this.auth.isAuthenticated()) {
      this.saveEstimateError.set('Please log in to save this estimate.');
      return;
    }
    this.savingEstimate.set(true);
    this.saveEstimateError.set(null);
    this.estimates
      .createEstimate(this.appliedWidth(), this.appliedLength(), this.placedFurnitureLines())
      .subscribe({
        next: (estimate) => {
          this.savingEstimate.set(false);
          this.savedEstimate.set(estimate);
          // The server priced this estimate with the live rate: show that
          // rate if the preview was out of date.
          this.estimateRate.adopt(estimate.ratePerSquareFoot);
          this.savedEstimates?.loadEstimates();
        },
        error: (err: unknown) => {
          this.savingEstimate.set(false);
          const status = (err as { status?: number })?.status;
          if (status === 401) {
            // Consistent with cart/order 401s: the session is over and the
            // logout effect below clears the save state; the view falls
            // back to the login-required prompt.
            this.auth.logout();
            return;
          }
          this.saveEstimateError.set(this.describeEstimateError(err, status));
        },
      });
  }

  /**
   * The visualizer furniture as type + quantity lines (same pieces merged).
   * Names, sizes and prices are resolved server-side, never sent.
   */
  private placedFurnitureLines(): { furnitureType: string; quantity: number }[] {
    const counts = new Map<string, number>();
    for (const item of this.placed()) {
      counts.set(item.defId, (counts.get(item.defId) ?? 0) + 1);
    }
    return [...counts.entries()].map(([furnitureType, quantity]) => ({ furnitureType, quantity }));
  }

  private describeEstimateError(err: unknown, status?: number): string {
    const body = (err as { error?: unknown })?.error;
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      const title = record['title'];
      if (typeof title === 'string' && title) return title;
      const errors = record['errors'];
      if (errors && typeof errors === 'object') {
        const first = Object.values(errors as Record<string, unknown>)
          .flat()
          .map(String)
          .find((m) => m);
        if (first) return first;
      }
    }
    if (typeof body === 'string' && body) return body;
    if (status === 400) return 'Those dimensions cannot be saved (width and length must be within range).';
    return 'Something went wrong. Please try again.';
  }

  // ── sidebar shell state (local only, not persisted) ──
  sidebarCollapsed = signal(false);
  drawerOpen = signal(false);

  /** Subtle elevated state for the sticky public navbar once scrolled. */
  navScrolled = signal(false);

  /**
   * Somany-style compact state for the public navbar.
   * True while the user is scrolling downward past the header; false at the
   * top of the page, while scrolling upward, while the mobile menu is open,
   * or when reduced motion is preferred. When true the full bar (links and
   * normal brand) collapses and a compact centered logo remains visible;
   * the header itself is never translated away. Driven by the same single
   * window:scroll listener as {@link navScrolled} (no competing listeners).
   */
  navHidden = signal(false);

  /** Last seen scrollY, used for scroll-direction detection with tolerance. */
  private lastScrollY = 0;

  /** Scroll past this point before the header is allowed to collapse. */
  private static readonly NAV_HIDE_AFTER = 140;
  /** Downward travel required to collapse (filters out jitter/bounce). */
  private static readonly NAV_DOWN_TOLERANCE = 8;
  /** Upward travel required to expand. Smaller than the down tolerance so
   *  the header feels responsive without flickering. */
  private static readonly NAV_UP_TOLERANCE = 4;

  /**
   * Expand the full navbar from the compact centered-logo state.
   * Used by the compact logo button. Scroll-driven expands set
   * {@link navHidden} directly so they never steal focus; syncing
   * lastScrollY here prevents an immediate re-collapse on the next
   * downward scroll.
   */
  expandNavbar(): void {
    if (!this.navHidden()) return;
    this.navHidden.set(false);
    if (typeof window !== 'undefined') {
      this.lastScrollY = window.scrollY ?? this.lastScrollY;
    }
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    const y = window.scrollY ?? 0;
    const scrolled = y > 8;
    if (scrolled !== this.navScrolled()) {
      this.navScrolled.set(scrolled);
    }

    // Reduced motion: never collapse; the full header stays put.
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      if (this.navHidden()) this.navHidden.set(false);
      this.lastScrollY = y;
      return;
    }

    // Keep the full header (and its mobile menu) expanded while the menu is open.
    // Note: a hamburger remains reachable in the compact state, so the menu can
    // be opened while collapsed; this branch covers scrolling with it open.
    if (this.drawerOpen()) {
      if (this.navHidden()) this.navHidden.set(false);
      this.lastScrollY = y;
      return;
    }

    // Keep the full header expanded while keyboard focus is inside it (other
    // than on the compact logo itself) so tabbing never strands focus on
    // visibility-hidden full-bar contents.
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (active && active !== document.body) {
      const header =
        typeof document !== 'undefined'
          ? document.querySelector('header.pubnav')
          : null;
      const compact = header?.querySelector('.pubnav-compact');
      if (header?.contains(active) && !(compact?.contains(active))) {
        if (this.navHidden()) this.navHidden.set(false);
        this.lastScrollY = y;
        return;
      }
    }

    if (y <= AppComponent.NAV_HIDE_AFTER) {
      if (this.navHidden()) this.navHidden.set(false);
    } else if (y > this.lastScrollY + AppComponent.NAV_DOWN_TOLERANCE) {
      if (!this.navHidden()) this.navHidden.set(true);
    } else if (y < this.lastScrollY - AppComponent.NAV_UP_TOLERANCE) {
      if (this.navHidden()) this.navHidden.set(false);
    }
    this.lastScrollY = y;
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  openDrawer(): void {
    this.drawerOpen.set(true);
    // Opening the mobile menu always restores the full bar immediately so the
    // menu appears in its existing place below the full bar (no wait for scroll).
    if (this.navHidden()) this.navHidden.set(false);
    if (typeof window !== 'undefined') {
      this.lastScrollY = window.scrollY ?? this.lastScrollY;
    }
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }
  canvasTab = signal<'plan' | 'elevation' | 'preview'>('plan');
  /** Wall shown in the Elevation tab. */
  elevationWall = signal<ElevationWall>('top');
  /**
   * Ceiling height (ft) for the Elevation tab, 7 to 14. Like the room size it is typed
   * into a draft and applied with Generate Room. It is a drawing aid only: it is not
   * saved with estimates and does not change the area-based price.
   */
  draftCeiling = signal<number>(DEFAULT_CEILING_HEIGHT_FT);
  ceilingHeight = signal(DEFAULT_CEILING_HEIGHT_FT);
  readonly minCeiling = MIN_CEILING_HEIGHT_FT;
  readonly maxCeiling = MAX_CEILING_HEIGHT_FT;

  // ── room setup (draft vs applied) ──────────
  draftWidth = signal(12);
  draftLength = signal(15);
  appliedWidth = signal(12);
  appliedLength = signal(15);
  roomError = signal('');

  area = computed(() => calculateRoomArea(this.appliedWidth(), this.appliedLength()));

  /** Display-safe dimensions for the estimate panel (never NaN/Infinity). */
  displayWidth = computed(() => sanitizeRoomDimension(this.appliedWidth()));
  displayLength = computed(() => sanitizeRoomDimension(this.appliedLength()));
  planAspect = computed(() => `${this.appliedWidth()} / ${this.appliedLength()}`);

  /**
   * The Admin-managed rate (Rate Master). Display-only: the server prices
   * every saved estimate itself. Null until loaded; there is no fallback
   * number, so the preview shows a dash instead of a made-up figure.
   */
  private readonly estimateRate = inject(EstimateRateService);

  /** Preview total; 0 while the rate is unknown (the template shows a dash then). */
  estimateTotal = computed(() => calculateEstimateTotal(this.area(), this.estimateRate.rate() ?? 0));

  /** "₹1,500", or a dash while the rate is unknown. */
  rateAmount = computed(() => {
    const rate = this.estimateRate.rate();
    return rate === null ? '—' : `₹${this.money(rate)}`;
  });

  /** "₹1,500 / sq ft", or a dash while the rate is unknown. */
  rateText = computed(() => (this.estimateRate.rate() === null ? '—' : `${this.rateAmount()} / sq ft`));

  /** "₹270,000", or a dash while the rate is unknown. */
  totalText = computed(() =>
    this.estimateRate.rate() === null ? '—' : `₹${this.money(this.estimateTotal())}`
  );

  // ── estimate persistence (server is authoritative for saved records) ──
  private readonly estimates = inject(EstimateService);

  @ViewChild(SavedEstimatesComponent) savedEstimates?: SavedEstimatesComponent;

  /** True while POST /api/estimates is in flight — blocks duplicate saves. */
  savingEstimate = signal(false);
  /** Last save failure message, or null. */
  saveEstimateError = signal<string | null>(null);
  /** Last server-created estimate shown in the success state, or null. */
  savedEstimate = signal<EstimateDto | null>(null);

  /**
   * Last server-created proposal snapshot, handed to the Proposals view so
   * its detail opens without refetching. Cleared when leaving the Proposals
   * view (and on logout), so returning later shows the refreshed list
   * instead of a stale detail.
   */
  createdProposal = signal<ProposalDetailDto | null>(null);

  rooms = ['Living Room', 'Bedroom', 'Home Office'];
  selectedRoom = signal('Living Room');

  // ── finishes ───────────────────────────────
  walls: Swatch[] = [
    { name: 'Warm White', value: '#efe9db', code: 'IP-01' },
    { name: 'Oat Milk', value: '#e4d7c0', code: 'IP-02' },
    { name: 'Soft Clay', value: '#d9bfa4', code: 'IP-03' },
    { name: 'Sage Mist', value: '#c9cfbc', code: 'IP-04' },
    { name: 'Greige', value: '#cfc3b2', code: 'IP-05' },
    { name: 'Charcoal Calm', value: '#4a443c', code: 'IP-06' },
  ];
  floors: Swatch[] = [
    { name: 'Natural Oak', value: '#c9a87c', code: 'FL-21' },
    { name: 'Light Ash', value: '#dcc7a2', code: 'FL-22' },
    { name: 'Smoked Walnut', value: '#8a6a4c', code: 'FL-23' },
    { name: 'Honey Herringbone', value: '#bd925f', code: 'FL-24' },
  ];
  fabrics: Swatch[] = [
    { name: 'Bouclé Cream', value: '#ece1d1', code: 'FB-11' },
    { name: 'Linen Sand', value: '#dccfb8', code: 'FB-12' },
    { name: 'Terracotta Weave', value: '#c98a64', code: 'FB-13' },
    { name: 'Slate Velvet', value: '#6b7280', code: 'FB-14' },
    { name: 'Moss Linen', value: '#9aa88f', code: 'FB-15' },
  ];
  accents: Swatch[] = [
    { name: 'Bronze', value: '#8c6b4a', code: 'AC-1' },
    { name: 'Clay', value: '#b4563f', code: 'AC-2' },
    { name: 'Olive', value: '#6d7a5f', code: 'AC-3' },
    { name: 'Ink', value: '#2e2821', code: 'AC-4' },
  ];
  lights = [
    { id: 'day' as const, name: 'Daylight', icon: '☀', note: '5500K · neutral' },
    { id: 'evening' as const, name: 'Evening', icon: '◐', note: '2700K · warm dim' },
    { id: 'night' as const, name: 'Night', icon: '☾', note: '2200K · lamp only' },
  ];

  selectedWall = signal(this.walls[1]);
  selectedFloor = signal(this.floors[0]);
  selectedFabric = signal(this.fabrics[0]);
  selectedAccent = signal(this.accents[0]);
  light = signal<'day' | 'evening' | 'night'>('day');
  finishTab = signal<'Walls' | 'Floor' | 'Fabric' | 'Light'>('Walls');

  // Textures are chosen separately from colours. They are not saved with estimates.
  readonly wallPatterns = WALL_PATTERNS;
  readonly floorPatterns = FLOOR_PATTERNS;
  readonly fabricPatterns = FABRIC_PATTERNS;
  wallPatternId = signal(DEFAULT_PATTERN_ID.wall);
  floorPatternId = signal(DEFAULT_PATTERN_ID.floor);
  fabricPatternId = signal(DEFAULT_PATTERN_ID.fabric);

  schemeName = computed(
    () => `${this.selectedWall().name} × ${this.selectedFabric().name}`
  );

  // ── furniture ──────────────────────────────
  furnitureDefs: FurnitureDef[] = [
    { id: 'bed', name: 'Bed', short: 'BD', w: 6.5, l: 5 },
    { id: 'wardrobe', name: 'Wardrobe', short: 'WD', w: 6, l: 2 },
    { id: 'sofa', name: 'Sofa', short: 'SF', w: 7, l: 3 },
    { id: 'table', name: 'Table', short: 'TB', w: 4, l: 2.5 },
    { id: 'chair', name: 'Chair', short: 'CH', w: 2.5, l: 2.5 },
  ];

  placed = signal<PlacedItem[]>([
    { uid: 'f-sofa-1', defId: 'sofa', name: 'Sofa', short: 'SF', w: 7, l: 3, x: 20, y: 8 },
    { uid: 'f-table-1', defId: 'table', name: 'Table', short: 'TB', w: 4, l: 2.5, x: 34, y: 44 },
  ]);
  selectedItemId = signal<string | null>('f-sofa-1');
  private uidCounter = 2;

  selectedItem = computed(
    () => this.placed().find((p) => p.uid === this.selectedItemId()) ?? null
  );

  // ── projects (local only, frontend demo) ───
  projects = signal<SavedProject[]>([]);
  projectNotice = signal('');

  // ── room setup actions ─────────────────────
  // Draft inputs stay editable: ignore empty / non-finite keystrokes so the
  // draft signals never hold NaN/Infinity and the applied room stays valid.
  onDimensionInput(which: 'width' | 'length', raw: string): void {
    if (raw == null || String(raw).trim() === '') return;
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    if (which === 'width') this.draftWidth.set(v);
    else this.draftLength.set(v);
  }

  // Same rule as the width and length drafts: ignore empty or non-numeric keystrokes.
  onCeilingInput(raw: string): void {
    if (raw == null || String(raw).trim() === '') return;
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    this.draftCeiling.set(v);
  }

  generateRoom(): void {
    const w = Number(this.draftWidth());
    const l = Number(this.draftLength());
    if (!Number.isFinite(w) || !Number.isFinite(l)) {
      this.roomError.set('Enter numeric width and length in feet.');
      return;
    }
    if (w < 4 || l < 4 || w > 50 || l > 50) {
      this.roomError.set('Room dimensions must be between 4 ft and 50 ft.');
      return;
    }
    const c = Number(this.draftCeiling());
    if (!Number.isFinite(c) || c < MIN_CEILING_HEIGHT_FT || c > MAX_CEILING_HEIGHT_FT) {
      // Nothing is applied when any value is invalid, same as the room size check above.
      this.roomError.set(`Ceiling height must be between ${MIN_CEILING_HEIGHT_FT} ft and ${MAX_CEILING_HEIGHT_FT} ft.`);
      return;
    }
    this.roomError.set('');
    const rc = Math.round(c * 10) / 10;
    this.ceilingHeight.set(rc);
    this.draftCeiling.set(rc);
    const rw = Math.round(w * 10) / 10;
    const rl = Math.round(l * 10) / 10;
    this.appliedWidth.set(rw);
    this.appliedLength.set(rl);
    // Keep draft inputs in sync with the applied (rounded) source of truth.
    this.draftWidth.set(rw);
    this.draftLength.set(rl);
    this.clampAllItems();
  }

  resetWorkspace(): void {
    this.draftWidth.set(12);
    this.draftLength.set(15);
    this.appliedWidth.set(12);
    this.appliedLength.set(15);
    this.roomError.set('');
    this.draftCeiling.set(DEFAULT_CEILING_HEIGHT_FT);
    this.ceilingHeight.set(DEFAULT_CEILING_HEIGHT_FT);
    this.selectedWall.set(this.walls[1]);
    this.selectedFloor.set(this.floors[0]);
    this.selectedFabric.set(this.fabrics[0]);
    this.selectedAccent.set(this.accents[0]);
    this.light.set('day');
    this.elevationWall.set('top');
    this.wallPatternId.set(DEFAULT_PATTERN_ID.wall);
    this.floorPatternId.set(DEFAULT_PATTERN_ID.floor);
    this.fabricPatternId.set(DEFAULT_PATTERN_ID.fabric);
    this.placed.set([
      { uid: 'f-sofa-1', defId: 'sofa', name: 'Sofa', short: 'SF', w: 7, l: 3, x: 20, y: 8 },
      { uid: 'f-table-1', defId: 'table', name: 'Table', short: 'TB', w: 4, l: 2.5, x: 34, y: 44 },
    ]);
    this.selectedItemId.set('f-sofa-1');
  }

  // Keep furniture inside the room when dimensions change.
  private clampAllItems(): void {
    const rw = this.appliedWidth();
    const rl = this.appliedLength();
    this.placed.update((items) =>
      items.map((it) => ({
        ...it,
        x: this.clampN(it.x, 1, Math.max(1, 99 - (it.w / rw) * 100)),
        y: this.clampN(it.y, 1, Math.max(1, 99 - (it.l / rl) * 100)),
      }))
    );
  }

  private clampN(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
  }

  itemWPercent(item: PlacedItem): number {
    const rw = this.appliedWidth();
    if (!Number.isFinite(rw) || rw <= 0 || !Number.isFinite(item.w)) return 0;
    return (item.w / rw) * 100;
  }

  itemHPercent(item: PlacedItem): number {
    const rl = this.appliedLength();
    if (!Number.isFinite(rl) || rl <= 0 || !Number.isFinite(item.l)) return 0;
    return (item.l / rl) * 100;
  }

  // Width for the plan box so tall rooms don't overflow vertically.
  planStyle(): Record<string, string> {
    const w = this.appliedWidth();
    const l = this.appliedLength();
    if (!Number.isFinite(w) || !Number.isFinite(l) || w <= 0 || l <= 0) {
      return { 'aspect-ratio': '12 / 15', width: '100%' };
    }
    const ratio = w / l;
    if (ratio >= 1) {
      return { 'aspect-ratio': `${w} / ${l}`, width: '100%' };
    }
    const px = Math.round(Math.min(560, 460 * ratio + 120));
    return { 'aspect-ratio': `${w} / ${l}`, width: `min(100%, ${px}px)` };
  }

  // ── furniture actions (no drag-and-drop in v1) ──
  addFurniture(defId: FurnitureDef['id']): void {
    const def = this.furnitureDefs.find((d) => d.id === defId);
    if (!def) return;
    this.uidCounter += 1;
    const n = this.placed().length;
    // The usual spot for the n-th piece. It is kept when free; otherwise the new piece
    // goes to the first free place in the room instead of landing on top of another piece.
    const spot = findFreeSpot(
      def,
      { width: this.appliedWidth(), length: this.appliedLength() },
      this.placed(),
      { x: 6 + ((n * 13) % 60), y: 6 + ((n * 17) % 55) }
    );
    const uid = `f-${defId}-${this.uidCounter}`;
    this.placed.update((items) => [
      ...items,
      { uid, defId: def.id, name: def.name, short: def.short, w: def.w, l: def.l, x: spot.x, y: spot.y },
    ]);
    this.selectedItemId.set(uid);
    this.clampAllItems();
  }

  selectItem(uid: string): void {
    // Only select ids that still exist so the control area never desyncs.
    if (!this.placed().some((p) => p.uid === uid)) {
      this.selectedItemId.set(null);
      return;
    }
    this.selectedItemId.set(uid);
  }

  removeSelected(): void {
    const id = this.selectedItemId();
    if (!id) return;
    this.placed.update((items) => items.filter((i) => i.uid !== id));
    this.selectedItemId.set(null);
  }

  removeItem(uid: string): void {
    this.placed.update((items) => items.filter((i) => i.uid !== uid));
    if (this.selectedItemId() === uid) this.selectedItemId.set(null);
  }

  nudgeSelected(dx: number, dy: number): void {
    const id = this.selectedItemId();
    if (!id) return;
    const rw = this.appliedWidth();
    const rl = this.appliedLength();
    this.placed.update((items) =>
      items.map((it) => {
        if (it.uid !== id) return it;
        const maxX = Math.max(1, 99 - (it.w / rw) * 100);
        const maxY = Math.max(1, 99 - (it.l / rl) * 100);
        return {
          ...it,
          x: this.clampN(Math.round((it.x + dx) * 10) / 10, 1, maxX),
          y: this.clampN(Math.round((it.y + dy) * 10) / 10, 1, maxY),
        };
      })
    );
  }

  placePreset(pos: 'tl' | 'tr' | 'bl' | 'br' | 'center'): void {
    const id = this.selectedItemId();
    if (!id) return;
    const rw = this.appliedWidth();
    const rl = this.appliedLength();
    this.placed.update((items) =>
      items.map((it) => {
        if (it.uid !== id) return it;
        const wP = (it.w / rw) * 100;
        const hP = (it.l / rl) * 100;
        // Clamp presets so oversized pieces still stay anchored in the room.
        const maxX = Math.max(1, 99 - wP);
        const maxY = Math.max(1, 99 - hP);
        const cx = (v: number) => this.clampN(v, 1, maxX);
        const cy = (v: number) => this.clampN(v, 1, maxY);
        switch (pos) {
          case 'tl': return { ...it, x: 2, y: 2 };
          case 'tr': return { ...it, x: cx(98 - wP), y: 2 };
          case 'bl': return { ...it, x: 2, y: cy(98 - hP) };
          case 'br': return { ...it, x: cx(98 - wP), y: cy(98 - hP) };
          case 'center': return { ...it, x: cx(50 - wP / 2), y: cy(50 - hP / 2) };
        }
      })
    );
  }

  rotateSelected(): void {
    const id = this.selectedItemId();
    if (!id) return;
    this.placed.update((items) =>
      items.map((it) => (it.uid === id ? { ...it, w: it.l, l: it.w } : it))
    );
    this.clampAllItems();
  }

  clearFurniture(): void {
    this.placed.set([]);
    this.selectedItemId.set(null);
  }

  countOf(defId: string): number {
    return this.placed().filter((p) => p.defId === defId).length;
  }

  // ── projects ───────────────────────────────
  saveProject(): void {
    // A project stores its total, so it cannot be saved while the rate is
    // unknown (it would record 0). Say so instead of saving a wrong figure.
    if (this.estimateRate.rate() === null) {
      this.projectNotice.set('The estimate rate is not available yet. Please try again in a moment.');
      window.setTimeout(() => this.projectNotice.set(''), 2600);
      this.estimateRate.load();
      return;
    }
    const n = this.projects().length + 1;
    const p: SavedProject = {
      id: `p-${Date.now()}-${n}`,
      name: `Project ${n} — ${this.selectedRoom()}`,
      room: this.selectedRoom(),
      width: this.appliedWidth(),
      length: this.appliedLength(),
      area: this.area(),
      scheme: this.schemeName(),
      total: this.estimateTotal(),
      created: new Date().toLocaleDateString(),
    };
    this.projects.update((list) => [p, ...list]);
    this.projectNotice.set(`${p.name} saved to this workspace session.`);
    window.setTimeout(() => this.projectNotice.set(''), 2600);
  }

  loadProject(p: SavedProject): void {
    this.appliedWidth.set(p.width);
    this.appliedLength.set(p.length);
    this.draftWidth.set(p.width);
    this.draftLength.set(p.length);
    this.selectedRoom.set(p.room);
    this.activeView.set('visualizer');
    this.clampAllItems();
  }

  deleteProject(id: string): void {
    this.projects.update((list) => list.filter((p) => p.id !== id));
  }

  /**
   * Account entry in the navigation: the account page when logged in. For a
   * visitor the account guard sends them to /login and, after logging in,
   * back to /account.
   */
  openAccount(): void {
    this.activeView.set('account');
    this.closeDrawer();
  }

  /** Opens the login page from a "Log in" prompt elsewhere (cart, catalogue), returning here afterwards. */
  openLogin(): void {
    this.closeDrawer();
    const returnUrl = safeReturnUrl(this.router.url);
    this.router
      .navigate(['/login'], returnUrl ? { queryParams: { returnUrl } } : {})
      .catch(() => undefined);
  }

  money(n: number): string {
    return n.toLocaleString('en-IN');
  }
}
