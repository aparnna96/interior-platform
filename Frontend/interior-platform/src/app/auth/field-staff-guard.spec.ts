import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { AUTH_TOKEN_KEY } from '../auth.service';
import { fieldStaffGuard } from './auth.guards';

const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

/** Minimal unsigned JWT carrying the given roles (tests only). */
function tokenWith(roles: string | string[]): string {
  const enc = (v: unknown) =>
    btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ email: 't@test.local', [ROLE_CLAIM]: roles })}.sig`;
}

describe('fieldStaffGuard', () => {
  /** Runs the guard once for a session holding `token` (or a visitor when null). */
  function check(token: string | null, url = '/field'): { result: boolean | UrlTree; router: Router } {
    // Each call is a fresh session, so start from a fresh test module.
    TestBed.resetTestingModule();
    localStorage.clear();
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const result = TestBed.runInInjectionContext(() =>
      fieldStaffGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)
    ) as boolean | UrlTree;
    return { result, router: TestBed.inject(Router) };
  }
  const where = (r: { result: boolean | UrlTree; router: Router }) =>
    r.result instanceof UrlTree ? r.router.serializeUrl(r.result) : r.result;

  afterEach(() => localStorage.clear());

  it('lets a FieldStaff session in', () => {
    expect(check(tokenWith('FieldStaff')).result).toBe(true);
  });

  it('lets in a session that holds FieldStaff among other roles', () => {
    expect(check(tokenWith(['Customer', 'FieldStaff'])).result).toBe(true);
    expect(check(tokenWith(['Admin', 'FieldStaff'])).result).toBe(true);
  });

  it('sends a visitor to login and remembers where they were going', () => {
    expect(where(check(null, '/field'))).toBe('/login?returnUrl=%2Ffield');
  });

  it('keeps a customer out and sends them to the home page', () => {
    expect(where(check(tokenWith('Customer')))).toBe('/');
  });

  it('does not treat an Admin as FieldStaff: they go to their own landing page', () => {
    expect(where(check(tokenWith('Admin')))).toBe('/admin');
    expect(where(check(tokenWith(['Admin', 'Customer'])))).toBe('/admin');
  });

  it('treats a token with no roles, an opaque token and a malformed token as not FieldStaff', () => {
    for (const bad of [tokenWith([]), 'test-jwt', 'a.b', 'not.a.jwt.at.all.']) {
      expect(check(bad).result).not.toBe(true);
    }
  });

  it('does not match a role that only looks similar', () => {
    for (const look of ['fieldstaff', 'FIELDSTAFF', 'Field Staff', 'FieldStaff ', 'Staff']) {
      expect(check(tokenWith(look)).result).not.toBe(true);
    }
  });
});