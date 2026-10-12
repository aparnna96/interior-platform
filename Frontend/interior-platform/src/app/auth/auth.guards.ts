import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../auth.service';
import { landingPathFor, pathOf, safeAdminReturnUrl, safeReturnUrl } from '../app-paths';

/**
 * Route guards. They decide which page a URL may show; the API still enforces
 * the real permissions with its own [Authorize] attributes (the client only
 * reads roles from the token for display), so these exist for a sensible
 * experience, not as a security boundary.
 */

function loginTree(router: Router, returnUrl: string): UrlTree {
  const safe = safeReturnUrl(returnUrl);
  return router.createUrlTree(['/login'], safe ? { queryParams: { returnUrl: safe } } : {});
}

/** Any logged-in user. Logged-out visitors are sent to /login and brought back afterwards. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? true : loginTree(router, state.url);
};

/**
 * FieldStaff. An Admin is sent to the same list inside the Admin area
 * (/admin/leads); other logged-in users go to their own landing page.
 */
export const staffGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return loginTree(router, state.url);
  if (auth.isAdmin() && !auth.isFieldStaff()) return router.parseUrl('/admin/leads');
  return auth.isStaff() ? true : router.parseUrl(landingPathFor(auth.roles()));
};

/** FieldStaff role only. Admins without it and customers go to their own landing page. */
export const fieldStaffGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return loginTree(router, state.url);
  return auth.isFieldStaff() ? true : router.parseUrl(landingPathFor(auth.roles()));
};

/**
 * Admin only. Visitors and every other role are sent to the Admin login page
 * (never to the customer login), with the address they wanted so the Admin
 * lands there after signing in. A plain /admin needs no return address.
 */
export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAdmin()) return true;
  const wanted = safeAdminReturnUrl(state.url);
  const useReturn = wanted !== null && pathOf(wanted) !== '/admin';
  return router.createUrlTree(['/admin/login'], useReturn ? { queryParams: { returnUrl: wanted } } : {});
};

/**
 * The Admin login page. A signed-in Admin has no use for it and goes on to the
 * page they were heading for (or the dashboard). Anyone else, including a
 * customer who is signed in, sees the page so they can log in as an Admin.
 */
export const adminLoginGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAdmin()) return true;
  return router.parseUrl(safeAdminReturnUrl(route.queryParamMap.get('returnUrl')) ?? '/admin');
};

/**
 * Login and register are for visitors only. Someone who is already logged in
 * is sent on to the page they were heading for (or their landing page).
 */
export const guestGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return true;
  const target = safeReturnUrl(route.queryParamMap.get('returnUrl')) ?? landingPathFor(auth.roles());
  return router.parseUrl(target);
};
