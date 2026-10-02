import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY, decodeJwtRoles } from './auth.service';
import { environment } from '../environments/environment';

const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;

/** Minimal unsigned JWT carrying the given payload (tests only). */
function unsignedJwt(payload: unknown): string {
  const enc = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc(payload)}.sig`;
}

const DOTNET_ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

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

describe('AuthService role handling', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  function authedWith(payload: unknown): AuthService {
    localStorage.setItem(AUTH_TOKEN_KEY, unsignedJwt(payload));
    return new AuthService(TestBed.inject(HttpClient));
  }

  it('decodes a short role claim', () => {
    expect(decodeJwtRoles(unsignedJwt({ role: 'Admin' }))).toEqual(['Admin']);
  });

  it('decodes the .NET role claim used by the backend, string or array', () => {
    expect(decodeJwtRoles(unsignedJwt({ [DOTNET_ROLE_CLAIM]: 'FieldStaff' }))).toEqual(['FieldStaff']);
    expect(decodeJwtRoles(unsignedJwt({ [DOTNET_ROLE_CLAIM]: ['Admin', 'Customer'] }))).toEqual([
      'Admin',
      'Customer',
    ]);
  });

  it('returns no roles for anonymous, opaque or malformed tokens', () => {
    expect(decodeJwtRoles(null)).toEqual([]);
    expect(decodeJwtRoles('test-jwt')).toEqual([]);
    expect(decodeJwtRoles('not.a.jwt.at.all.')).toEqual([]);
    expect(decodeJwtRoles('a.b')).toEqual([]);
  });

  it('exposes staff sessions for Admin and FieldStaff only', () => {
    expect(authedWith({ role: 'Admin' }).isStaff()).toBe(true);
    expect(authedWith({ role: 'FieldStaff' }).isStaff()).toBe(true);
    expect(authedWith({ role: 'Customer' }).isStaff()).toBe(false);
    expect(authedWith({ [DOTNET_ROLE_CLAIM]: ['Customer'] }).isStaff()).toBe(false);
  });

  it('logout clears derived roles', () => {
    const staff = authedWith({ role: 'Admin' });
    expect(staff.roles()).toEqual(['Admin']);
    staff.logout();
    expect(staff.roles()).toEqual([]);
    expect(staff.isStaff()).toBe(false);
  });

  it('exposes admin sessions for the Admin role only', () => {
    expect(authedWith({ role: 'Admin' }).isAdmin()).toBe(true);
    expect(authedWith({ role: 'FieldStaff' }).isAdmin()).toBe(false);
    expect(authedWith({ role: 'Customer' }).isAdmin()).toBe(false);
    expect(authedWith({ [DOTNET_ROLE_CLAIM]: ['Admin'] }).isAdmin()).toBe(true);
  });

  it('reports no admin without authentication', () => {
    expect(TestBed.inject(AuthService).isAdmin()).toBe(false);
  });
});
