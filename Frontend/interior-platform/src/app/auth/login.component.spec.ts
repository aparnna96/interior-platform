import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { CartService } from '../catalogue/cart.service';
import { LoginComponent } from './login.component';
import { environment } from '../../environments/environment';

const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;
const CART_URL = `${environment.apiBaseUrl}/api/cart`;

describe('LoginComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function setup() {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    return fixture;
  }

  function fillValid(fixture: ReturnType<typeof TestBed.createComponent<LoginComponent>>) {
    fixture.componentInstance.form.setValue({ email: 'a@test.local', password: 'secret123' });
    fixture.detectChanges();
  }

  it('logs in, stores the token and loads the user cart', () => {
    const fixture = setup();
    fillValid(fixture);
    fixture.componentInstance.onSubmit();

    httpMock.expectOne(LOGIN_URL).flush({ Token: 'jwt-abc' });
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);

    // The component triggers the authenticated cart load on success.
    const cartReq = httpMock.expectOne(CART_URL);
    expect(cartReq.request.headers.get('Authorization')).toBe('Bearer jwt-abc');
    cartReq.flush({ items: [], itemCount: 0, subtotal: 0 });

    fixture.detectChanges();
    expect(fixture.componentInstance.successMessage).toContain('Logged in');
    expect(TestBed.inject(CartService).lines()).toEqual([]);
  });

  it('shows an invalid-credentials message on 401', () => {
    const fixture = setup();
    fillValid(fixture);
    fixture.componentInstance.onSubmit();
    httpMock.expectOne(LOGIN_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Invalid email or password');
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
  });

  it('does not submit an invalid form', () => {
    const fixture = setup();
    fixture.componentInstance.onSubmit();
    expect(fixture.componentInstance.form.invalid).toBe(true);
  });

  it('logs out and clears authenticated cart state', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'jwt-abc');
    const fixture = setup();
    const cart = TestBed.inject(CartService);
    httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('logged in');

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(cart.lines()).toEqual([]);
  });
});
