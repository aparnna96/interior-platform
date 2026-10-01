import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from './auth.service';
import { environment } from '../environments/environment';

const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;

describe('AuthService token handling', () => {
  let auth: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('starts logged out with no stored token', () => {
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.token()).toBeNull();
  });

  it('login posts credentials and stores the returned token', () => {
    let received = '';
    auth.login('a@test.local', 'secret123').subscribe((t) => (received = t));
    const req = httpMock.expectOne(LOGIN_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'a@test.local', password: 'secret123' });
    req.flush({ Token: 'jwt-abc' });
    expect(received).toBe('jwt-abc');
    expect(auth.token()).toBe('jwt-abc');
    expect(auth.isAuthenticated()).toBe(true);
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('jwt-abc');
  });

  it('accepts a lowercase token field', () => {
    auth.login('a@test.local', 'secret123').subscribe();
    httpMock.expectOne(LOGIN_URL).flush({ token: 'jwt-lower' });
    expect(auth.token()).toBe('jwt-lower');
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('restores a persisted session on construction', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'persisted-jwt');
    const fresh = new AuthService(TestBed.inject(HttpClient));
    expect(fresh.isAuthenticated()).toBe(true);
    expect(fresh.token()).toBe('persisted-jwt');
  });

  it('logout clears the token and the session flag', () => {
    auth.login('a@test.local', 'secret123').subscribe();
    httpMock.expectOne(LOGIN_URL).flush({ Token: 'jwt-abc' });
    expect(auth.isAuthenticated()).toBe(true);

    auth.logout();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.token()).toBeNull();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  it('failed login stores nothing', () => {
    auth.login('a@test.local', 'wrong').subscribe({ error: () => undefined });
    httpMock.expectOne(LOGIN_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });
});
