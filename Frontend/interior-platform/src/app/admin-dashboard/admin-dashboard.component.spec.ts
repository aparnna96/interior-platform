import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { AdminDashboardComponent } from './admin-dashboard.component';
import type { AppView } from '../app-paths';

const DOTNET_ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

/** Minimal unsigned JWT carrying role claims (tests only). */
function jwtWithRoles(roles: string[]): string {
  const enc = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ [DOTNET_ROLE_CLAIM]: roles })}.sig`;
}

const ADMIN_JWT = jwtWithRoles(['Admin']);
const STAFF_JWT = jwtWithRoles(['FieldStaff']);
const CUSTOMER_JWT = jwtWithRoles(['Customer']);

const EXPECTED: ReadonlyArray<readonly [string, AppView]> = [
  ['Manage products', 'admin-products'],
  ['Manage orders', 'admin-orders'],
  ['Manage proposals', 'admin-proposals'],
  ['Estimate rate', 'admin-rates'],
  ['Leads', 'leads'],
];

describe('AdminDashboardComponent', () => {
  function setup(token: string | null) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    return fixture;
  }

  function cards(fixture: { nativeElement: unknown }): HTMLButtonElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.action-card'));
  }

  function text(fixture: { nativeElement: unknown }): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    // The shell makes no API calls at all: nothing may be left open.
    TestBed.inject(HttpTestingController, null)?.verify();
    localStorage.clear();
  });

  it('shows the Dashboard heading and the five quick actions to an Admin', () => {
    const fixture = setup(ADMIN_JWT);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent).toContain('Dashboard');
    expect(el.querySelector('section[aria-label="Quick actions"]')).toBeTruthy();
    const titles = cards(fixture).map((c) => c.querySelector('.action-title')?.textContent?.trim());
    expect(titles).toEqual(EXPECTED.map(([label]) => label));
    // Every shortcut explains what the page is for.
    for (const card of cards(fixture)) {
      expect(card.querySelector('.action-desc')?.textContent?.trim().length ?? 0).toBeGreaterThan(10);
    }
  });

  it('makes no API requests', () => {
    setup(ADMIN_JWT);
    TestBed.inject(HttpTestingController).verify();
  });

  it('each quick action asks the shell to open its page', () => {
    const fixture = setup(ADMIN_JWT);
    const opened: AppView[] = [];
    fixture.componentInstance.navigate.subscribe((view) => opened.push(view));

    for (const [label] of EXPECTED) {
      cards(fixture)
        .find((c) => c.textContent?.includes(label))!
        .click();
    }

    expect(opened).toEqual(EXPECTED.map(([, view]) => view));
  });

  it('has no demo or pricing wording', () => {
    const fixture = setup(ADMIN_JWT);
    expect(text(fixture)).not.toMatch(/demo|not final pricing/i);
  });

  it('asks a logged-out visitor to log in and shows no shortcut', () => {
    const fixture = setup(null);
    expect(text(fixture)).toContain('Log in to access the Admin dashboard');
    expect(cards(fixture).length).toBe(0);
  });

  it('shows access-denied to Field Staff and customers, with no shortcut', () => {
    for (const token of [STAFF_JWT, CUSTOMER_JWT]) {
      TestBed.resetTestingModule();
      localStorage.clear();
      const fixture = setup(token);
      expect(text(fixture)).toContain("You don't have access to this workspace.");
      expect(text(fixture)).toContain('This workspace is for Admin accounts.');
      expect(cards(fixture).length).toBe(0);
      expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();
    }
  });

  it('a non-Admin who calls open() directly navigates nowhere', () => {
    const fixture = setup(STAFF_JWT);
    const opened: AppView[] = [];
    fixture.componentInstance.navigate.subscribe((view) => opened.push(view));

    fixture.componentInstance.open('admin-orders');
    fixture.componentInstance.open('leads');

    expect(opened).toEqual([]);
  });

  it('logging out clears the shortcuts so the next session starts clean', () => {
    const fixture = setup(ADMIN_JWT);
    expect(cards(fixture).length).toBe(5);

    TestBed.inject(AuthService).logout();
    fixture.detectChanges();

    expect(cards(fixture).length).toBe(0);
    expect(text(fixture)).toContain('Log in to access the Admin dashboard');
  });
});
