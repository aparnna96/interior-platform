import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { AUTH_TOKEN_KEY, AuthService } from './auth.service';
import { environment } from '../environments/environment';

const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;

/** Minimal unsigned JWT carrying the given payload (tests only). */
function jwt(payload: unknown): string {
  const enc = (v: unknown) =>
    btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc(payload)}.sig`;
}

const CUSTOMER = jwt({ email: 'c@test.local', [ROLE_CLAIM]: 'Customer' });
const STAFF = jwt({ email: 's@test.local', [ROLE_CLAIM]: 'FieldStaff' });
const ADMIN = jwt({ email: 'a@test.local', [ROLE_CLAIM]: 'Admin' });
const ADMIN_AND_STAFF = jwt({ email: 'as@test.local', [ROLE_CLAIM]: ['Admin', 'FieldStaff'] });

/**
 * Lets router navigation and effects run. Not `fixture.whenStable()`: that also
 * waits for the app's own pending HTTP requests (products, cart), which these
 * routing tests deliberately leave unflushed.
 */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }
}
describe('AppComponent routing', () => {
  let router: Router;
  let location: Location;

  async function setup(token?: string) {
    localStorage.clear();
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes),
        provideLocationMocks(),
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    // A real app runs this at bootstrap: it starts the first navigation and the
    // listener for the browser's Back/Forward buttons. TestBed does not.
    router.initialNavigation();
    await settle(fixture);
    return { fixture, app: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  async function go(fixture: ComponentFixture<unknown>, url: string) {
    await router.navigateByUrl(url);
    await settle(fixture);
  }

  afterEach(() => localStorage.clear());

  it('opening an address shows that page (deep link)', async () => {
    const { fixture, app } = await setup();
    await go(fixture, '/estimates');
    expect(app.activeView()).toBe('estimates');
    expect(location.path()).toBe('/estimates');
    await go(fixture, '/visualizer');
    expect(app.activeView()).toBe('visualizer');
  });

  it('clicking a nav entry changes the address', async () => {
    const { fixture, app, el } = await setup();
    const buttons = Array.from(el.querySelectorAll('.pubnav-links button')) as HTMLButtonElement[];
    buttons.find((b) => b.textContent?.trim() === 'Interiors')!.click();
    await settle(fixture);
    expect(app.activeView()).toBe('interiors');
    expect(location.path()).toBe('/interiors');
  });

  it('Back and Forward move between pages', async () => {
    const { fixture, app } = await setup();
    await go(fixture, '/estimates');
    await go(fixture, '/visualizer');
    location.back();
    await settle(fixture);
    expect(app.activeView()).toBe('estimates');
    location.forward();
    await settle(fixture);
    expect(app.activeView()).toBe('visualizer');
  });

  it('an unknown address lands on the home page', async () => {
    const { fixture, app } = await setup();
    await go(fixture, '/estimates');
    await go(fixture, '/no-such-page');
    expect(app.activeView()).toBe('home');
    expect(location.path()).toBe('/');
  });

  it('a product address opens its details page, and closing returns to the list address', async () => {
    const { fixture, app } = await setup();
    await go(fixture, '/furniture/sona-loveseat');
    expect(app.activeView()).toBe('catalogue');
    expect(app.routeProductId()).toBe('sona-loveseat');

    app.onProductRoute(null);
    await settle(fixture);
    expect(location.path()).toBe('/furniture');
    expect(app.routeProductId()).toBeNull();
  });

  it('sets the browser tab title per page', async () => {
    const { fixture } = await setup();
    await go(fixture, '/estimates');
    expect(document.title).toBe('Estimates | Confident Group');
  });

  describe('guards', () => {
    it('a visitor opening a private page is sent to /login with a return address', async () => {
      const { fixture, app } = await setup();
      await go(fixture, '/orders');
      expect(app.activeView()).toBe('login');
      expect(location.path()).toBe('/login?returnUrl=%2Forders');
    });

    it('an expired session on a private page is sent to login and returns afterwards', async () => {
      const { fixture, app } = await setup(CUSTOMER);
      await go(fixture, '/orders');
      expect(app.activeView()).toBe('orders');

      // What a 401 from the API does: the components call logout().
      TestBed.inject(AuthService).logout();
      await settle(fixture);

      expect(app.activeView()).toBe('login');
      expect(location.path()).toBe('/login?returnUrl=%2Forders');
    });

    it('logging out on a public page stays put', async () => {
      const { fixture, app } = await setup(CUSTOMER);
      await go(fixture, '/estimates');
      TestBed.inject(AuthService).logout();
      await settle(fixture);
      expect(app.activeView()).toBe('estimates');
    });

    it('a visitor clicking a private nav entry is sent to /login', async () => {
      const { fixture, app } = await setup();
      app.activeView.set('proposals');
      await settle(fixture);
      expect(app.activeView()).toBe('login');
      expect(location.path()).toContain('returnUrl=%2Fproposals');
    });

    it('a logged-in customer may open orders and proposals', async () => {
      const { fixture, app } = await setup(CUSTOMER);
      await go(fixture, '/orders');
      expect(app.activeView()).toBe('orders');
      await go(fixture, '/proposals');
      expect(app.activeView()).toBe('proposals');
    });

    it('a customer is kept out of staff and admin pages', async () => {
      const { fixture, app } = await setup(CUSTOMER);
      await go(fixture, '/leads');
      expect(app.activeView()).toBe('home');
      await go(fixture, '/admin/orders');
      expect(app.activeView()).toBe('home');
    });

    it('field staff may open Leads but not admin pages', async () => {
      const { fixture, app } = await setup(STAFF);
      await go(fixture, '/leads');
      expect(app.activeView()).toBe('leads');
      await go(fixture, '/admin/products');
      expect(app.activeView()).toBe('leads');
      expect(location.path()).toBe('/leads');
    });

    it('a visitor opening /field is sent to /login with a return address', async () => {
      const { fixture, app } = await setup();
      await go(fixture, '/field');
      expect(app.activeView()).toBe('login');
      expect(location.path()).toBe('/login?returnUrl=%2Ffield');
    });

    it('a customer is kept out of /field', async () => {
      const { fixture, app } = await setup(CUSTOMER);
      await go(fixture, '/field');
      expect(app.activeView()).toBe('home');
      expect(location.path()).toBe('/');
    });

    it('an admin without the FieldStaff role is sent to their own landing page from /field', async () => {
      const { fixture, app } = await setup(ADMIN);
      await go(fixture, '/field');
      expect(app.activeView()).toBe('admin-orders');
      expect(location.path()).toBe('/admin/orders');
    });

    it('field staff open /field directly on the Elevation view', async () => {
      const { fixture, app, el } = await setup(STAFF);
      await go(fixture, '/field');
      expect(app.activeView()).toBe('field');
      expect(location.path()).toBe('/field');
      expect(app.canvasTab()).toBe('elevation');
      expect(el.querySelector('app-elevation-view')).toBeTruthy();
      expect(el.querySelector('app-floor-plan')).toBeNull();
    });

    it('someone holding both the Admin and FieldStaff roles may open /field', async () => {
      const { fixture, app } = await setup(ADMIN_AND_STAFF);
      await go(fixture, '/field');
      expect(app.activeView()).toBe('field');
      expect(location.path()).toBe('/field');
    });

    it('the Elevation default returns each time /field is entered, and a tab change sticks while on it', async () => {
      const { fixture, app } = await setup(STAFF);
      await go(fixture, '/field');
      expect(app.canvasTab()).toBe('elevation');
      app.canvasTab.set('plan');
      await settle(fixture);
      expect(app.canvasTab()).toBe('plan');
      await go(fixture, '/leads');
      await go(fixture, '/field');
      expect(app.canvasTab()).toBe('elevation');
    });

    it('/visualizer stays public and opens on the 2D plan for a visitor', async () => {
      const { fixture, app, el } = await setup();
      await go(fixture, '/visualizer');
      expect(app.activeView()).toBe('visualizer');
      expect(location.path()).toBe('/visualizer');
      expect(app.canvasTab()).toBe('plan');
      expect(el.querySelector('app-floor-plan')).toBeTruthy();
    });

    it('/visualizer is unchanged for field staff: same public address, 2D plan first', async () => {
      const { fixture, app } = await setup(STAFF);
      await go(fixture, '/visualizer');
      expect(app.activeView()).toBe('visualizer');
      expect(location.path()).toBe('/visualizer');
      expect(app.canvasTab()).toBe('plan');
    });

    it('an expired session on /field goes to login and returns afterwards', async () => {
      const { fixture, app } = await setup(STAFF);
      await go(fixture, '/field');
      expect(app.activeView()).toBe('field');
      TestBed.inject(AuthService).logout();
      await settle(fixture);
      expect(app.activeView()).toBe('login');
      expect(location.path()).toBe('/login?returnUrl=%2Ffield');
    });

    it('an admin may open every admin page', async () => {
      const { fixture, app } = await setup(ADMIN);
      for (const [url, view] of [
        ['/admin/products', 'admin-products'],
        ['/admin/orders', 'admin-orders'],
        ['/admin/proposals', 'admin-proposals'],
        ['/leads', 'leads'],
      ] as const) {
        await go(fixture, url);
        expect(app.activeView()).toBe(view);
      }
    });

    it('login and register are not shown to someone already logged in', async () => {
      const { fixture, app } = await setup(CUSTOMER);
      await go(fixture, '/login');
      expect(app.activeView()).toBe('home');
      await go(fixture, '/register');
      expect(app.activeView()).toBe('home');
    });

    it('logged-in staff are sent to their landing page from /login', async () => {
      const { fixture, app } = await setup(ADMIN);
      await go(fixture, '/login');
      expect(app.activeView()).toBe('admin-orders');
    });
  });

  describe('login page', () => {
    function fillAndSubmit(el: HTMLElement) {
      const email = el.querySelector('#login-email') as HTMLInputElement;
      const password = el.querySelector('#login-password') as HTMLInputElement;
      email.value = 'c@test.local';
      email.dispatchEvent(new Event('input'));
      password.value = 'secret';
      password.dispatchEvent(new Event('input'));
      (el.querySelector('app-login form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    }

    it('logging in returns to the page the visitor wanted', async () => {
      const { fixture, el } = await setup();
      const http = TestBed.inject(HttpTestingController);
      await go(fixture, '/orders');
      expect(location.path()).toBe('/login?returnUrl=%2Forders');

      fillAndSubmit(el);
      http.expectOne(LOGIN_URL).flush({ Token: CUSTOMER });
      await settle(fixture);

      expect(location.path()).toBe('/orders');
      expect(fixture.componentInstance.activeView()).toBe('orders');
    });

    it('field staff logging in from the /field return address land on /field', async () => {
      const { fixture, el } = await setup();
      const http = TestBed.inject(HttpTestingController);
      await go(fixture, '/field');
      expect(location.path()).toBe('/login?returnUrl=%2Ffield');

      fillAndSubmit(el);
      http.expectOne(LOGIN_URL).flush({ Token: STAFF });
      await settle(fixture);

      expect(location.path()).toBe('/field');
      expect(fixture.componentInstance.activeView()).toBe('field');
    });

    it('a customer logging in from the /field return address is not let in', async () => {
      const { fixture, el } = await setup();
      const http = TestBed.inject(HttpTestingController);
      await go(fixture, '/field');

      fillAndSubmit(el);
      http.expectOne(LOGIN_URL).flush({ Token: CUSTOMER });
      await settle(fixture);

      expect(location.path()).toBe('/');
      expect(fixture.componentInstance.activeView()).toBe('home');
    });

    it('an admin logging in from the /field return address goes to the admin landing page', async () => {
      const { fixture, el } = await setup();
      const http = TestBed.inject(HttpTestingController);
      await go(fixture, '/field');

      fillAndSubmit(el);
      http.expectOne(LOGIN_URL).flush({ Token: ADMIN });
      await settle(fixture);

      expect(fixture.componentInstance.activeView()).toBe('admin-orders');
    });

    it('logging in with no return address goes to the role landing page', async () => {
      const { fixture, el } = await setup();
      const http = TestBed.inject(HttpTestingController);
      await go(fixture, '/login');

      fillAndSubmit(el);
      http.expectOne(LOGIN_URL).flush({ Token: ADMIN });
      await settle(fixture);

      expect(fixture.componentInstance.activeView()).toBe('admin-orders');
    });

    it('ignores an unsafe return address', async () => {
      const { fixture, el } = await setup();
      const http = TestBed.inject(HttpTestingController);
      await go(fixture, '/login?returnUrl=https%3A%2F%2Fevil.example%2F');

      fillAndSubmit(el);
      http.expectOne(LOGIN_URL).flush({ Token: CUSTOMER });
      await settle(fixture);

      expect(location.path()).toBe('/');
      expect(fixture.componentInstance.activeView()).toBe('home');
    });

    it('the register page links back to login and keeps the return address', async () => {
      const { fixture, el } = await setup();
      await go(fixture, '/register?returnUrl=%2Fcart');
      expect(fixture.componentInstance.activeView()).toBe('register');
      (el.querySelector('app-register-page .linklike') as HTMLButtonElement).click();
      await settle(fixture);
      expect(location.path()).toBe('/login?returnUrl=%2Fcart');
    });
  });

  describe('account page', () => {
    it('shows who is logged in and their role', async () => {
      const { fixture, el } = await setup(ADMIN);
      await go(fixture, '/account');
      expect(el.querySelector('app-account-page')?.textContent).toContain('a@test.local');
      expect(el.querySelector('app-account-page')?.textContent).toContain('Admin');
    });

    it('staff tools only appear for staff', async () => {
      const { fixture, el } = await setup(CUSTOMER);
      await go(fixture, '/account');
      expect(el.querySelector('app-account-page')?.textContent).not.toContain('Team tools');
    });

    it('Log out ends the session and returns to the home page', async () => {
      const { fixture, app, el } = await setup(CUSTOMER);
      await go(fixture, '/account');
      const logout = Array.from(el.querySelectorAll('app-account-page button')).find(
        (b) => b.textContent?.trim() === 'Log out'
      ) as HTMLButtonElement;
      logout.click();
      await settle(fixture);
      expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
      expect(app.activeView()).toBe('home');
    });

    it('a visitor opening /account is sent to login and brought back to it', async () => {
      const { fixture, app } = await setup();
      await go(fixture, '/account');
      expect(app.activeView()).toBe('login');
      expect(location.path()).toBe('/login?returnUrl=%2Faccount');
    });
  });
});
