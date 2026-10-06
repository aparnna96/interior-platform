import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../auth.service';
import { landingPathFor, safeReturnUrl } from '../app-paths';

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

/** FieldStaff or Admin. Other logged-in users go to their own landing page. */
export const staffGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return loginTree(router, state.url);
  return auth.isStaff() ? true : router.parseUrl(landingPathFor(auth.roles()));
};

/** Admin only. FieldStaff go to Leads, customers to the home page. */
export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return loginTree(router, state.url);
  return auth.isAdmin() ? true : router.parseUrl(landingPathFor(auth.roles()));
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
