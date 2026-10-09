import {
  ADMIN_SHELL_VIEWS,
  VIEW_ROUTES,
  accessOf,
  isAdminShellView,
  landingPathFor,
  pathForView,
  pathOf,
  requiresLogin,
  safeReturnUrl,
  viewForPath,
} from './app-paths';

describe('app paths', () => {
  it('maps every view to a unique path and back', () => {
    const paths = VIEW_ROUTES.map((r) => pathForView(r.view));
    expect(new Set(paths).size).toBe(VIEW_ROUTES.length);
    for (const r of VIEW_ROUTES) {
      expect(viewForPath(pathForView(r.view))?.view).toBe(r.view);
    }
  });

  it('uses the expected addresses', () => {
    expect(pathForView('home')).toBe('/');
    expect(pathForView('catalogue')).toBe('/furniture');
    expect(pathForView('admin-orders')).toBe('/admin/orders');
    expect(pathForView('login')).toBe('/login');
    expect(pathForView('account')).toBe('/account');
  });

  it('gives a product details page its own address', () => {
    expect(pathForView('catalogue', 'sona-loveseat')).toBe('/furniture/sona-loveseat');
    expect(viewForPath('/furniture/sona-loveseat')).toEqual({ view: 'catalogue', productId: 'sona-loveseat' });
    expect(viewForPath('/furniture')).toEqual({ view: 'catalogue', productId: null });
  });

  it('round-trips a product id that needs encoding', () => {
    const path = pathForView('catalogue', 'a b/c');
    expect(path).toBe('/furniture/a%20b%2Fc');
    expect(viewForPath(path)?.productId).toBe('a b/c');
  });

  it('ignores query strings, fragments and a trailing slash', () => {
    expect(pathOf('/orders?x=1#top')).toBe('/orders');
    expect(pathOf('/orders/')).toBe('/orders');
    expect(viewForPath('/orders/?x=1')?.view).toBe('orders');
    expect(viewForPath('/')?.view).toBe('home');
  });

  it('returns null for unknown or malformed addresses', () => {
    expect(viewForPath('/nope')).toBeNull();
    expect(viewForPath('/admin/nope')).toBeNull();
    expect(viewForPath('/administrator')).toBeNull();
    expect(viewForPath('/furniture/%E0%A4%A')).toBeNull();
  });

  it('classifies who may open each view', () => {
    expect(accessOf('home')).toBe('public');
    expect(accessOf('cart')).toBe('public');
    expect(accessOf('orders')).toBe('auth');
    expect(accessOf('proposals')).toBe('auth');
    expect(accessOf('leads')).toBe('staff');
    expect(accessOf('admin-products')).toBe('admin');
    expect(accessOf('admin-dashboard')).toBe('admin');
    expect(requiresLogin('admin-dashboard')).toBeTrue();
    expect(pathForView('admin-dashboard')).toBe('/admin');
    expect(viewForPath('/admin')?.view).toBe('admin-dashboard');
    expect(viewForPath('/admin/')?.view).toBe('admin-dashboard');
    expect(accessOf('admin-rates')).toBe('admin');
    expect(requiresLogin('admin-rates')).toBeTrue();
    expect(pathForView('admin-rates')).toBe('/admin/rates');
    expect(viewForPath('/admin/rates')?.view).toBe('admin-rates');
    expect(accessOf('login')).toBe('guest');
    expect(requiresLogin('orders')).toBeTrue();
    expect(requiresLogin('admin-orders')).toBeTrue();
    expect(requiresLogin('home')).toBeFalse();
    expect(requiresLogin('login')).toBeFalse();
  });

  it('the FieldStaff entry has its own address and access level, and /visualizer is still public', () => {
    expect(pathForView('field')).toBe('/field');
    expect(viewForPath('/field')?.view).toBe('field');
    expect(accessOf('field')).toBe('fieldstaff');
    expect(requiresLogin('field')).toBeTrue();
    expect(pathForView('visualizer')).toBe('/visualizer');
    expect(accessOf('visualizer')).toBe('public');
    expect(requiresLogin('visualizer')).toBeFalse();
  });

  describe('safeReturnUrl', () => {
    it('accepts same-site paths', () => {
      expect(safeReturnUrl('/orders')).toBe('/orders');
      expect(safeReturnUrl('/furniture/sona-loveseat')).toBe('/furniture/sona-loveseat');
      expect(safeReturnUrl('/estimates?room=1')).toBe('/estimates?room=1');
    });

    it('rejects other origins and tricks', () => {
      for (const bad of [
        'https://evil.example/',
        'http://evil.example',
        '//evil.example',
        '///evil.example',
        '/\\evil.example',
        '\\\\evil.example',
        'javascript:alert(1)',
        'orders',
        '',
        '/ok\u0000bad',
        '/ok\nbad',
      ]) {
        expect(safeReturnUrl(bad)).withContext(JSON.stringify(bad)).toBeNull();
      }
      expect(safeReturnUrl(null)).toBeNull();
      expect(safeReturnUrl(undefined)).toBeNull();
    });

    it('never returns to the login or register pages (no redirect loop)', () => {
      expect(safeReturnUrl('/login')).toBeNull();
      expect(safeReturnUrl('/login?returnUrl=%2Forders')).toBeNull();
      expect(safeReturnUrl('/register')).toBeNull();
    });
  });

  it('picks a landing page for each role', () => {
    expect(landingPathFor(['Admin'])).toBe('/admin');
    expect(landingPathFor(['Admin', 'Customer'])).toBe('/admin');
    expect(landingPathFor(['FieldStaff'])).toBe('/leads');
    expect(landingPathFor(['Customer'])).toBe('/');
    expect(landingPathFor([])).toBe('/');
  });

  it('marks exactly the Admin pages and Leads as Admin shell views', () => {
    expect([...ADMIN_SHELL_VIEWS].sort()).toEqual([
      'admin-dashboard',
      'admin-orders',
      'admin-products',
      'admin-proposals',
      'admin-rates',
      'leads',
    ]);
    for (const view of ADMIN_SHELL_VIEWS) {
      expect(isAdminShellView(view)).withContext(view).toBeTrue();
      // Each is a page that needs a staff or admin login: the shell is never a way in.
      expect(['staff', 'admin']).withContext(view).toContain(accessOf(view));
    }
    for (const view of ['home', 'account', 'orders', 'proposals', 'estimates', 'visualizer', 'field', 'login'] as const) {
      expect(isAdminShellView(view)).withContext(view).toBeFalse();
    }
  });
});
