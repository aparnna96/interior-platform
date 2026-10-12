import { CanActivateFn, Route, Routes } from '@angular/router';
import { ADMIN_RECORD_VIEWS, VIEW_ROUTES, type ViewAccess } from './app-paths';
import { adminGuard, adminLoginGuard, authGuard, fieldStaffGuard, guestGuard, staffGuard } from './auth/auth.guards';

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
  fieldstaff: [fieldStaffGuard],
  admin: [adminGuard],
  adminlogin: [adminLoginGuard],
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
  // Admin record pages: /admin/orders/:id, /admin/proposals/:id, /admin/leads/:id
  ...ADMIN_RECORD_VIEWS.map((view): Route => {
    const list = VIEW_ROUTES.find((r) => r.view === view)!;
    return {
      path: `${list.path}/:id`,
      pathMatch: 'full',
      title: list.title,
      canActivate: GUARDS.admin,
      children: [],
    };
  }),
  // An unknown address under /admin stays inside the Admin area: it goes to the
  // dashboard, and the admin guard asks visitors to log in first.
  { path: 'admin', children: [{ path: '**', redirectTo: '/admin' }] },
  // Unknown addresses land on the home page instead of a blank screen.
  { path: '**', redirectTo: '' },
];
