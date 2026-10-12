import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AUTH_TOKEN_KEY, AuthService } from '../auth.service';
import { CartService } from '../catalogue/cart.service';
import { AdminLoginComponent } from './admin-login.component';
import { environment } from '../../environments/environment';

const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;
const CART_URL = `${environment.apiBaseUrl}/api/cart`;
const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

/** Minimal unsigned JWT carrying the given roles (tests only). */
function jwt(roles: string | string[]): string {
  const enc = (v: unknown) =>
    btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ email: 'x@test.local', [ROLE_CLAIM]: roles })}.sig`;
}

describe('AdminLoginComponent', () => {
  let httpMock: HttpTestingController;
  let router: Router;
  let navigated: string[];

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminLoginComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    navigated = [];
    spyOn(router, 'navigateByUrl').and.callFake(((url: string) => {
      navigated.push(url);
      return Promise.resolve(true);
    }) as unknown as Router['navigateByUrl']);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function setup(returnUrl?: string) {
    if (returnUrl !== undefined) {
      spyOnProperty(router, 'url', 'get').and.returnValue(`/admin/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
    const fixture = TestBed.createComponent(AdminLoginComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el };
  }

  function fill(el: HTMLElement, email = 'a@test.local', password = 'secret') {
    const emailInput = el.querySelector('#admin-login-email') as HTMLInputElement;
    const passwordInput = el.querySelector('#admin-login-password') as HTMLInputElement;
    emailInput.value = email;
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event('input'));
  }

  function submit(fixture: ReturnType<typeof setup>['fixture']) {
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  describe('page', () => {
    it('has the Admin heading, labelled email and password fields and a Log in button', () => {
      const { el } = setup();
      expect(el.querySelector('h1')?.textContent).toContain('Admin log in');
      expect(el.querySelector('label[for="admin-login-email"]')?.textContent).toContain('Email');
      expect(el.querySelector('label[for="admin-login-password"]')?.textContent).toContain('Password');
      expect(el.querySelector('#admin-login-email')?.getAttribute('autocomplete')).toBe('username');
      expect(el.querySelector('#admin-login-password')?.getAttribute('autocomplete')).toBe('current-password');
      expect(el.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Log in');
    });

    it('shows the Confident Group logo and the Admin theme, with no customer links', () => {
      const { el } = setup();
      expect(el.querySelector('.al')?.classList.contains('admin-theme')).toBeTrue();
      const logo = el.querySelector('img.al-logo') as HTMLImageElement;
      expect(logo.getAttribute('src')).toBe('/branding/confident-group-horizontal.png');
      expect(logo.getAttribute('alt')).toBe('Confident Group');
      expect(el.querySelector('a')).toBeNull();
      expect(el.textContent).not.toContain('Create an account');
    });

    it('puts keyboard focus in the email field when it opens', async () => {
      const { fixture } = setup();
      await fixture.whenStable();
      expect(document.activeElement?.id).toBe('admin-login-email');
    });
  });

  describe('validation', () => {
    it('asks for both fields and sends no request when they are empty', () => {
      const { fixture, el } = setup();
      submit(fixture);
      expect(el.querySelector('#admin-login-email-error')?.textContent).toContain('Enter your email address.');
      expect(el.querySelector('#admin-login-password-error')?.textContent).toContain('Enter your password.');
      expect(el.querySelector('#admin-login-email')?.getAttribute('aria-invalid')).toBe('true');
      httpMock.expectNone(LOGIN_URL);
    });

    it('rejects an address that is not an email', () => {
      const { fixture, el } = setup();
      fill(el, 'not-an-email');
      submit(fixture);
      expect(el.querySelector('#admin-login-email-error')?.textContent).toContain('valid email');
      httpMock.expectNone(LOGIN_URL);
    });
  });

  describe('signing in', () => {
    it('an Admin goes to the dashboard when there is no return address', () => {
      const { fixture, el } = setup();
      fill(el);
      submit(fixture);
      httpMock.expectOne(LOGIN_URL).flush({ Token: jwt('Admin') });
      httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });

      expect(TestBed.inject(AuthService).isAdmin()).toBeTrue();
      expect(navigated).toEqual(['/admin']);
    });

    it('an Admin who also holds the Customer role is let in', () => {
      const { fixture, el } = setup();
      fill(el);
      submit(fixture);
      httpMock.expectOne(LOGIN_URL).flush({ Token: jwt(['Admin', 'Customer']) });
      httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
      expect(navigated).toEqual(['/admin']);
    });

    it('goes back to an Admin page named in the return address', () => {
      const { fixture, el } = setup('/admin/orders');
      fill(el);
      submit(fixture);
      httpMock.expectOne(LOGIN_URL).flush({ Token: jwt('Admin') });
      httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
      expect(navigated).toEqual(['/admin/orders']);
    });

    it('ignores a return address outside /admin', () => {
      for (const bad of ['/orders', '/', 'https://evil.example/admin', '//evil.example', '/admin/login']) {
        TestBed.resetTestingModule();
        localStorage.clear();
        TestBed.configureTestingModule({
          imports: [AdminLoginComponent],
          providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
        });
        httpMock = TestBed.inject(HttpTestingController);
        router = TestBed.inject(Router);
        navigated = [];
        spyOn(router, 'navigateByUrl').and.callFake(((url: string) => {
          navigated.push(url);
          return Promise.resolve(true);
        }) as unknown as Router['navigateByUrl']);

        const { fixture, el } = setup(bad);
        fill(el);
        submit(fixture);
        httpMock.expectOne(LOGIN_URL).flush({ Token: jwt('Admin') });
        httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
        expect(navigated).withContext(bad).toEqual(['/admin']);
        httpMock.verify();
      }
    });

    it('trims the email before sending it', () => {
      const { fixture, el } = setup();
      fill(el, '  a@test.local  ');
      submit(fixture);
      const req = httpMock.expectOne(LOGIN_URL);
      expect(req.request.body).toEqual({ email: 'a@test.local', password: 'secret' });
      req.flush({ Token: jwt('Admin') });
      httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
    });

    it('blocks a second submit while the first is in flight and says so on the button', () => {
      const { fixture, el } = setup();
      fill(el);
      submit(fixture);
      const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(button.disabled).toBeTrue();
      expect(button.textContent).toContain('Signing in');
      submit(fixture);
      httpMock.expectOne(LOGIN_URL).flush({ Token: jwt('Admin') });
      httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
    });

    it('empties the form after a successful login', () => {
      const { fixture, el } = setup();
      fill(el);
      submit(fixture);
      httpMock.expectOne(LOGIN_URL).flush({ Token: jwt('Admin') });
      httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
      fixture.detectChanges();
      expect((el.querySelector('#admin-login-password') as HTMLInputElement).value).toBe('');
    });
  });

  describe('accounts without Admin access', () => {
    for (const [who, roles] of [
      ['a customer', 'Customer'],
      ['field staff', 'FieldStaff'],
      ['an account with no role', []],
    ] as const) {
      it(`${who} is signed out again, told why, and goes nowhere`, () => {
        const { fixture, el } = setup();
        fill(el);
        submit(fixture);
        httpMock.expectOne(LOGIN_URL).flush({ Token: jwt(roles as string | string[]) });
        fixture.detectChanges();

        const auth = TestBed.inject(AuthService);
        expect(auth.isAuthenticated()).toBeFalse();
        expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
        expect(navigated).toEqual([]);
        expect(el.querySelector('[role="alert"]')?.textContent).toContain('does not have Admin access');
        // No cart is requested for a session that was just ended.
        httpMock.expectNone(CART_URL);
      });
    }
  });

  describe('failures', () => {
    it('a wrong password shows one clear message and keeps the form', () => {
      const { fixture, el } = setup();
      fill(el);
      submit(fixture);
      httpMock.expectOne(LOGIN_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
      fixture.detectChanges();

      expect(el.querySelector('[role="alert"]')?.textContent).toContain('Invalid email or password.');
      expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
      expect((el.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBeFalse();
      expect((el.querySelector('#admin-login-email') as HTMLInputElement).value).toBe('a@test.local');
      expect(navigated).toEqual([]);
    });

    it('a server error shows a plain failure message', () => {
      const { fixture, el } = setup();
      fill(el);
      submit(fixture);
      httpMock.expectOne(LOGIN_URL).flush({}, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(el.querySelector('[role="alert"]')?.textContent).toContain('Login failed. Please try again.');
    });

    it('a response without a token is a failure, not a login', () => {
      const { fixture, el } = setup();
      fill(el);
      submit(fixture);
      httpMock.expectOne(LOGIN_URL).flush({});
      fixture.detectChanges();
      expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
      expect(el.querySelector('[role="alert"]')).toBeTruthy();
      expect(navigated).toEqual([]);
    });

    it('clears an old error when the next attempt starts', () => {
      const { fixture, el } = setup();
      fill(el);
      submit(fixture);
      httpMock.expectOne(LOGIN_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
      fixture.detectChanges();
      expect(el.querySelector('[role="alert"]')).toBeTruthy();

      submit(fixture);
      expect(el.querySelector('[role="alert"]')).toBeNull();
      httpMock.expectOne(LOGIN_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    });
  });

  it('does not leave a previous customer cart behind', () => {
    const cart = TestBed.inject(CartService);
    const { fixture, el } = setup();
    spyOn(cart, 'clear').and.callThrough();
    fill(el);
    submit(fixture);
    httpMock.expectOne(LOGIN_URL).flush({ Token: jwt('Customer') });
    expect(cart.clear).toHaveBeenCalled();
  });
});
