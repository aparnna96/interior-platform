/**
 * Single source of truth for the app's views and their URLs.
 *
 * The shell (AppComponent) keeps one `activeView` signal and the Router keeps
 * the URL in step with it, in both directions. Everything that needs to know
 * "which URL is this view" or "which view is this URL" reads this table, so
 * the route config, the guards and the shell can never disagree.
 *
 * Pure TypeScript on purpose (no Angular imports): the guards, the route
 * config and the shell all import it without creating a cycle.
 */

export type AppView =
  | 'home'
  | 'interiors'
  | 'visualizer'
  | 'catalogue'
  | 'cart'
  | 'orders'
  | 'proposals'
  | 'estimates'
  | 'projects'
  | 'leads'
  | 'admin-products'
  | 'admin-orders'
  | 'admin-proposals'
  | 'login'
  | 'register'
  | 'account';

/**
 * Who may open a view:
 * - public: anyone
 * - guest:  only visitors who are not logged in (login / register)
 * - auth:   any logged-in user
 * - staff:  FieldStaff or Admin
 * - admin:  Admin only
 *
 * Display-only on the client: the API enforces the same rules with its own
 * [Authorize] attributes, so a forged token never gains data access.
 */
export type ViewAccess = 'public' | 'guest' | 'auth' | 'staff' | 'admin';

export interface ViewRoute {
  readonly view: AppView;
  /** Router path without the leading slash ('' is the home page). */
  readonly path: string;
  /** Full document title shown in the browser tab and history. */
  readonly title: string;
  readonly access: ViewAccess;
}

export const VIEW_ROUTES: readonly ViewRoute[] = [
  { view: 'home', path: '', title: 'Confident Group | Interior Platform', access: 'public' },
  { view: 'interiors', path: 'interiors', title: 'Interiors | Confident Group', access: 'public' },
  { view: 'catalogue', path: 'furniture', title: 'Furniture | Confident Group', access: 'public' },
  { view: 'visualizer', path: 'visualizer', title: 'Visualizer | Confident Group', access: 'public' },
  { view: 'estimates', path: 'estimates', title: 'Estimates | Confident Group', access: 'public' },
  { view: 'projects', path: 'projects', title: 'Projects | Confident Group', access: 'public' },
  { view: 'cart', path: 'cart', title: 'Cart | Confident Group', access: 'public' },
  { view: 'orders', path: 'orders', title: 'Orders | Confident Group', access: 'auth' },
  { view: 'proposals', path: 'proposals', title: 'Proposals | Confident Group', access: 'auth' },
  { view: 'account', path: 'account', title: 'Account | Confident Group', access: 'auth' },
  { view: 'leads', path: 'leads', title: 'Leads | Confident Group', access: 'staff' },
  { view: 'admin-products', path: 'admin/products', title: 'Manage products | Confident Group', access: 'admin' },
  { view: 'admin-orders', path: 'admin/orders', title: 'Manage orders | Confident Group', access: 'admin' },
  { view: 'admin-proposals', path: 'admin/proposals', title: 'Manage proposals | Confident Group', access: 'admin' },
  { view: 'login', path: 'login', title: 'Log in | Confident Group', access: 'guest' },
  { view: 'register', path: 'register', title: 'Create account | Confident Group', access: 'guest' },
];

const BY_VIEW = new Map<AppView, ViewRoute>(VIEW_ROUTES.map((r) => [r.view, r]));
const BY_PATH = new Map<string, ViewRoute>(VIEW_ROUTES.map((r) => [`/${r.path}`, r]));

const PRODUCT_PATH = /^\/furniture\/([^/]+)$/;

/** Access rule for a view. */
export function accessOf(view: AppView): ViewAccess {
  return BY_VIEW.get(view)?.access ?? 'public';
}

/** True when the view needs a logged-in user (auth, staff or admin). */
export function requiresLogin(view: AppView): boolean {
  const access = accessOf(view);
  return access === 'auth' || access === 'staff' || access === 'admin';
}

/** Strips query string and fragment, keeps a leading slash, drops a trailing one. */
export function pathOf(url: string): string {
  const raw = (url ?? '').split(/[?#]/)[0] ?? '';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.length > 1 && withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
}

/**
 * URL path for a view. The furniture view can carry a product id, giving the
 * product details page its own address (/furniture/:id).
 */
export function pathForView(view: AppView, productId: string | null = null): string {
  if (view === 'catalogue' && productId) {
    return `/furniture/${encodeURIComponent(productId)}`;
  }
  const route = BY_VIEW.get(view);
  return route ? (route.path === '' ? '/' : `/${route.path}`) : '/';
}

export interface ResolvedPath {
  readonly view: AppView;
  readonly productId: string | null;
}

/** The view a URL path stands for, or null when the path is unknown. */
export function viewForPath(url: string): ResolvedPath | null {
  const path = pathOf(url);
  if (path === '/') return { view: 'home', productId: null };
  const exact = BY_PATH.get(path);
  if (exact) return { view: exact.view, productId: null };
  const product = PRODUCT_PATH.exec(path);
  if (product) {
    try {
      return { view: 'catalogue', productId: decodeURIComponent(product[1]) };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Validates a `returnUrl` query parameter before any redirect uses it.
 * Only same-site absolute paths are accepted: no other origins (`//host`,
 * `https://…`, backslash tricks), no control characters, and never the login
 * or register pages themselves (that would loop). Returns null when unsafe.
 */
export function safeReturnUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const path = pathOf(value);
  if (path === '/login' || path === '/register') return null;
  return value;
}

/** Where a user lands after logging in when there is no return URL. */
export function landingPathFor(roles: readonly string[]): string {
  if (roles.includes('Admin')) return '/admin/orders';
  if (roles.includes('FieldStaff')) return '/leads';
  return '/';
}
