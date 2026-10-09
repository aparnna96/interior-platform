import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminLayoutComponent } from './admin-layout.component';
import { AUTH_TOKEN_KEY, AuthService } from '../auth.service';
import type { AppView } from '../app-paths';

const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

/** Minimal unsigned JWT carrying the given payload (tests only). */
function jwt(payload: unknown): string {
  const enc = (v: unknown) =>
    btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc(payload)}.sig`;
}

const ADMIN_WITH_EMAIL = jwt({ email: 'owner@confident.test', [ROLE_CLAIM]: ['Admin', 'Customer'] });
const ADMIN_NO_EMAIL = jwt({ [ROLE_CLAIM]: 'Admin' });

@Component({
  standalone: true,
  imports: [AdminLayoutComponent],
  template: `
    <app-admin-layout [activeView]="view()" (navigate)="picked.push($event)">
      <p class="projected">Page body</p>
    </app-admin-layout>
  `,
})
class HostComponent {
  readonly view = signal<AppView>('admin-dashboard');
  readonly picked: AppView[] = [];
}

describe('AdminLayoutComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;

  async function setup(token: string = ADMIN_WITH_EMAIL, view: AppView = 'admin-dashboard') {
    localStorage.clear();
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.view.set(view);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    return fixture.componentInstance;
  }

  const q = <T extends HTMLElement = HTMLElement>(selector: string) => el.querySelector<T>(selector);
  const items = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.admin-nav-item'));
  const labels = () => items().map((b) => b.textContent?.trim());
  const itemByLabel = (label: string) => items().find((b) => b.textContent?.trim() === label)!;
  const active = () => document.activeElement as HTMLElement | null;

  /** The drawer exists below 960px; focus moves only onto buttons that are displayed. */
  const narrow = () => window.innerWidth < 960;

  afterEach(() => localStorage.clear());

  describe('structure and branding', () => {
    it('uses the Confident Group logo and an Admin workspace tag', async () => {
      await setup();
      const logo = q<HTMLImageElement>('.admin-logo')!;
      expect(logo.getAttribute('src')).toBe('/branding/confident-group-horizontal.png');
      expect(logo.getAttribute('alt')).toBe('Confident Group');
      expect(q('.admin-brand-tag')!.textContent).toContain('Admin workspace');
    });

    it('shows the logo through the same cropped window the customer sidebar uses', async () => {
      await setup();
      const logo = q<HTMLImageElement>('.admin-logo')!;
      const windowEl = q('.admin-logo-window')!;
      // The file is mostly empty margin: a tall image in a short, clipping window.
      expect(windowEl.contains(logo)).toBeTrue();
      expect(getComputedStyle(windowEl).overflow).toBe('hidden');
      expect(parseFloat(getComputedStyle(windowEl).height)).toBe(52);
      expect(parseFloat(getComputedStyle(logo).height)).toBe(108);
      expect(parseFloat(getComputedStyle(logo).marginTop)).toBe(-23);
    });

    it('groups the navigation as Overview, Manage and Site', async () => {
      await setup();
      const groups = Array.from(el.querySelectorAll('.admin-nav-label')).map((e) => e.textContent?.trim());
      expect(groups).toEqual(['Overview', 'Manage', 'Site']);
      // Each group is its own labelled navigation landmark.
      const landmarks = Array.from(el.querySelectorAll('nav')).map((n) => n.getAttribute('aria-label'));
      expect(landmarks).toEqual(['Overview', 'Manage', 'Site']);
      expect(q('aside')!.getAttribute('aria-label')).toBe('Admin navigation');
    });

    it('lists the Admin pages, then the site links', async () => {
      await setup();
      expect(labels()).toEqual([
        'Dashboard',
        'Products',
        'Orders',
        'Proposals',
        'Leads',
        'Estimate rate',
        'View customer site',
        'Account',
        'Log out',
      ]);
    });

    it('shows the page it is given inside its content area', async () => {
      await setup();
      expect(q('main#admin-main .projected')!.textContent).toContain('Page body');
    });

    it('shows no customer navigation', async () => {
      await setup();
      expect(q('.pubnav')).toBeNull();
      expect(labels()).not.toContain('Cart');
      expect(labels()).not.toContain('Furniture');
    });
  });

  describe('active state and header', () => {
    it('does not repeat the page title in the header: each page shows its own heading', async () => {
      await setup();
      expect(q('.admin-topbar-title')).toBeNull();
      expect(q('.admin-topbar')!.textContent).not.toContain('Dashboard');
    });

    it('keeps the identity chip at the right edge of the header', async () => {
      await setup();
      const top = q('.admin-topbar')!.getBoundingClientRect();
      const chip = q('.admin-chip')!.getBoundingClientRect();
      expect(Math.round(top.right - chip.right)).toBeLessThanOrEqual(26);
    });

    const cases: ReadonlyArray<readonly [AppView, string]> = [
      ['admin-dashboard', 'Dashboard'],
      ['admin-products', 'Products'],
      ['admin-orders', 'Orders'],
      ['admin-proposals', 'Proposals'],
      ['leads', 'Leads'],
      ['admin-rates', 'Estimate rate'],
    ];

    for (const [view, label] of cases) {
      it(`marks only "${label}" as the current page on ${view}`, async () => {
        await setup(ADMIN_WITH_EMAIL, view);
        const current = items().filter((b) => b.getAttribute('aria-current') === 'page');
        expect(current.map((b) => b.textContent?.trim())).toEqual([label]);
        expect(items().filter((b) => b.classList.contains('active')).length).toBe(1);
      });
    }

    it('follows the page as it changes', async () => {
      const host = await setup();
      host.view.set('admin-orders');
      fixture.detectChanges();
      expect(itemByLabel('Orders').getAttribute('aria-current')).toBe('page');
      expect(itemByLabel('Dashboard').getAttribute('aria-current')).toBeNull();
    });
  });

  describe('identity chip', () => {
    it('shows the Admin role and the signed-in email', async () => {
      await setup(ADMIN_WITH_EMAIL);
      const chip = q('.admin-chip')!;
      expect(chip.querySelector('.admin-chip-role')!.textContent?.trim()).toBe('Admin');
      expect(chip.querySelector('.admin-chip-email')!.textContent?.trim()).toBe('owner@confident.test');
      expect(chip.textContent).toContain('Signed in as');
    });

    it('shows just the role when the token carries no email', async () => {
      await setup(ADMIN_NO_EMAIL);
      expect(q('.admin-chip-role')!.textContent?.trim()).toBe('Admin');
      expect(q('.admin-chip-email')).toBeNull();
    });
  });

  describe('navigation requests', () => {
    const targets: ReadonlyArray<readonly [string, AppView]> = [
      ['Dashboard', 'admin-dashboard'],
      ['Products', 'admin-products'],
      ['Orders', 'admin-orders'],
      ['Proposals', 'admin-proposals'],
      ['Leads', 'leads'],
      ['Estimate rate', 'admin-rates'],
      ['View customer site', 'home'],
      ['Account', 'account'],
    ];

    for (const [label, view] of targets) {
      it(`"${label}" asks the app for ${view}`, async () => {
        const host = await setup();
        itemByLabel(label).click();
        expect(host.picked).toEqual([view]);
      });
    }

    it('Log out ends the session and sends the user to Home, not to the login page', async () => {
      const host = await setup();
      const auth = TestBed.inject(AuthService);
      expect(auth.isAuthenticated()).toBeTrue();
      itemByLabel('Log out').click();
      expect(auth.isAuthenticated()).toBeFalse();
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
      expect(host.picked).toEqual(['home']);
    });
  });

  describe('mobile drawer', () => {
    const openDrawer = () => q<HTMLButtonElement>('.admin-menu-btn')!.click();
    const isOpen = () => q('.admin-shell')!.classList.contains('drawer-open');

    it('starts closed, with a labelled menu button that reports its state', async () => {
      await setup();
      const menu = q<HTMLButtonElement>('.admin-menu-btn')!;
      expect(menu.getAttribute('aria-label')).toBe('Open navigation');
      expect(menu.getAttribute('aria-controls')).toBe('admin-sidebar');
      expect(menu.getAttribute('aria-expanded')).toBe('false');
      expect(q('#admin-sidebar')).toBeTruthy();
      expect(isOpen()).toBeFalse();
      expect(q('.admin-backdrop')).toBeNull();
      expect(q('.admin-main')!.getAttribute('inert')).toBeNull();
    });

    it('opens from the menu button: backdrop shown, page behind it inert', async () => {
      await setup();
      openDrawer();
      fixture.detectChanges();
      expect(isOpen()).toBeTrue();
      expect(q('.admin-menu-btn')!.getAttribute('aria-expanded')).toBe('true');
      expect(q('.admin-backdrop')).toBeTruthy();
      expect(q('.admin-main')!.getAttribute('inert')).toBe('');
    });

    it('moves focus to the Close button when it opens', async function () {
      if (!narrow()) return pending('needs a window narrower than 960px');
      await setup();
      openDrawer();
      expect(active()!.getAttribute('aria-label')).toBe('Close navigation');
    });

    it('closes on Escape and returns focus to the menu button', async function () {
      if (!narrow()) return pending('needs a window narrower than 960px');
      await setup();
      openDrawer();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(isOpen()).toBeFalse();
      expect(q('.admin-main')!.getAttribute('inert')).toBeNull();
      expect(active()).toBe(q('.admin-menu-btn'));
    });

    it('closes on a click on the backdrop and returns focus to the menu button', async function () {
      if (!narrow()) return pending('needs a window narrower than 960px');
      await setup();
      openDrawer();
      fixture.detectChanges();
      q<HTMLElement>('.admin-backdrop')!.click();
      fixture.detectChanges();
      expect(isOpen()).toBeFalse();
      expect(q('.admin-backdrop')).toBeNull();
      expect(active()).toBe(q('.admin-menu-btn'));
    });

    it('closes from its Close button', async function () {
      if (!narrow()) return pending('needs a window narrower than 960px');
      await setup();
      openDrawer();
      q<HTMLButtonElement>('.admin-drawer-close')!.click();
      fixture.detectChanges();
      expect(isOpen()).toBeFalse();
      expect(active()).toBe(q('.admin-menu-btn'));
    });

    it('closes when a page is chosen, asks for it, and moves focus to the page content', async function () {
      if (!narrow()) return pending('needs a window narrower than 960px');
      const host = await setup();
      openDrawer();
      fixture.detectChanges();
      itemByLabel('Orders').click();
      fixture.detectChanges();
      expect(host.picked).toEqual(['admin-orders']);
      expect(isOpen()).toBeFalse();
      expect(active()).toBe(q('#admin-main'));
    });

    it('keeps Tab inside the open drawer, wrapping at both ends', async function () {
      if (!narrow()) return pending('needs a window narrower than 960px');
      await setup();
      openDrawer();
      fixture.detectChanges();
      const side = q('#admin-sidebar')!;
      const controls = Array.from(side.querySelectorAll<HTMLButtonElement>('button'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      expect(first.getAttribute('aria-label')).toBe('Close navigation');
      expect(last.textContent?.trim()).toBe('Log out');

      last.focus();
      const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      last.dispatchEvent(forward);
      expect(forward.defaultPrevented).toBeTrue();
      expect(active()).toBe(first);

      const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
      first.dispatchEvent(backward);
      expect(backward.defaultPrevented).toBeTrue();
      expect(active()).toBe(last);
    });

    it('makes the drawer entries at least 40px tall on a phone', async function () {
      if (!narrow()) return pending('needs a window narrower than 960px');
      await setup();
      openDrawer();
      fixture.detectChanges();
      for (const item of items()) {
        expect(item.getBoundingClientRect().height).withContext(item.textContent?.trim() ?? '').toBeGreaterThanOrEqual(40);
      }
    });

    it('lets Tab move normally between the middle entries', async function () {
      if (!narrow()) return pending('needs a window narrower than 960px');
      await setup();
      openDrawer();
      fixture.detectChanges();
      itemByLabel('Products').focus();
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      itemByLabel('Products').dispatchEvent(tab);
      expect(tab.defaultPrevented).toBeFalse();
    });

    it('ignores Escape while it is closed and leaves focus alone', async function () {
      if (!narrow()) return pending('needs a window narrower than 960px');
      await setup();
      const probe = q<HTMLButtonElement>('.admin-menu-btn')!;
      probe.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(active()).toBe(probe);
      expect(isOpen()).toBeFalse();
    });

    it('closes by itself when the window grows to desktop width, so nothing stays inert', async () => {
      await setup();
      openDrawer();
      fixture.detectChanges();
      expect(isOpen()).toBeTrue();
      // Put the real property back afterwards: later specs read the window width.
      const original = Object.getOwnPropertyDescriptor(window, 'innerWidth');
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
      try {
        window.dispatchEvent(new Event('resize'));
        fixture.detectChanges();
      } finally {
        if (original) Object.defineProperty(window, 'innerWidth', original);
        else delete (window as unknown as Record<string, unknown>)['innerWidth'];
      }
      expect(isOpen()).toBeFalse();
      expect(q('.admin-main')!.getAttribute('inert')).toBeNull();
    });
  });
});
