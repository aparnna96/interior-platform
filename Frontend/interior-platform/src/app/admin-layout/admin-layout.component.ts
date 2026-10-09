import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { AuthService } from '../auth.service';
import type { AppView } from '../app-paths';

/**
 * The sidebar is a fixed column from this width up and an off-canvas drawer
 * below it. Keep in step with the media query in the stylesheet.
 */
const DESKTOP_MIN_WIDTH = 960;

interface AdminNavItem {
  readonly view: AppView;
  readonly label: string;
  /** SVG path data on a 16x16 grid, drawn as an outline. */
  readonly icon: readonly string[];
}

interface AdminNavGroup {
  readonly label: string;
  readonly items: readonly AdminNavItem[];
}

const ICONS = {
  dashboard: [
    'M2.5 1.5h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z',
    'M10 1.5h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z',
    'M2.5 9h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z',
    'M10 9h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z',
  ],
  products: ['M2.5 5.5h11l-.8 7a1.5 1.5 0 0 1-1.5 1.3H4.8a1.5 1.5 0 0 1-1.5-1.3z', 'M5.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5'],
  orders: [
    'M2.5 5.5h11l-.8 7a1.5 1.5 0 0 1-1.5 1.3H4.8a1.5 1.5 0 0 1-1.5-1.3z',
    'M5.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5',
    'M5.5 10h5',
  ],
  proposals: [
    'M4.5 1.5h7A1.5 1.5 0 0 1 13 3v10a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13V3a1.5 1.5 0 0 1 1.5-1.5z',
    'M5.5 5.5h5',
    'M5.5 8.5h5',
    'M5.5 11.5h3',
  ],
  leads: ['M3 2.5h10A1.5 1.5 0 0 1 14.5 4v8a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 12V4A1.5 1.5 0 0 1 3 2.5z', 'M1.5 5.5h13'],
  rate: [
    'M3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9A1.5 1.5 0 0 1 3.5 2z',
    'M5 6h6',
    'M5 9h6',
    'M5 12h3',
  ],
  site: ['M2 8.5 8 3l6 5.5', 'M4 7.5V13.5h8V7.5'],
  account: ['M10.8 5.5a2.8 2.8 0 1 1-5.6 0 2.8 2.8 0 0 1 5.6 0z', 'M2.5 14c.8-2.6 3-4 5.5-4s4.7 1.4 5.5 4'],
  logout: ['M6.5 2.5H4A1.5 1.5 0 0 0 2.5 4v8A1.5 1.5 0 0 0 4 13.5h2.5', 'M10 5l3 3-3 3', 'M13 8H6'],
  menu: ['M2 4h12', 'M2 8h12', 'M2 12h12'],
  close: ['M3.5 3.5l9 9', 'M12.5 3.5l-9 9'],
} as const;

/** Pages that live inside the Admin shell, grouped as they appear in the sidebar. */
const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  {
    label: 'Overview',
    items: [{ view: 'admin-dashboard', label: 'Dashboard', icon: ICONS.dashboard }],
  },
  {
    label: 'Manage',
    items: [
      { view: 'admin-products', label: 'Products', icon: ICONS.products },
      { view: 'admin-orders', label: 'Orders', icon: ICONS.orders },
      { view: 'admin-proposals', label: 'Proposals', icon: ICONS.proposals },
      { view: 'leads', label: 'Leads', icon: ICONS.leads },
      { view: 'admin-rates', label: 'Estimate rate', icon: ICONS.rate },
    ],
  },
];


/** Where keyboard focus goes when the drawer closes. */
type DrawerFocus = 'menu' | 'main' | null;

/**
 * The Admin workspace shell: its own sidebar, header and content area.
 *
 * AppComponent shows it instead of the customer/workspace layout when an Admin
 * is on an Admin page. It only draws chrome and reports clicks: the page itself
 * is projected into the content area, and the shell asks for navigation through
 * `navigate` (the app keeps one `activeView` and owns the address bar, so this
 * component never touches the Router).
 */
@Component({
  selector: 'app-admin-layout',
  standalone: true,
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.css',
})
export class AdminLayoutComponent {
  /** The page being shown: drives the active item and the header title. */
  readonly activeView = input.required<AppView>();
  /** The user chose another page (an Admin page, or a customer page such as Home or Account). */
  readonly navigate = output<AppView>();

  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly mainRegion = viewChild<ElementRef<HTMLElement>>('mainRegion');

  readonly groups = ADMIN_NAV_GROUPS;
  readonly icons = ICONS;
  /** Display-only email from the session token, or null. */
  readonly email = this.auth.email;

  readonly drawerOpen = signal(false);

  select(view: AppView): void {
    const wasOpen = this.drawerOpen();
    this.navigate.emit(view);
    if (wasOpen) this.closeDrawer('main');
  }

  /** Ends the session and moves to Home in the same click, so the app does not treat it as an expired session. */
  logout(): void {
    this.auth.logout();
    this.navigate.emit('home');
  }

  openDrawer(): void {
    this.drawerOpen.set(true);
    // Render the open state first so the drawer is visible, then put focus inside it.
    this.cdr.detectChanges();
    this.closeButton()?.nativeElement.focus();
  }

  closeDrawer(focus: DrawerFocus = null): void {
    if (!this.drawerOpen()) return;
    this.drawerOpen.set(false);
    // Drop the inert state before moving focus back to the page.
    this.cdr.detectChanges();
    const target = focus === 'menu' ? this.menuButton() : focus === 'main' ? this.mainRegion() : undefined;
    target?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeDrawer('menu');
  }

  @HostListener('window:resize')
  onResize(): void {
    // The drawer does not exist on a wide screen: never leave the page inert behind it.
    if (window.innerWidth >= DESKTOP_MIN_WIDTH) this.closeDrawer();
  }

  /** Keeps Tab and Shift+Tab inside the open drawer. */
  onSidebarKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.drawerOpen()) return;
    const controls = Array.from(
      (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not([disabled])')
    );
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
