import { CanActivateFn, Route, Routes } from '@angular/router';
import { VIEW_ROUTES, type ViewAccess } from './app-paths';
import { adminGuard, authGuard, guestGuard, staffGuard } from './auth/auth.guards';

/**
 * Route config generated from the view table in app-paths.ts.
 *
 * The routes are componentless on purpose: the shell (AppComponent) renders
 * the views and follows the URL, so the Router's job here is addresses, the
 * back button, document titles and the guards.
 */
const GUARDS: Record<ViewAccess, CanActivateFn[]> = {
  public: [],
  guest: [guestGuard],
  auth: [authGuard],
  staff: [staffGuard],
  admin: [adminGuard],
};

export const routes: Routes = [
  ...VIEW_ROUTES.map(
    (r): Route => ({
      path: r.path,
      pathMatch: 'full',
      title: r.title,
      canActivate: GUARDS[r.access],
      children: [],
    })
  ),
  // Product details page: /furniture/:id
  { path: 'furniture/:id', pathMatch: 'full', title: 'Furniture | Confident Group', children: [] },
  // Unknown addresses land on the home page instead of a blank screen.
  { path: '**', redirectTo: '' },
];
