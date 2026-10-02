import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService, AUTH_TOKEN_KEY } from '../auth.service';
import { AdminProductsComponent } from './admin-products.component';
import type { AdminProductDto } from '../catalogue/product.service';
import { environment } from '../../environments/environment';

const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
const ADMIN_URL = `${PRODUCTS_URL}/admin`;
const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;

const DOTNET_ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

/** Minimal unsigned JWT carrying role claims (tests only). */
function jwtWithRoles(roles: string[]): string {
  const enc = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ [DOTNET_ROLE_CLAIM]: roles })}.sig`;
}

const ADMIN_JWT = jwtWithRoles(['Admin']);
const STAFF_JWT = jwtWithRoles(['FieldStaff']);
const CUSTOMER_JWT = jwtWithRoles(['Customer']);

function adminRow(partial: Partial<AdminProductDto> & { id: string }): AdminProductDto {
  return {
    name: 'Aria 3-Seater Fabric Sofa',
    category: 'Sofas',
    room: 'Living Room',
    price: 42999,
    material: 'Performance Bouclé',
    finish: 'Bouclé · Warm Beige',
    blurb: 'Deep-seat bouclé sofa for everyday lounging.',
    description: 'A generous three-seater.',
    dimensions: '220 × 92 × 82 cm',
    image: 'https://example.com/aria.jpg',
    details: ['Bouclé cream upholstery', 'Solid wood frame'],
    isActive: true,
    ...partial,
  };
}

function validFormValue() {
  return {
    id: 'milo-dining-chair',
    name: 'Milo Dining Chair',
    category: 'Chairs',
    room: 'Dining',
    price: 14499,
    material: 'Oak',
    finish: 'Matte',
    blurb: 'Sturdy dining chair.',
    description: 'A comfortable dining chair for everyday use.',
    dimensions: '45 × 50 × 90 cm',
    imageUrl: 'https://example.com/milo.jpg',
    details: 'Solid oak frame\nWoven seat',
    isActive: true,
  };
}

describe('AdminProductsComponent', () => {
  let httpMock: HttpTestingController;

  function setup(token: string | null) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    TestBed.configureTestingModule({
      imports: [AdminProductsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminProductsComponent);
    fixture.detectChanges();
    return fixture;
  }

  function setupAdmin(list: AdminProductDto[]) {
    const fixture = setup(ADMIN_JWT);
    httpMock.expectOne(ADMIN_URL).flush(list);
    httpMock.verify();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify();
    localStorage.clear();
  });

  it('loads admin products with Bearer auth and renders rows', () => {
    const fixture = setupAdmin([
      adminRow({ id: 'aria-3s-sofa' }),
      adminRow({ id: 'retired-chair', name: 'Retired Chair', isActive: false }),
    ]);
    const cmp = fixture.componentInstance;
    expect(cmp.list()?.length).toBe(2);
    // Server order is preserved as returned.
    expect(cmp.list()![0].id).toBe('aria-3s-sofa');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Aria 3-Seater Fabric Sofa');
    expect(el.textContent).toContain('Sofas');
    expect(el.textContent).toContain('Living Room');
    expect(el.textContent).toContain(`₹${(42999).toLocaleString('en-IN')}`);
    expect(el.textContent).toContain('Performance Bouclé');
    expect(el.textContent).toContain('aria-3s-sofa');
    expect(el.textContent).toContain('Active');
    expect(el.textContent).toContain('Retired Chair');
    expect(el.textContent).toContain('Inactive');
    expect(el.querySelector('.product-rows')).toBeTruthy();
  });

  it('shows an empty state when the catalogue is empty', () => {
    const fixture = setupAdmin([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No products yet');
  });

  it('shows a loading state while fetching', () => {
    const fixture = setup(ADMIN_JWT);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading products');
    httpMock.expectOne(ADMIN_URL).flush([]);
  });

  it('shows list errors with a retry that reloads', () => {
    const fixture = setupAdmin([]);
    const cmp = fixture.componentInstance;
    cmp.loadProducts();
    httpMock.expectOne(ADMIN_URL).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');

    (el.querySelector('.admin-products-error button') as HTMLButtonElement).click();
    httpMock.expectOne(ADMIN_URL).flush([adminRow({ id: 'aria-3s-sofa' })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aria 3-Seater Fabric Sofa');
  });

  it('Add Product opens a blank form', () => {
    const fixture = setupAdmin([adminRow({ id: 'aria-3s-sofa' })]);
    const cmp = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('form[aria-label="Product form"]')).toBeNull();

    cmp.openCreate();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('form[aria-label="Product form"]')).toBeTruthy();
    expect(el.textContent).toContain('Add Product');
    expect(cmp.form.get('id')?.enabled).toBe(true);
  });

  it('empty submit shows validation without any request', () => {
    const fixture = setupAdmin([]);
    const cmp = fixture.componentInstance;
    cmp.openCreate();
    cmp.form.setValue({
      ...validFormValue(),
      id: '',
      name: '',
      price: 0,
      imageUrl: '',
      details: '',
    });
    cmp.submitForm();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Please complete the highlighted fields.'
    );
    httpMock.expectNone(PRODUCTS_URL);
  });

  it('invalid price and slug are rejected client-side', () => {
    const fixture = setupAdmin([]);
    const cmp = fixture.componentInstance;
    cmp.openCreate();
    cmp.form.setValue({ ...validFormValue(), id: 'BAD SLUG!!', price: -5 });
    cmp.submitForm();
    httpMock.expectNone(PRODUCTS_URL);
    expect(cmp.formError()).not.toBeNull();

    cmp.form.setValue({ ...validFormValue(), id: 'ok-slug', price: 0 });
    cmp.submitForm();
    httpMock.expectNone(PRODUCTS_URL);
  });

  it('valid create posts the backend contract and refreshes the list', () => {
    const fixture = setupAdmin([adminRow({ id: 'aria-3s-sofa' })]);
    const cmp = fixture.componentInstance;
    cmp.openCreate();
    cmp.form.setValue(validFormValue());
    cmp.submitForm();

    const req = httpMock.expectOne(PRODUCTS_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${ADMIN_JWT}`);
    expect(req.request.body).toEqual({
      id: 'milo-dining-chair',
      name: 'Milo Dining Chair',
      category: 'Chairs',
      room: 'Dining',
      price: 14499,
      material: 'Oak',
      finish: 'Matte',
      blurb: 'Sturdy dining chair.',
      description: 'A comfortable dining chair for everyday use.',
      dimensions: '45 × 50 × 90 cm',
      imageUrl: 'https://example.com/milo.jpg',
      details: ['Solid oak frame', 'Woven seat'],
      isActive: true,
    });
    req.flush(adminRow({ id: 'milo-dining-chair', name: 'Milo Dining Chair' }));
    httpMock.expectOne(ADMIN_URL).flush([
      adminRow({ id: 'aria-3s-sofa' }),
      adminRow({ id: 'milo-dining-chair', name: 'Milo Dining Chair' }),
    ]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('created.');
    expect(el.textContent).toContain('Milo Dining Chair');
    expect(el.querySelector('form[aria-label="Product form"]')).toBeNull();
  });

  it('create failure keeps the form values and shows an error', () => {
    const fixture = setupAdmin([]);
    const cmp = fixture.componentInstance;
    cmp.openCreate();
    cmp.form.setValue(validFormValue());
    cmp.submitForm();
    httpMock.expectOne(PRODUCTS_URL).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();
    // Entered data is preserved for retry; the form stays open.
    expect(cmp.form.get('name')?.value).toBe('Milo Dining Chair');
    expect(fixture.nativeElement.querySelector('form[aria-label="Product form"]')).toBeTruthy();

    cmp.submitForm();
    httpMock.expectOne(PRODUCTS_URL).flush(adminRow({ id: 'milo-dining-chair', name: 'Milo Dining Chair' }));
    httpMock.expectOne(ADMIN_URL).flush([adminRow({ id: 'milo-dining-chair', name: 'Milo Dining Chair' })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('created.');
  });

  it('edit opens pre-populated with the slug immutable', () => {
    const fixture = setupAdmin([adminRow({ id: 'aria-3s-sofa' })]);
    const cmp = fixture.componentInstance;
    cmp.openEdit(adminRow({ id: 'aria-3s-sofa' }));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Edit Product');
    expect(cmp.form.get('name')?.value).toBe('Aria 3-Seater Fabric Sofa');
    expect(cmp.form.get('price')?.value).toBe(42999);
    expect(cmp.form.get('id')?.disabled).toBe(true);
  });

  it('edit puts to the route id with the updated values', () => {
    const fixture = setupAdmin([adminRow({ id: 'aria-3s-sofa' })]);
    const cmp = fixture.componentInstance;
    cmp.openEdit(adminRow({ id: 'aria-3s-sofa' }));
    cmp.form.get('name')?.setValue('Aria Renamed Sofa');
    cmp.form.get('price')?.setValue(44999);
    cmp.submitForm();

    const req = httpMock.expectOne(`${PRODUCTS_URL}/aria-3s-sofa`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${ADMIN_JWT}`);
    expect(req.request.body).toEqual({
      name: 'Aria Renamed Sofa',
      category: 'Sofas',
      room: 'Living Room',
      price: 44999,
      material: 'Performance Bouclé',
      finish: 'Bouclé · Warm Beige',
      blurb: 'Deep-seat bouclé sofa for everyday lounging.',
      description: 'A generous three-seater.',
      dimensions: '220 × 92 × 82 cm',
      imageUrl: 'https://example.com/aria.jpg',
      details: ['Bouclé cream upholstery', 'Solid wood frame'],
      isActive: true,
    });
    expect(Object.keys(req.request.body)).not.toContain('id');
    req.flush(adminRow({ id: 'aria-3s-sofa', name: 'Aria Renamed Sofa', price: 44999 }));
    httpMock.expectOne(ADMIN_URL).flush([
      adminRow({ id: 'aria-3s-sofa', name: 'Aria Renamed Sofa', price: 44999 }),
    ]);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('updated.');
    expect(fixture.nativeElement.textContent).toContain('Aria Renamed Sofa');
  });

  it('edit failure preserves the form and shows an error', () => {
    const fixture = setupAdmin([adminRow({ id: 'aria-3s-sofa' })]);
    const cmp = fixture.componentInstance;
    cmp.openEdit(adminRow({ id: 'aria-3s-sofa' }));
    cmp.form.get('name')?.setValue('Aria Renamed Sofa');
    cmp.submitForm();
    httpMock.expectOne(`${PRODUCTS_URL}/aria-3s-sofa`).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(cmp.form.get('name')?.value).toBe('Aria Renamed Sofa');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('form[aria-label="Product form"]')).toBeTruthy();
  });

  it('active products show a deactivate action, inactive ones do not', () => {
    const fixture = setupAdmin([
      adminRow({ id: 'aria-3s-sofa' }),
      adminRow({ id: 'retired-chair', name: 'Retired Chair', isActive: false }),
    ]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[aria-label="Deactivate product Aria 3-Seater Fabric Sofa"]')).toBeTruthy();
    expect(el.querySelector('[aria-label="Deactivate product Retired Chair"]')).toBeNull();
  });

  it('deactivation requires confirmation and marks the product inactive', () => {
    const fixture = setupAdmin([adminRow({ id: 'aria-3s-sofa' })]);
    const cmp = fixture.componentInstance;

    cmp.requestDeactivate('aria-3s-sofa');
    fixture.detectChanges();
    // Nothing sent yet — confirmation is required first.
    httpMock.expectNone(`${PRODUCTS_URL}/aria-3s-sofa`);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Deactivate this product?');

    cmp.confirmDeactivate();
    const req = httpMock.expectOne(`${PRODUCTS_URL}/aria-3s-sofa`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${ADMIN_JWT}`);
    req.flush(null, { status: 204, statusText: 'No Content' });
    httpMock.expectOne(ADMIN_URL).flush([adminRow({ id: 'aria-3s-sofa', isActive: false })]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Product deactivated.');
    expect(el.textContent).toContain('Inactive');
    expect(el.querySelector('[aria-label="Deactivate product Aria 3-Seater Fabric Sofa"]')).toBeNull();
  });

  it('duplicate deactivate confirmations collapse into one request', () => {
    const fixture = setupAdmin([adminRow({ id: 'aria-3s-sofa' })]);
    const cmp = fixture.componentInstance;
    cmp.requestDeactivate('aria-3s-sofa');
    cmp.confirmDeactivate();
    cmp.confirmDeactivate();
    httpMock.expectOne(`${PRODUCTS_URL}/aria-3s-sofa`).flush(null, { status: 204, statusText: 'No Content' });
    httpMock.expectOne(ADMIN_URL).flush([adminRow({ id: 'aria-3s-sofa', isActive: false })]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Product deactivated.');
  });

  it('deactivation failure preserves state and shows an error', () => {
    const fixture = setupAdmin([adminRow({ id: 'aria-3s-sofa' })]);
    const cmp = fixture.componentInstance;
    cmp.requestDeactivate('aria-3s-sofa');
    cmp.confirmDeactivate();
    httpMock.expectOne(`${PRODUCTS_URL}/aria-3s-sofa`).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(cmp.list()![0].isActive).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeTruthy();
    // Confirmation stays open so the admin can retry.
    expect(cmp.confirmingDeactivateId()).toBe('aria-3s-sofa');
  });

  it('asks logged-out visitors to log in and calls no admin endpoints', () => {
    const fixture = setup(null);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to access the Products workspace');
    httpMock.expectNone(ADMIN_URL);
  });

  it('field staff sees access-denied and loads no admin data', () => {
    const fixture = setup(STAFF_JWT);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "You don't have access to this workspace."
    );
    expect(fixture.componentInstance.canAccess()).toBe(false);
    httpMock.expectNone(ADMIN_URL);
    httpMock.expectNone(PRODUCTS_URL);
  });

  it('customers see access-denied and load no admin data', () => {
    const fixture = setup(CUSTOMER_JWT);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "You don't have access to this workspace."
    );
    expect(fixture.componentInstance.canAccess()).toBe(false);
    httpMock.expectNone(ADMIN_URL);
    httpMock.expectNone(PRODUCTS_URL);
  });

  it('direct access attempts by non-admins issue no requests', () => {
    const fixture = setup(STAFF_JWT);
    const cmp = fixture.componentInstance;
    expect(cmp.canAccess()).toBe(false);
    cmp.loadProducts();
    cmp.openCreate();
    cmp.openEdit(adminRow({ id: 'aria-3s-sofa' }));
    cmp.submitForm();
    cmp.requestDeactivate('aria-3s-sofa');
    httpMock.expectNone(ADMIN_URL);
    httpMock.expectNone(PRODUCTS_URL);
  });

  it('403 produces an access-denied state', () => {
    const fixture = setup(ADMIN_JWT);
    httpMock.expectOne(ADMIN_URL).flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "You don't have access to this workspace."
    );
  });

  it('401 follows the existing logout/reset behavior', async () => {
    const fixture = setupAdmin([adminRow({ id: 'aria-3s-sofa' })]);
    const auth = TestBed.inject(AuthService);
    const cmp = fixture.componentInstance;

    cmp.loadProducts();
    httpMock.expectOne(ADMIN_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(cmp.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to access the Products workspace');
  });

  it('logout mid-visit clears the list so the next user starts clean', async () => {
    const fixture = setupAdmin([adminRow({ id: 'aria-3s-sofa' })]);
    expect(fixture.componentInstance.list()?.length).toBe(1);

    TestBed.inject(AuthService).logout();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.list()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Log in to access the Products workspace');
  });

  it('loads the list after a mid-visit login', async () => {
    const fixture = setup(null);
    const auth = TestBed.inject(AuthService);

    auth.login('admin@test.local', 'secret123').subscribe();
    httpMock.expectOne(LOGIN_URL).flush({ Token: ADMIN_JWT });
    await fixture.whenStable();
    fixture.detectChanges();
    // Admin session established after login: the workspace loads itself.
    httpMock.expectOne(ADMIN_URL).flush([adminRow({ id: 'aria-3s-sofa' })]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Aria 3-Seater Fabric Sofa');
  });

  it('stores no product data in browser storage', () => {
    const fixture = setupAdmin([adminRow({ id: 'aria-3s-sofa' })]);
    const cmp = fixture.componentInstance;
    const localSet = spyOn(localStorage, 'setItem').and.callThrough();
    const sessionSet = spyOn(sessionStorage, 'setItem').and.callThrough();

    cmp.openCreate();
    cmp.form.setValue(validFormValue());
    cmp.submitForm();
    httpMock.expectOne(PRODUCTS_URL).flush(adminRow({ id: 'milo-dining-chair', name: 'Milo Dining Chair' }));
    httpMock.expectOne(ADMIN_URL).flush([adminRow({ id: 'milo-dining-chair', name: 'Milo Dining Chair' })]);
    fixture.detectChanges();

    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });
});
