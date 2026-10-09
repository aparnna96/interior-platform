import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AppComponent } from './app.component';
import { AuthService, AUTH_TOKEN_KEY } from './auth.service';
import { environment } from '../environments/environment';

const ESTIMATES_URL = `${environment.apiBaseUrl}/api/estimates`;
const CART_URL = `${environment.apiBaseUrl}/api/cart`;
const RATE_URL = `${environment.apiBaseUrl}/api/estimate-rate`;

/**
 * Answers the app's estimate-rate request the way the API would (Rate Master).
 * The app asks for the rate whenever an estimate, project or visualizer page opens.
 */
function flushRate(httpMock: HttpTestingController, rate = 1500): void {
  httpMock
    .expectOne(RATE_URL)
    .flush({ ratePerSquareFoot: rate, updatedAt: '2026-10-01T00:00:00Z' });
}

/** Labels of the Admin workspace shell's navigation entries (empty when the shell is not shown). */
function shellItems(fixture: { nativeElement: unknown }): (string | undefined)[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('app-admin-layout .admin-nav-item')
  ).map((b) => (b as HTMLElement).textContent?.trim());
}

describe('AppComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      // AppComponent injects CartService → HttpClient (+ AuthService).
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'interior-platform' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('interior-platform');
  });

  it('should render brand name', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Confident Group');
  });

  it('hides the Orders nav entry while logged out', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.pubnav-links button')
    ).map((b) => (b as HTMLElement).textContent?.trim());
    expect(labels).not.toContain('Orders');
  });

  it('shows Orders when authenticated and opens the orders view', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'test-jwt');
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('.pubnav-links button')
    ) as HTMLButtonElement[];
    const ordersButton = buttons.find((b) => b.textContent?.trim() === 'Orders');
    expect(ordersButton).toBeTruthy();

    ordersButton!.click();
    fixture.detectChanges();
    const app = fixture.componentInstance;
    expect(app.activeView()).toBe('orders');
    expect(fixture.nativeElement.querySelector('app-orders')).toBeTruthy();
  });

  describe('Estimates room-estimate view', () => {
    /** Opens Estimates; the Rate Master answers with `rate`, or stays unanswered with 'pending'. */
    function openEstimates(rate: number | 'pending' = 1500) {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      const httpMock = TestBed.inject(HttpTestingController);
      app.activeView.set('estimates');
      fixture.detectChanges();
      if (rate !== 'pending') {
        flushRate(httpMock, rate);
        fixture.detectChanges();
      }
      return { fixture, app, httpMock, el: fixture.nativeElement as HTMLElement };
    }

    it('displays width, length, area, rate and estimated amount', () => {
      const { el } = openEstimates();
      expect(el.textContent).toContain('Room estimate');
      expect(el.textContent).toContain('12 ft');
      expect(el.textContent).toContain('15 ft');
      expect(el.textContent).toContain('180 sq ft');
      expect(el.textContent).toContain(`₹${(1500).toLocaleString('en-IN')} / sq ft`);
      expect(el.textContent).toContain(`₹${(270000).toLocaleString('en-IN')}`);
    });

    it('shows the pricing disclaimer, never a final quotation or demo wording', () => {
      const { el } = openEstimates();
      expect(el.textContent).toContain('Pricing is subject to confirmation.');
      expect(el.textContent).not.toContain('final quotation');
      expect(el.textContent).not.toContain('Demo rate');
      expect(el.textContent).not.toContain('DEMO');
      expect(el.textContent).not.toContain('Not final pricing');
      expect(el.textContent).toContain('Current rate');
    });

    it('uses the Admin-managed rate, not a built-in number', () => {
      const { app, el } = openEstimates(2000);
      expect(el.textContent).toContain(`₹${(2000).toLocaleString('en-IN')} / sq ft`);
      expect(el.textContent).not.toContain(`₹${(1500).toLocaleString('en-IN')} / sq ft`);
      expect(app.estimateTotal()).toBe(360000);
      expect(el.textContent).toContain(`₹${(360000).toLocaleString('en-IN')}`);
    });

    it('shows a dash instead of a rate or total until the rate has loaded', () => {
      const { app, el, httpMock, fixture } = openEstimates('pending');
      const panel = el.querySelector('section[aria-label="Room estimate"]')!;
      expect(panel.textContent).toContain('Current rate');
      expect(panel.textContent).toContain('—');
      expect(panel.textContent).not.toContain('₹0');
      expect(el.textContent).not.toContain('1,500');
      expect(app.estimateTotal()).toBe(0);

      flushRate(httpMock, 1500);
      fixture.detectChanges();
      expect(panel.textContent).toContain(`₹${(1500).toLocaleString('en-IN')} / sq ft`);
      expect(panel.textContent).toContain(`₹${(270000).toLocaleString('en-IN')}`);
    });

    it('keeps the dash, and never invents a rate, when the rate cannot be loaded', () => {
      const { app, el, httpMock, fixture } = openEstimates('pending');
      httpMock.expectOne(RATE_URL).flush(null, { status: 503, statusText: 'Service Unavailable' });
      fixture.detectChanges();

      expect(el.querySelector('section[aria-label="Room estimate"]')!.textContent).toContain('—');
      expect(el.textContent).not.toContain('1,500');
      expect(app.estimateTotal()).toBe(0);
    });

    it('asks the API for the rate once when the page opens, without credentials in the body', () => {
      const { httpMock, fixture } = openEstimates('pending');
      fixture.detectChanges();
      const req = httpMock.expectOne(RATE_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.body).toBeNull();
      req.flush({ ratePerSquareFoot: 1500, updatedAt: '2026-10-01T00:00:00Z' });
    });

    it('does not ask for the rate on pages that show no estimate', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
      httpMock.expectNone(RATE_URL);
    });

    it('dimension changes update the estimate with no reload', () => {
      const { app, fixture, el } = openEstimates();
      app.appliedWidth.set(10);
      app.appliedLength.set(20);
      fixture.detectChanges();
      expect(app.area()).toBe(200);
      expect(app.estimateTotal()).toBe(300000);
      expect(el.textContent).toContain('200 sq ft');
    });

    it('zero dimensions show ₹0 without NaN/Infinity', () => {
      const { app, fixture, el } = openEstimates();
      app.appliedWidth.set(0);
      app.appliedLength.set(15);
      fixture.detectChanges();
      const text = el.textContent ?? '';
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('Infinity');
      expect(app.area()).toBe(0);
      expect(app.estimateTotal()).toBe(0);
    });

    it('invalid dimensions never display NaN or Infinity', () => {
      const { app, fixture, el } = openEstimates();
      app.appliedWidth.set(NaN);
      app.appliedLength.set(Infinity);
      fixture.detectChanges();
      const text = el.textContent ?? '';
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('Infinity');
      expect(el.textContent).toContain('₹0');
    });

    it('visualizer input flow updates the estimate', () => {
      const { app, fixture, el } = openEstimates();
      app.onDimensionInput('width', '20');
      app.onDimensionInput('length', '10');
      app.generateRoom();
      fixture.detectChanges();
      expect(app.appliedWidth()).toBe(20);
      expect(app.appliedLength()).toBe(10);
      expect(el.textContent).toContain('200 sq ft');
      expect(el.textContent).toContain(`₹${(300000).toLocaleString('en-IN')}`);
    });
  });

  describe('Estimate persistence', () => {
    const TOKEN = 'test-jwt';
    const SAVE_URL = `${environment.apiBaseUrl}/api/estimates`;
    const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;

    function savedRow(id: string) {
      return {
        id,
        width: 12,
        length: 15,
        area: 180,
        ratePerSquareFoot: 1500,
        estimatedAmount: 270000,
        createdAt: '2026-10-01T10:00:00Z',
      };
    }

    function savedDetail() {
      // Deliberately off the local demo rate: the UI must show these.
      return {
        id: 'est-1',
        width: 12,
        length: 15,
        area: 180,
        ratePerSquareFoot: 2000,
        estimatedAmount: 360000,
        createdAt: '2026-10-01T10:00:00Z',
      };
    }

    function openEstimatesAuthed() {
      localStorage.setItem(AUTH_TOKEN_KEY, TOKEN);
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      const httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
      app.activeView.set('estimates');
      fixture.detectChanges();
      flushRate(httpMock, 1500);
      httpMock.expectOne(SAVE_URL).flush([]);
      fixture.detectChanges();
      return { fixture, app, httpMock, el: fixture.nativeElement as HTMLElement };
    }

    function savePanel(el: HTMLElement): HTMLElement | null {
      return el.querySelector('section[aria-label="Room estimate"]');
    }

    it('logged-out calculation works and save asks for login without any POST', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      const httpMock = TestBed.inject(HttpTestingController);
      app.activeView.set('estimates');
      fixture.detectChanges();

      const panel = savePanel(fixture.nativeElement as HTMLElement);
      expect(panel?.textContent).toContain('180 sq ft');
      expect(panel?.textContent).toContain('Log in to save this estimate');
      expect(panel?.querySelector('button')).toBeFalsy();

      app.saveEstimate();
      expect(app.savedEstimate()).toBeNull();
      httpMock.expectNone(SAVE_URL);
    });

    it('authenticated save posts dimensions and the visualizer furniture, and shows the server record', () => {
      const { fixture, app, httpMock, el } = openEstimatesAuthed();

      const button = savePanel(el)?.querySelector('button') as HTMLButtonElement;
      expect(button?.textContent).toContain('Save Estimate');
      button.click();

      const req = httpMock.expectOne(SAVE_URL);
      expect(req.request.method).toBe('POST');
      // The default visualizer scene places one sofa and one table.
      expect(req.request.body).toEqual({
        width: 12,
        length: 15,
        items: [
          { furnitureType: 'sofa', quantity: 1 },
          { furnitureType: 'table', quantity: 1 },
        ],
      });
      expect(Object.keys(req.request.body).sort()).toEqual(['items', 'length', 'width']);
      req.flush(savedDetail());
      httpMock.expectOne(SAVE_URL).flush([savedRow('est-1')]);
      fixture.detectChanges();

      const panel = savePanel(el);
      expect(panel?.textContent).toContain('est-1');
      expect(panel?.textContent).toContain(`₹${(360000).toLocaleString('en-IN')}`);
      expect(panel?.textContent).toContain(`₹${(2000).toLocaleString('en-IN')} / sq ft`);
      expect(app.savedEstimate()?.id).toBe('est-1');
      httpMock.verify();
    });

    it('save merges repeated pieces into type + quantity lines (never names or sizes)', () => {
      const { app, httpMock } = openEstimatesAuthed();
      app.addFurniture('chair');
      app.addFurniture('chair');
      app.addFurniture('chair');

      app.saveEstimate();

      const req = httpMock.expectOne(SAVE_URL);
      expect(req.request.body.items).toEqual([
        { furnitureType: 'sofa', quantity: 1 },
        { furnitureType: 'table', quantity: 1 },
        { furnitureType: 'chair', quantity: 3 },
      ]);
      for (const line of req.request.body.items) {
        expect(Object.keys(line).sort()).toEqual(['furnitureType', 'quantity']);
      }
      req.flush(savedDetail());
      httpMock.expectOne(SAVE_URL).flush([]);
    });

    it('duplicate save clicks produce only one POST', () => {
      const { app, httpMock } = openEstimatesAuthed();
      app.saveEstimate();
      app.saveEstimate();
      app.saveEstimate();
      httpMock.expectOne(SAVE_URL).flush(savedDetail());
      httpMock.expectOne(SAVE_URL).flush([]);
    });

    it('failed save keeps the calculation and allows retry', () => {
      const { fixture, app, httpMock, el } = openEstimatesAuthed();
      app.saveEstimate();
      httpMock
        .expectOne(SAVE_URL)
        .flush({ title: 'Width must be greater than 0.' }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();

      expect(app.savedEstimate()).toBeNull();
      expect(app.area()).toBe(180);
      expect(savePanel(el)?.textContent).toContain('Width must be greater than 0.');

      app.saveEstimate();
      httpMock.expectOne(SAVE_URL).flush(savedDetail());
      httpMock.expectOne(SAVE_URL).flush([]);
      fixture.detectChanges();
      expect(savePanel(el)?.textContent).toContain('est-1');
      httpMock.verify();
    });

    it('401 on save logs out and resets, consistently with cart behavior', async () => {
      const { fixture, app, httpMock, el } = openEstimatesAuthed();
      app.saveEstimate();
      httpMock.expectOne(SAVE_URL).flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(app.auth.isAuthenticated()).toBe(false);
      expect(app.savedEstimate()).toBeNull();
      expect(savePanel(el)?.textContent).toContain('Log in to save this estimate');
      httpMock.verify();
    });

    it('changing dimensions does not mutate the saved record', () => {
      const { app, fixture, httpMock, el } = openEstimatesAuthed();
      app.saveEstimate();
      httpMock.expectOne(SAVE_URL).flush(savedDetail());
      httpMock.expectOne(SAVE_URL).flush([]);
      fixture.detectChanges();

      app.appliedWidth.set(99);
      fixture.detectChanges();
      // Current calculation moved on; the saved snapshot did not.
      expect(el.textContent).toContain('99 ft');
      expect(savePanel(el)?.textContent).toContain('180 sq ft');
      expect(savePanel(el)?.textContent).toContain(`₹${(360000).toLocaleString('en-IN')}`);
      httpMock.verify();
    });

    it('logout clears the save state so the next user starts clean', async () => {
      const { app, fixture, httpMock, el } = openEstimatesAuthed();
      app.saveEstimate();
      httpMock.expectOne(SAVE_URL).flush(savedDetail());
      httpMock.expectOne(SAVE_URL).flush([]);
      fixture.detectChanges();
      expect(savePanel(el)?.textContent).toContain('est-1');

      app.auth.logout();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(app.savedEstimate()).toBeNull();
      expect(savePanel(el)?.textContent).toContain('Log in to save this estimate');
      httpMock.verify();
    });

    it('login while on Estimates loads the saved list', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      const httpMock = TestBed.inject(HttpTestingController);
      app.activeView.set('estimates');
      fixture.detectChanges();
      flushRate(httpMock, 1500);

      const auth = TestBed.inject(AuthService);
      auth.login('a@test.local', 'secret123').subscribe();
      httpMock.expectOne(LOGIN_URL).flush({ Token: TOKEN });
      await fixture.whenStable();
      fixture.detectChanges();
      httpMock.expectOne(SAVE_URL).flush([savedRow('est-7')]);
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain('est-7');
      httpMock.verify();
    });

    it('saved list renders server rows in the estimates view', () => {
      const { fixture, httpMock, el } = openEstimatesAuthed();
      expect(el.textContent).toContain('No saved estimates yet');

      fixture.componentInstance.savedEstimates!.loadEstimates();
      httpMock
        .expectOne(SAVE_URL)
        .flush([
          { ...savedRow('est-2'), estimatedAmount: 100500 },
          savedRow('est-1'),
        ]);
      fixture.detectChanges();

      expect(el.textContent).toContain('est-2');
      expect(el.textContent).toContain('est-1');
      expect(el.textContent).toContain(`₹${(100500).toLocaleString('en-IN')}`);
      httpMock.verify();
    });
  });

  describe('Leads workspace navigation', () => {
    const LEADS_URL = `${environment.apiBaseUrl}/api/leads`;
    const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
    const DOTNET_ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

    function jwtWithRoles(roles: string[]): string {
      const enc = (value: unknown) =>
        btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ [DOTNET_ROLE_CLAIM]: roles })}.sig`;
    }

    function createAuthedApp(roles: string[]) {
      localStorage.setItem(AUTH_TOKEN_KEY, jwtWithRoles(roles));
      const fixture = TestBed.createComponent(AppComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
      fixture.detectChanges();
      // The default home view loads the public catalogue.
      httpMock.expectOne(PRODUCTS_URL).flush([]);
      return { fixture, httpMock };
    }

    function sidebarLabels(fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>): (string | undefined)[] {
      return Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('#app-sidebar .nav-item')
      ).map((b) => (b as HTMLElement).textContent?.trim());
    }

    it('customers do not see Leads navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['Customer']);
      expect(sidebarLabels(fixture)).not.toContain('Leads');
      const mobile = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.mnav button')
      ).map((b) => (b as HTMLElement).textContent?.trim());
      expect(mobile).not.toContain('Leads');
      httpMock.verify();
    });

    it('anonymous visitors do not see Leads navigation', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      expect(sidebarLabels(fixture)).not.toContain('Leads');
    });

    it('FieldStaff sees Leads navigation and opens the workspace', () => {
      const { fixture, httpMock } = createAuthedApp(['FieldStaff']);
      expect(sidebarLabels(fixture)).toContain('Leads');

      const leadsButton = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('#app-sidebar .nav-item')
      ).find((b) => (b as HTMLElement).textContent?.trim() === 'Leads') as HTMLButtonElement;
      leadsButton.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.activeView()).toBe('leads');
      expect((fixture.nativeElement as HTMLElement).querySelector('app-leads')).toBeTruthy();
      httpMock.expectOne(LEADS_URL).flush([]);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('No leads yet');
      httpMock.verify();
    });

    it('Admin sees Leads navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      expect(sidebarLabels(fixture)).toContain('Leads');
      httpMock.verify();
    });

    it('Leads stays out of the public customer-facing navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['FieldStaff']);
      const labels = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.pubnav-links button')
      ).map((b) => (b as HTMLElement).textContent?.trim());
      expect(labels).not.toContain('Leads');
      httpMock.verify();
    });

    it('direct navigation by a customer shows access-denied and loads no lead data', () => {
      const { fixture, httpMock } = createAuthedApp(['Customer']);
      fixture.componentInstance.activeView.set('leads');
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        "You don't have access to this workspace."
      );
      httpMock.expectNone(LEADS_URL);
      httpMock.verify();
    });
  });

  describe('Admin Products workspace navigation', () => {
    const ADMIN_URL = `${environment.apiBaseUrl}/api/products/admin`;
    const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
    const ESTIMATES_URL = `${environment.apiBaseUrl}/api/estimates`;
    const DOTNET_ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

    function jwtWithRoles(roles: string[]): string {
      const enc = (value: unknown) =>
        btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ [DOTNET_ROLE_CLAIM]: roles })}.sig`;
    }

    function createAuthedApp(roles: string[]) {
      localStorage.setItem(AUTH_TOKEN_KEY, jwtWithRoles(roles));
      const fixture = TestBed.createComponent(AppComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
      fixture.detectChanges();
      // The default home view loads the public catalogue.
      httpMock.expectOne(PRODUCTS_URL).flush([]);
      return { fixture, httpMock };
    }

    function sidebarLabels(fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>): (string | undefined)[] {
      return Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('#app-sidebar .nav-item')
      ).map((b) => (b as HTMLElement).textContent?.trim());
    }

    it('Admin sees Products management navigation in the Admin shell, not in the customer menus', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      expect(sidebarLabels(fixture)).not.toContain('Manage products');
      // The mobile workspace nav renders on workspace views.
      fixture.componentInstance.activeView.set('estimates');
      fixture.detectChanges();
      httpMock.expectOne(ESTIMATES_URL).flush([]);
      flushRate(httpMock);
      fixture.detectChanges();
      const mobile = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.mnav button')
      ).map((b) => (b as HTMLElement).textContent?.trim());
      expect(mobile).not.toContain('Manage products');
      fixture.componentInstance.activeView.set('admin-products');
      fixture.detectChanges();
      httpMock.expectOne(ADMIN_URL).flush([]);
      fixture.detectChanges();
      expect(shellItems(fixture)).toContain('Products');
      httpMock.verify();
    });

    it('Field Staff does not see Products management navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['FieldStaff']);
      expect(sidebarLabels(fixture)).toContain('Leads');
      expect(sidebarLabels(fixture)).not.toContain('Manage products');
      httpMock.verify();
    });

    it('customers do not see Products management navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['Customer']);
      expect(sidebarLabels(fixture)).not.toContain('Manage products');
      httpMock.verify();
    });

    it('anonymous visitors do not see Products management navigation', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      expect(sidebarLabels(fixture)).not.toContain('Manage products');
    });

    it('Admin opens the Products workspace', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      fixture.componentInstance.activeView.set('admin-products');
      fixture.detectChanges();

      expect(fixture.componentInstance.activeView()).toBe('admin-products');
      expect((fixture.nativeElement as HTMLElement).querySelector('app-admin-layout app-admin-products')).toBeTruthy();
      httpMock.expectOne(ADMIN_URL).flush([]);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('No products yet');
      httpMock.verify();
    });

    it('Products stays out of the public customer-facing navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      const labels = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.pubnav-links button')
      ).map((b) => (b as HTMLElement).textContent?.trim());
      expect(labels).not.toContain('Products');
      expect(labels).toContain('Furniture');
      httpMock.verify();
    });

    it('direct navigation by Field Staff shows access-denied and loads no admin data', () => {
      const { fixture, httpMock } = createAuthedApp(['FieldStaff']);
      fixture.componentInstance.activeView.set('admin-products');
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        "You don't have access to this workspace."
      );
      httpMock.expectNone(ADMIN_URL);
      httpMock.verify();
    });
  });

  describe('Admin Orders workspace navigation', () => {
    const ADMIN_ORDERS_URL = `${environment.apiBaseUrl}/api/admin/orders`;
    const CUSTOMER_ORDERS_URL = `${environment.apiBaseUrl}/api/orders`;
    const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
    const ESTIMATES_URL = `${environment.apiBaseUrl}/api/estimates`;
    const DOTNET_ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

    function jwtWithRoles(roles: string[]): string {
      const enc = (value: unknown) =>
        btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ [DOTNET_ROLE_CLAIM]: roles })}.sig`;
    }

    function createAuthedApp(roles: string[]) {
      localStorage.setItem(AUTH_TOKEN_KEY, jwtWithRoles(roles));
      const fixture = TestBed.createComponent(AppComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
      fixture.detectChanges();
      // The default home view loads the public catalogue.
      httpMock.expectOne(PRODUCTS_URL).flush([]);
      return { fixture, httpMock };
    }

    function sidebarLabels(fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>): (string | undefined)[] {
      return Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('#app-sidebar .nav-item')
      ).map((b) => (b as HTMLElement).textContent?.trim());
    }

    it('Admin sees Admin Orders navigation in the Admin shell, not in the customer menus', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      expect(sidebarLabels(fixture)).not.toContain('Manage orders');
      // The mobile workspace nav renders on workspace views.
      fixture.componentInstance.activeView.set('estimates');
      fixture.detectChanges();
      httpMock.expectOne(ESTIMATES_URL).flush([]);
      flushRate(httpMock);
      fixture.detectChanges();
      const mobile = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.mnav button')
      ).map((b) => (b as HTMLElement).textContent?.trim());
      expect(mobile).not.toContain('Manage orders');
      fixture.componentInstance.activeView.set('admin-orders');
      fixture.detectChanges();
      httpMock.expectOne(ADMIN_ORDERS_URL).flush([]);
      fixture.detectChanges();
      expect(shellItems(fixture)).toContain('Orders');
      httpMock.verify();
    });

    it('Field Staff does not see Admin Orders navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['FieldStaff']);
      expect(sidebarLabels(fixture)).toContain('Leads');
      expect(sidebarLabels(fixture)).not.toContain('Manage orders');
      httpMock.verify();
    });

    it('customers do not see Admin Orders navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['Customer']);
      expect(sidebarLabels(fixture)).not.toContain('Manage orders');
      httpMock.verify();
    });

    it('anonymous visitors do not see Admin Orders navigation', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      expect(sidebarLabels(fixture)).not.toContain('Manage orders');
    });

    it('Admin opens the Orders workspace', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      fixture.componentInstance.activeView.set('admin-orders');
      fixture.detectChanges();

      expect(fixture.componentInstance.activeView()).toBe('admin-orders');
      expect((fixture.nativeElement as HTMLElement).querySelector('app-admin-layout app-admin-orders')).toBeTruthy();
      httpMock.expectOne(ADMIN_ORDERS_URL).flush([]);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('No orders yet');
      httpMock.verify();
    });

    it('Admin Orders stays out of the public customer-facing navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      const labels = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.pubnav-links button')
      ).map((b) => (b as HTMLElement).textContent?.trim());
      expect(labels).toContain('Orders');
      expect(labels).toContain('Furniture');
      httpMock.verify();
    });

    it('direct navigation by Field Staff shows access-denied and loads no admin data', () => {
      const { fixture, httpMock } = createAuthedApp(['FieldStaff']);
      fixture.componentInstance.activeView.set('admin-orders');
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        "You don't have access to this workspace."
      );
      httpMock.expectNone(ADMIN_ORDERS_URL);
      httpMock.verify();
    });

    it('customer Order History remains available', () => {
      const { fixture, httpMock } = createAuthedApp(['Customer']);
      const buttons = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.pubnav-links button')
      ) as HTMLButtonElement[];
      const ordersButton = buttons.find((b) => b.textContent?.trim() === 'Orders');
      expect(ordersButton).toBeTruthy();

      ordersButton!.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.activeView()).toBe('orders');
      expect((fixture.nativeElement as HTMLElement).querySelector('app-orders')).toBeTruthy();
      // Customer history still loads through the customer endpoint.
      httpMock.expectOne(CUSTOMER_ORDERS_URL).flush([]);
      httpMock.verify();
    });
  });

  describe('Admin Proposals workspace navigation', () => {
    const ADMIN_PROPOSALS_URL = `${environment.apiBaseUrl}/api/admin/proposals`;
    const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
    const ESTIMATES_URL = `${environment.apiBaseUrl}/api/estimates`;
    const DOTNET_ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

    function jwtWithRoles(roles: string[]): string {
      const enc = (value: unknown) =>
        btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ [DOTNET_ROLE_CLAIM]: roles })}.sig`;
    }

    function createAuthedApp(roles: string[]) {
      localStorage.setItem(AUTH_TOKEN_KEY, jwtWithRoles(roles));
      const fixture = TestBed.createComponent(AppComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
      fixture.detectChanges();
      // The default home view loads the public catalogue.
      httpMock.expectOne(PRODUCTS_URL).flush([]);
      return { fixture, httpMock };
    }

    it('Admin sees Admin Proposals navigation in the Admin shell, not in the customer menus', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[aria-label="Manage proposals"]')
      ).toBeNull();
      // The mobile workspace nav renders on workspace views.
      fixture.componentInstance.activeView.set('estimates');
      fixture.detectChanges();
      httpMock.expectOne(ESTIMATES_URL).flush([]);
      flushRate(httpMock);
      fixture.detectChanges();
      const mobile = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.mnav button')
      ).map((b) => (b as HTMLElement).textContent?.trim());
      expect(mobile).not.toContain('Manage proposals');
      fixture.componentInstance.activeView.set('admin-proposals');
      fixture.detectChanges();
      httpMock.expectOne(ADMIN_PROPOSALS_URL).flush([]);
      fixture.detectChanges();
      expect(shellItems(fixture)).toContain('Proposals');
      httpMock.verify();
    });

    it('Field Staff does not see Admin Proposals navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['FieldStaff']);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[aria-label="Manage proposals"]')
      ).toBeNull();
      httpMock.verify();
    });

    it('customers do not see Admin Proposals navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['Customer']);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[aria-label="Manage proposals"]')
      ).toBeNull();
      httpMock.verify();
    });

    it('anonymous visitors do not see Admin Proposals navigation', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[aria-label="Manage proposals"]')
      ).toBeNull();
    });

    it('Admin opens the Proposals workspace', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      fixture.componentInstance.activeView.set('admin-proposals');
      fixture.detectChanges();

      expect(fixture.componentInstance.activeView()).toBe('admin-proposals');
      expect((fixture.nativeElement as HTMLElement).querySelector('app-admin-layout app-admin-proposals')).toBeTruthy();
      httpMock.expectOne(ADMIN_PROPOSALS_URL).flush([]);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('No proposals yet');
      httpMock.verify();
    });

    it('Admin Proposals stays out of the public customer-facing navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      const labels = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.pubnav-links button')
      ).map((b) => (b as HTMLElement).textContent?.trim());
      expect(labels).toContain('Proposals');
      expect(labels).toContain('Furniture');
      httpMock.verify();
    });

    it('direct navigation by Field Staff shows access-denied and loads no admin data', () => {
      const { fixture, httpMock } = createAuthedApp(['FieldStaff']);
      fixture.componentInstance.activeView.set('admin-proposals');
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        "You don't have access to this workspace."
      );
      httpMock.expectNone(ADMIN_PROPOSALS_URL);
      httpMock.verify();
    });

    it('customer proposal screens remain unchanged', () => {
      const { fixture, httpMock } = createAuthedApp(['Customer']);
      fixture.componentInstance.activeView.set('proposals');
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('app-proposals')).toBeTruthy();
      // Customer history still loads through the customer endpoint.
      httpMock.expectOne(`${environment.apiBaseUrl}/api/proposals`).flush([]);
      httpMock.expectNone(ADMIN_PROPOSALS_URL);
      httpMock.verify();
    });
  });
  describe('Shared sidebar navigation', () => {
    const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
    const DOTNET_ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

    function jwtWithRoles(roles: string[]): string {
      const enc = (value: unknown) =>
        btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ [DOTNET_ROLE_CLAIM]: roles })}.sig`;
    }

    function createAuthedApp(roles: string[], itemCount = 0) {
      localStorage.setItem(AUTH_TOKEN_KEY, jwtWithRoles(roles));
      const fixture = TestBed.createComponent(AppComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(CART_URL).flush({ items: [], itemCount, subtotal: 0 });
      fixture.detectChanges();
      httpMock.expectOne(PRODUCTS_URL).flush([]);
      return { fixture, httpMock };
    }

    function sidebar(fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>) {
      const el = fixture.nativeElement as HTMLElement;
      return {
        items: Array.from(el.querySelectorAll('#app-sidebar .nav-item')).map((b) =>
          (b as HTMLElement).textContent?.trim()
        ),
        groups: Array.from(el.querySelectorAll('#app-sidebar .nav-label')).map((b) =>
          (b as HTMLElement).textContent?.trim()
        ),
      };
    }

    it('visitors see Cart in the sidebar but not Orders or any team tools', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const { items, groups } = sidebar(fixture);
      expect(items).toContain('Cart');
      expect(items).not.toContain('Orders');
      expect(groups).not.toContain('Operations');
    });

    it('customers see Cart and their own Orders, and no Operations group', () => {
      const { fixture, httpMock } = createAuthedApp(['Customer']);
      const { items, groups } = sidebar(fixture);
      expect(items).toContain('Cart');
      expect(items).toContain('Orders');
      expect(items).not.toContain('Manage orders');
      expect(items).not.toContain('Leads');
      expect(groups).not.toContain('Operations');
      httpMock.verify();
    });

    it('field staff get an Operations group with Leads only', () => {
      const { fixture, httpMock } = createAuthedApp(['FieldStaff']);
      const { items, groups } = sidebar(fixture);
      expect(groups).toContain('Operations');
      expect(items).toContain('Leads');
      expect(items).not.toContain('Manage products');
      expect(items).not.toContain('Manage orders');
      expect(items).not.toContain('Manage proposals');
      httpMock.verify();
    });

    it('only field staff get the Field visualizer entry, in the Operations group', () => {
      const staff = createAuthedApp(['FieldStaff']);
      expect(sidebar(staff.fixture).items).toContain('Field visualizer');
      expect(sidebar(staff.fixture).groups).toContain('Operations');
      expect(sidebar(staff.fixture).items).toContain('Visualizer');
      staff.httpMock.verify();
    });

    it('customers and plain admins do not get the Field visualizer entry', () => {
      const customer = createAuthedApp(['Customer']);
      expect(sidebar(customer.fixture).items).not.toContain('Field visualizer');
      customer.httpMock.verify();
      TestBed.resetTestingModule();
      localStorage.clear();
      TestBed.configureTestingModule({
        imports: [AppComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const admin = createAuthedApp(['Admin']);
      expect(sidebar(admin.fixture).items).not.toContain('Field visualizer');
      admin.httpMock.verify();
    });

    it('visitors do not get the Field visualizer entry', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      expect(sidebar(fixture).items).not.toContain('Field visualizer');
      expect(sidebar(fixture).items).toContain('Visualizer');
    });

    it('the Field visualizer sidebar entry opens the FieldStaff view on Elevation', () => {
      const { fixture, httpMock } = createAuthedApp(['FieldStaff']);
      const entry = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('#app-sidebar .nav-item')
      ).find((b) => (b as HTMLElement).textContent?.trim() === 'Field visualizer') as HTMLButtonElement;
      entry.click();
      fixture.detectChanges();
      fixture.detectChanges();
      expect(fixture.componentInstance.activeView()).toBe('field');
      expect(fixture.componentInstance.canvasTab()).toBe('elevation');
      expect((fixture.nativeElement as HTMLElement).querySelector('app-elevation-view')).toBeTruthy();
      flushRate(httpMock);
      httpMock.verify();
    });

    it('admins keep customer Orders and Proposals in the shared sidebar, and no Admin entries', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      const { items, groups } = sidebar(fixture);
      expect(groups).toContain('Operations');
      expect(items).toContain('Orders');
      expect(items).toContain('Proposals');
      expect(items).toContain('Leads');
      expect(items).not.toContain('Manage orders');
      expect(items).not.toContain('Manage proposals');
      expect(items).not.toContain('Manage products');
      expect(items).not.toContain('Estimate rate');
      expect(items).not.toContain('Dashboard');
      // Every sidebar entry has a unique name.
      expect(new Set(items).size).toBe(items.length);
      httpMock.verify();
    });

    it('the sidebar Cart shows the backend item count and opens the cart', () => {
      const { fixture, httpMock } = createAuthedApp(['Customer'], 3);
      const cartButton = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('#app-sidebar .nav-item')
      ).find((b) => (b as HTMLElement).getAttribute('aria-label') === 'Cart') as HTMLButtonElement;
      expect(cartButton.textContent).toContain('3');

      cartButton.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.activeView()).toBe('cart');
      expect((fixture.nativeElement as HTMLElement).querySelector('app-cart')).toBeTruthy();
      httpMock.verify();
    });

    it('the sidebar Orders entry opens the customer order history', () => {
      const { fixture, httpMock } = createAuthedApp(['Customer']);
      const ordersButton = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('#app-sidebar .nav-item')
      ).find((b) => (b as HTMLElement).textContent?.trim() === 'Orders') as HTMLButtonElement;
      ordersButton.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.activeView()).toBe('orders');
      httpMock.expectOne(`${environment.apiBaseUrl}/api/orders`).flush([]);
      httpMock.verify();
    });

    it('the mobile menu matches: Cart and Orders, with no Admin entries for admins', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      fixture.componentInstance.activeView.set('estimates');
      fixture.detectChanges();
      httpMock.expectOne(ESTIMATES_URL).flush([]);
      flushRate(httpMock);
      fixture.detectChanges();
      const mobile = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.mnav button')
      ).map((b) => (b as HTMLElement).textContent?.trim());
      expect(mobile).toContain('Cart');
      expect(mobile).toContain('Orders');
      expect(mobile).toContain('Leads');
      expect(mobile).not.toContain('Manage orders');
      expect(mobile).not.toContain('Manage products');
      expect(mobile).not.toContain('Manage proposals');
      expect(mobile).not.toContain('Estimate rate');
      expect(mobile).not.toContain('Dashboard');
      httpMock.verify();
    });

    it('only admins get the Dashboard page, in the Admin shell, with its shortcuts', () => {
      for (const roles of [['Customer'], ['FieldStaff']]) {
        TestBed.resetTestingModule();
        localStorage.clear();
        TestBed.configureTestingModule({
          imports: [AppComponent],
          providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        const other = createAuthedApp(roles);
        expect(sidebar(other.fixture).items).not.toContain('Dashboard');
        other.httpMock.verify();
      }

      TestBed.resetTestingModule();
      localStorage.clear();
      TestBed.configureTestingModule({
        imports: [AppComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      fixture.componentInstance.activeView.set('admin-dashboard');
      fixture.detectChanges();

      expect(fixture.componentInstance.activeView()).toBe('admin-dashboard');
      expect((fixture.nativeElement as HTMLElement).querySelector('app-admin-layout app-admin-dashboard')).toBeTruthy();
      // Since Stage 2 the dashboard loads its five summary figures from the existing Admin APIs.
      for (const path of ['/api/admin/orders', '/api/leads', '/api/admin/proposals', '/api/products/admin', '/api/admin/estimate-rates']) {
        httpMock.expectOne(`${environment.apiBaseUrl}${path}`).flush([]);
      }
      fixture.detectChanges();
      // A dashboard shortcut moves the shell to that page.
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('app-admin-dashboard .action-card')!.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.activeView()).toBe('admin-products');
      // The Products page loads its own list; leaving the dashboard asks for nothing else.
      httpMock.expectOne(`${environment.apiBaseUrl}/api/products/admin`).flush([]);
      httpMock.verify();
    });
  });
  describe('Admin workspace shell', () => {
    const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;
    const DOTNET_ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
    type AppFixture = ReturnType<typeof TestBed.createComponent<AppComponent>>;

    function jwtWithRoles(roles: string[]): string {
      const enc = (value: unknown) =>
        btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ email: 'owner@confident.test', [DOTNET_ROLE_CLAIM]: roles })}.sig`;
    }

    function createAuthedApp(roles: string[]) {
      localStorage.setItem(AUTH_TOKEN_KEY, jwtWithRoles(roles));
      const fixture = TestBed.createComponent(AppComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
      fixture.detectChanges();
      httpMock.expectOne(PRODUCTS_URL).flush([]);
      return { fixture, httpMock, app: fixture.componentInstance };
    }

    /** Answers whatever the page just opened asked for (the lists are empty; this suite is about layout). */
    function answerAll(fixture: AppFixture, httpMock: HttpTestingController): void {
      for (const request of httpMock.match(() => true)) request.flush([]);
      fixture.detectChanges();
    }

    function open(fixture: AppFixture, httpMock: HttpTestingController, view: Parameters<AppFixture['componentInstance']['activeView']['set']>[0]): void {
      fixture.componentInstance.activeView.set(view);
      fixture.detectChanges();
      answerAll(fixture, httpMock);
    }

    const el = (fixture: AppFixture) => fixture.nativeElement as HTMLElement;
    const hasShell = (fixture: AppFixture) => el(fixture).querySelector('app-admin-layout') !== null;
    const hasCustomerChrome = (fixture: AppFixture) =>
      el(fixture).querySelector('#app-sidebar') !== null || el(fixture).querySelector('header.pubnav') !== null;

    it('gives an Admin the Admin shell on every Admin page, in place of the customer layout', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      for (const view of ['admin-dashboard', 'admin-products', 'admin-orders', 'admin-proposals', 'admin-rates', 'leads'] as const) {
        open(fixture, httpMock, view);
        expect(hasShell(fixture)).withContext(view).toBeTrue();
        expect(hasCustomerChrome(fixture)).withContext(view).toBeFalse();
        expect(el(fixture).querySelector('footer.statusbar')).withContext(view).toBeNull();
      }
      httpMock.verify();
    });

    it('shows each Admin page inside the shell content area', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      const pages = [
        ['admin-dashboard', 'app-admin-dashboard'],
        ['admin-products', 'app-admin-products'],
        ['admin-orders', 'app-admin-orders'],
        ['admin-proposals', 'app-admin-proposals'],
        ['admin-rates', 'app-admin-rates'],
        ['leads', 'app-leads'],
      ] as const;
      for (const [view, tag] of pages) {
        open(fixture, httpMock, view);
        expect(el(fixture).querySelector(`app-admin-layout main#admin-main ${tag}`)).withContext(view).toBeTruthy();
      }
      httpMock.verify();
    });

    it('keeps the customer layout for an Admin on customer pages', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      for (const view of ['home', 'account'] as const) {
        open(fixture, httpMock, view);
        expect(hasShell(fixture)).withContext(view).toBeFalse();
        expect(el(fixture).querySelector('header.pubnav')).withContext(view).toBeTruthy();
      }
      httpMock.verify();
    });

    describe('Admin link in the customer navigation', () => {
      const desktopLabels = (fixture: AppFixture) =>
        Array.from(el(fixture).querySelectorAll('.pubnav-links button')).map((b) => b.textContent?.trim());
      const menuLabels = (fixture: AppFixture) =>
        Array.from(el(fixture).querySelectorAll('.pubmenu button')).map((b) => b.textContent?.trim());
      const openMenu = (fixture: AppFixture, app: AppComponent) => {
        app.openDrawer();
        fixture.detectChanges();
      };

      it('shows Admin in the desktop navbar and the mobile menu for an Admin, placed after Account', () => {
        const { fixture, httpMock, app } = createAuthedApp(['Admin']);
        const desk = desktopLabels(fixture);
        expect(desk).toContain('Admin');
        expect(desk.indexOf('Admin')).toBe(desk.indexOf('Account') + 1);
        openMenu(fixture, app);
        const menu = menuLabels(fixture);
        expect(menu).toContain('Admin');
        expect(menu.indexOf('Admin')).toBe(menu.indexOf('Account') + 1);
        httpMock.verify();
      });

      it('shows Admin to an Admin who also holds the Customer role', () => {
        const { fixture, httpMock } = createAuthedApp(['Admin', 'Customer']);
        expect(desktopLabels(fixture)).toContain('Admin');
        httpMock.verify();
      });

      it('hides Admin from a Customer, in both menus', () => {
        const { fixture, httpMock, app } = createAuthedApp(['Customer']);
        expect(desktopLabels(fixture)).not.toContain('Admin');
        openMenu(fixture, app);
        expect(menuLabels(fixture)).not.toContain('Admin');
        httpMock.verify();
      });

      it('hides Admin from Field Staff without the Admin role, in both menus', () => {
        const { fixture, httpMock, app } = createAuthedApp(['FieldStaff']);
        expect(desktopLabels(fixture)).not.toContain('Admin');
        openMenu(fixture, app);
        expect(menuLabels(fixture)).not.toContain('Admin');
        httpMock.verify();
      });

      it('hides Admin from a visitor who is not logged in', () => {
        const fixture = TestBed.createComponent(AppComponent);
        fixture.detectChanges();
        expect(desktopLabels(fixture)).not.toContain('Admin');
        fixture.componentInstance.openDrawer();
        fixture.detectChanges();
        expect(menuLabels(fixture)).not.toContain('Admin');
      });

      it('does not infer Admin from an email address, a name or any other non-role field', () => {
        localStorage.setItem(
          AUTH_TOKEN_KEY,
          `${btoa('{"alg":"none"}')}.${btoa(JSON.stringify({ email: 'admin@confident.test', name: 'Admin', unique_name: 'admin', scope: 'Admin', groups: ['Admin'] }))}.sig`
        );
        const fixture = TestBed.createComponent(AppComponent);
        const httpMock = TestBed.inject(HttpTestingController);
        httpMock.expectOne(CART_URL).flush({ items: [], itemCount: 0, subtotal: 0 });
        fixture.detectChanges();
        httpMock.expectOne(PRODUCTS_URL).flush([]);
        expect(desktopLabels(fixture)).not.toContain('Admin');
        httpMock.verify();
      });

      it('opens the dashboard in the Admin shell from the desktop link', () => {
        const { fixture, httpMock, app } = createAuthedApp(['Admin']);
        Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('.pubnav-links button'))
          .find((b) => b.textContent?.trim() === 'Admin')!
          .click();
        fixture.detectChanges();
        answerAll(fixture, httpMock);
        expect(app.activeView()).toBe('admin-dashboard');
        expect(hasShell(fixture)).toBeTrue();
        httpMock.verify();
      });

      it('opens the dashboard from the mobile menu link and closes the menu', () => {
        const { fixture, httpMock, app } = createAuthedApp(['Admin']);
        openMenu(fixture, app);
        Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('.pubmenu button'))
          .find((b) => b.textContent?.trim() === 'Admin')!
          .click();
        fixture.detectChanges();
        answerAll(fixture, httpMock);
        expect(app.activeView()).toBe('admin-dashboard');
        expect(app.drawerOpen()).toBeFalse();
        expect(hasShell(fixture)).toBeTrue();
        httpMock.verify();
      });

      it('leaves the rest of the customer navigation exactly as it was', () => {
        const { fixture, httpMock } = createAuthedApp(['Admin']);
        expect(desktopLabels(fixture).filter((l) => l !== 'Admin')).toEqual([
          'Home', 'Interiors', 'Furniture', 'Visualizer', 'Estimates', 'Projects', 'Cart', 'Orders', 'Proposals', 'Account',
        ]);
        httpMock.verify();
      });

      it('does not appear once the Admin shell is showing (the shell has its own navigation)', () => {
        const { fixture, httpMock } = createAuthedApp(['Admin']);
        open(fixture, httpMock, 'admin-orders');
        expect(el(fixture).querySelector('.pubnav-links')).toBeNull();
        httpMock.verify();
      });
    });

    it('never gives a Customer the shell, even for an Admin address', () => {
      const { fixture, httpMock } = createAuthedApp(['Customer']);
      fixture.componentInstance.activeView.set('admin-dashboard');
      fixture.detectChanges();
      expect(hasShell(fixture)).toBeFalse();
      expect(el(fixture).textContent).toContain("You don't have access to this workspace.");
      httpMock.verify();
    });

    it('keeps Field Staff on the workspace layout on Leads', () => {
      const { fixture, httpMock } = createAuthedApp(['FieldStaff']);
      open(fixture, httpMock, 'leads');
      expect(hasShell(fixture)).toBeFalse();
      expect(el(fixture).querySelector('#app-sidebar')).toBeTruthy();
      expect(el(fixture).querySelector('app-leads')).toBeTruthy();
      httpMock.verify();
    });

    it('keeps Field Staff on the workspace layout on the Field visualizer', () => {
      const { fixture, httpMock } = createAuthedApp(['FieldStaff']);
      fixture.componentInstance.activeView.set('field');
      fixture.detectChanges();
      fixture.detectChanges();
      expect(hasShell(fixture)).toBeFalse();
      expect(el(fixture).querySelector('#app-sidebar')).toBeTruthy();
      expect(el(fixture).querySelector('app-elevation-view')).toBeTruthy();
      flushRate(httpMock);
      httpMock.verify();
    });

    it('with both roles: the Admin shell on Leads, the workspace layout on the Field visualizer', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin', 'FieldStaff']);
      open(fixture, httpMock, 'leads');
      expect(hasShell(fixture)).toBeTrue();
      fixture.componentInstance.activeView.set('field');
      fixture.detectChanges();
      fixture.detectChanges();
      expect(hasShell(fixture)).toBeFalse();
      expect(el(fixture).querySelector('#app-sidebar')).toBeTruthy();
      flushRate(httpMock);
      httpMock.verify();
    });

    it('takes the Admin entries out of the shared sidebar and mobile menu on every page', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      open(fixture, httpMock, 'home');
      const sidebarLabels = Array.from(el(fixture).querySelectorAll('#app-sidebar .nav-item')).map((b) => b.textContent?.trim());
      for (const gone of ['Dashboard', 'Manage products', 'Manage orders', 'Manage proposals', 'Estimate rate']) {
        expect(sidebarLabels).withContext(gone).not.toContain(gone);
      }
      httpMock.verify();
    });

    it('navigates between Admin pages from the shell and tracks the current page', () => {
      const { fixture, httpMock, app } = createAuthedApp(['Admin']);
      open(fixture, httpMock, 'admin-dashboard');
      const click = (label: string) => {
        const item = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('app-admin-layout .admin-nav-item')).find(
          (b) => b.textContent?.trim() === label
        )!;
        item.click();
        fixture.detectChanges();
        answerAll(fixture, httpMock);
      };
      const current = () =>
        Array.from(el(fixture).querySelectorAll('app-admin-layout .admin-nav-item[aria-current="page"]')).map((b) => b.textContent?.trim());

      expect(current()).toEqual(['Dashboard']);
      click('Products');
      expect(app.activeView()).toBe('admin-products');
      expect(current()).toEqual(['Products']);
      click('Leads');
      expect(app.activeView()).toBe('leads');
      expect(current()).toEqual(['Leads']);
      click('Estimate rate');
      expect(app.activeView()).toBe('admin-rates');
      expect(current()).toEqual(['Estimate rate']);
      httpMock.verify();
    });

    it('"View customer site" goes to the customer Home layout', () => {
      const { fixture, httpMock, app } = createAuthedApp(['Admin']);
      open(fixture, httpMock, 'admin-orders');
      Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('app-admin-layout .admin-nav-item'))
        .find((b) => b.textContent?.trim() === 'View customer site')!
        .click();
      fixture.detectChanges();
      answerAll(fixture, httpMock);
      expect(app.activeView()).toBe('home');
      expect(hasShell(fixture)).toBeFalse();
      expect(el(fixture).querySelector('header.pubnav')).toBeTruthy();
      httpMock.verify();
    });

    it('"Account" opens the account page in the customer layout', () => {
      const { fixture, httpMock, app } = createAuthedApp(['Admin']);
      open(fixture, httpMock, 'admin-orders');
      Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('app-admin-layout .admin-nav-item'))
        .find((b) => b.textContent?.trim() === 'Account')!
        .click();
      fixture.detectChanges();
      answerAll(fixture, httpMock);
      expect(app.activeView()).toBe('account');
      expect(hasShell(fixture)).toBeFalse();
      httpMock.verify();
    });

    it('"Log out" ends the session and lands on Home in the customer layout', () => {
      const { fixture, httpMock, app } = createAuthedApp(['Admin']);
      open(fixture, httpMock, 'admin-dashboard');
      Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('app-admin-layout .admin-nav-item'))
        .find((b) => b.textContent?.trim() === 'Log out')!
        .click();
      fixture.detectChanges();
      answerAll(fixture, httpMock);
      expect(app.auth.isAuthenticated()).toBeFalse();
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
      expect(app.activeView()).toBe('home');
      expect(hasShell(fixture)).toBeFalse();
      httpMock.verify();
    });

    it('opens the shell drawer without touching the customer menu state', () => {
      const { fixture, httpMock, app } = createAuthedApp(['Admin']);
      open(fixture, httpMock, 'admin-dashboard');
      el(fixture).querySelector<HTMLButtonElement>('app-admin-layout .admin-menu-btn')!.click();
      fixture.detectChanges();
      expect(el(fixture).querySelector('app-admin-layout .admin-shell')!.classList.contains('drawer-open')).toBeTrue();
      expect(app.drawerOpen()).toBeFalse();
      httpMock.verify();
    });

    it('drops the Admin shell when the session ends on an Admin page', () => {
      const { fixture, httpMock, app } = createAuthedApp(['Admin']);
      open(fixture, httpMock, 'admin-products');
      // What a 401 from the API does: the page calls logout() but does not move.
      app.auth.logout();
      fixture.detectChanges();
      expect(hasShell(fixture)).toBeFalse();
      httpMock.verify();
    });
  });
  describe('Add to Visualizer from a product page', () => {
    function createApp() {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      return { fixture, app: fixture.componentInstance };
    }

    it('places the matching piece in the room plan and opens the Visualizer', () => {
      const { fixture, app } = createApp();
      const before = app.placed().length;

      app.onVisualizerRequested('Chairs');
      fixture.detectChanges();

      expect(app.activeView()).toBe('visualizer');
      expect(app.placed().length).toBe(before + 1);
      expect(app.placed()[app.placed().length - 1].defId).toBe('chair');
    });

    it('maps every catalogue category to a Visualizer piece', () => {
      const { app } = createApp();
      const expected: Record<string, string> = {
        Sofas: 'sofa', Beds: 'bed', Tables: 'table', Chairs: 'chair', Wardrobes: 'wardrobe',
      };
      for (const [category, piece] of Object.entries(expected)) {
        const n = app.placed().length;
        app.onVisualizerRequested(category);
        expect(app.placed()[n].defId).toBe(piece);
      }
    });

    it('an unknown category still opens the Visualizer without adding anything', () => {
      const { app } = createApp();
      const n = app.placed().length;
      app.onVisualizerRequested('Lamps');
      expect(app.activeView()).toBe('visualizer');
      expect(app.placed().length).toBe(n);
    });
  });

  describe('Visualizer Elevation tab', () => {
    function openVisualizer() {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      app.activeView.set('visualizer');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const tab = (label: string) =>
        Array.from(el.querySelectorAll<HTMLButtonElement>('.seg button')).find(
          (b) => b.textContent?.trim() === label
        )!;
      return { fixture, app, el, tab };
    }

    it('offers 2D Plan, Elevation and Perspective, and starts on the plan', () => {
      const { app, el } = openVisualizer();
      const labels = Array.from(el.querySelectorAll('.seg button')).map((b) => b.textContent?.trim());
      expect(labels).toEqual(['2D Plan', 'Elevation', 'Perspective']);
      expect(app.canvasTab()).toBe('plan');
      expect(el.querySelector('app-floor-plan')).toBeTruthy();
      expect(el.querySelector('app-elevation-view')).toBeNull();
    });

    it('the Elevation tab shows the elevation and hides the plan and Perspective', () => {
      const { fixture, app, el, tab } = openVisualizer();
      tab('Elevation').click();
      fixture.detectChanges();
      expect(app.canvasTab()).toBe('elevation');
      expect(el.querySelector('app-elevation-view')).toBeTruthy();
      expect(el.querySelector('app-floor-plan')).toBeNull();
      expect(el.querySelector('app-room-visualizer')).toBeNull();
      expect(tab('Elevation').classList.contains('active')).toBe(true);
    });

    it('the plan and Perspective tabs still work after visiting Elevation', () => {
      const { fixture, el, tab } = openVisualizer();
      tab('Elevation').click();
      fixture.detectChanges();
      tab('Perspective').click();
      fixture.detectChanges();
      expect(el.querySelector('app-room-visualizer')).toBeTruthy();
      expect(el.querySelector('app-elevation-view')).toBeNull();
      tab('2D Plan').click();
      fixture.detectChanges();
      expect(el.querySelector('app-floor-plan')).toBeTruthy();
    });

    it('draws the default sofa and table from the same furniture the plan uses', () => {
      const { fixture, el, tab } = openVisualizer();
      tab('Elevation').click();
      fixture.detectChanges();
      const types = Array.from(el.querySelectorAll('app-elevation-view .piece')).map((p) => p.getAttribute('data-type'));
      expect(types.sort()).toEqual(['sofa', 'table']);
    });

    it('a newly added piece appears in the elevation', () => {
      const { fixture, app, el, tab } = openVisualizer();
      tab('Elevation').click();
      app.addFurniture('bed');
      fixture.detectChanges();
      const types = Array.from(el.querySelectorAll('app-elevation-view .piece')).map((p) => p.getAttribute('data-type'));
      expect(types).toContain('bed');
      expect(types.length).toBe(3);
    });

    it('Generate Room updates the wall length shown in the elevation', () => {
      const { fixture, app, el, tab } = openVisualizer();
      tab('Elevation').click();
      app.onDimensionInput('width', '20');
      app.onDimensionInput('length', '10');
      app.generateRoom();
      fixture.detectChanges();
      expect(el.querySelector('app-elevation-view .dim-top')!.textContent).toContain('20 ft');
    });

    it('selecting a piece in the elevation selects it for the move controls', () => {
      const { fixture, app, el, tab } = openVisualizer();
      tab('Elevation').click();
      fixture.detectChanges();
      el.querySelector<HTMLButtonElement>('app-elevation-view .piece[data-type="table"]')!.click();
      fixture.detectChanges();
      expect(app.selectedItemId()).toBe('f-table-1');
      expect(el.querySelector('.quick-move')!.textContent).toContain('Table');
    });

    it('choosing a wall changes the elevation and resetting the workspace returns to the top wall', () => {
      const { fixture, app, el, tab } = openVisualizer();
      tab('Elevation').click();
      fixture.detectChanges();
      Array.from(el.querySelectorAll<HTMLButtonElement>('app-elevation-view .wall-tab'))
        .find((b) => b.textContent?.trim() === 'Bottom wall')!
        .click();
      fixture.detectChanges();
      expect(app.elevationWall()).toBe('bottom');
      expect(el.querySelector('app-elevation-view .opening')!.getAttribute('data-kind')).toBe('door');
      app.resetWorkspace();
      expect(app.elevationWall()).toBe('top');
    });

    it('uses the selected wall colour and the 9 ft default ceiling', () => {
      const { fixture, app, el, tab } = openVisualizer();
      tab('Elevation').click();
      app.selectedWall.set(app.walls[5]);
      fixture.detectChanges();
      expect(app.ceilingHeight()).toBe(9);
      const frame = el.querySelector<HTMLElement>('app-elevation-view .elev')!;
      expect(frame.style.getPropertyValue('--wall')).toBe(app.walls[5].value);
      expect(el.querySelector('app-elevation-view .dim-side')!.textContent).toContain('9 ft');
    });

    it('starts with the default textures and shows texture chips under each finish tab', () => {
      const { fixture, app, el } = openVisualizer();
      expect([app.wallPatternId(), app.floorPatternId(), app.fabricPatternId()]).toEqual(['plain', 'classic', 'plain']);
      const tabButtons = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.tabs button'));
      for (const [tab, label, count] of [['Walls', 'Wall', 4], ['Floor', 'Floor', 5], ['Fabric', 'Fabric', 5]] as const) {
        tabButtons().find((b) => b.textContent?.trim() === tab)!.click();
        fixture.detectChanges();
        const group = el.querySelector(`app-texture-chips [role=group][aria-label="${label} texture"]`);
        expect(group).toBeTruthy();
        expect(group!.querySelectorAll('.tex-chip').length).toBe(count);
      }
      tabButtons().find((b) => b.textContent?.trim() === 'Light')!.click();
      fixture.detectChanges();
      expect(el.querySelector('app-texture-chips')).toBeNull();
    });

    it('tapping a texture chip changes only the texture, not the colour', () => {
      const { fixture, app, el } = openVisualizer();
      const colourBefore = app.selectedFloor().value;
      Array.from(el.querySelectorAll<HTMLButtonElement>('.tabs button')).find((b) => b.textContent?.trim() === 'Floor')!.click();
      fixture.detectChanges();
      el.querySelector<HTMLButtonElement>('[data-pattern=herringbone]')!.click();
      fixture.detectChanges();
      expect(app.floorPatternId()).toBe('herringbone');
      expect(app.selectedFloor().value).toBe(colourBefore);
      // and picking a new colour keeps the chosen texture
      app.selectedFloor.set(app.floors[2]);
      fixture.detectChanges();
      expect(app.floorPatternId()).toBe('herringbone');
    });

    it('the plan and the elevation receive the chosen textures', () => {
      const { fixture, app, el, tab } = openVisualizer();
      app.floorPatternId.set('tile');
      app.fabricPatternId.set('velvet');
      app.wallPatternId.set('slats');
      fixture.detectChanges();
      expect(el.querySelector<HTMLElement>('app-floor-plan .floor-tex')!.style.backgroundImage).toContain('linear-gradient');
      expect(el.querySelector<HTMLElement>('app-floor-plan .plan')!.style.getPropertyValue('--fabric-fill')).toBe('url(#fab-velvet)');
      tab('Elevation').click();
      fixture.detectChanges();
      expect(el.querySelector<HTMLElement>('app-elevation-view .elev-wall')!.style.backgroundImage).toContain('repeating-linear-gradient');
      expect(el.querySelector<HTMLElement>('app-elevation-view .elev')!.style.getPropertyValue('--fabric-fill')).toBe('url(#fab-velvet)');
    });

    it('Perspective is unchanged by textures', () => {
      const { fixture, app, el, tab } = openVisualizer();
      tab('Perspective').click();
      fixture.detectChanges();
      const before = el.querySelector('app-room-visualizer')!.innerHTML;
      app.floorPatternId.set('plank');
      app.wallPatternId.set('stripe');
      app.fabricPatternId.set('weave');
      fixture.detectChanges();
      expect(el.querySelector('app-room-visualizer')!.innerHTML).toBe(before);
    });

    it('resetting the workspace restores the default textures', () => {
      const { app } = openVisualizer();
      app.wallPatternId.set('stripe');
      app.floorPatternId.set('tile');
      app.fabricPatternId.set('linen');
      app.resetWorkspace();
      expect([app.wallPatternId(), app.floorPatternId(), app.fabricPatternId()]).toEqual(['plain', 'classic', 'plain']);
    });
    it('the FieldStaff view opens the same workspace on the Elevation tab', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      app.activeView.set('field');
      fixture.detectChanges();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(app.canvasTab()).toBe('elevation');
      expect(el.querySelector('app-elevation-view')).toBeTruthy();
      expect(el.querySelector('app-floor-plan')).toBeNull();
      expect(el.querySelector('input[aria-label="Room width in feet"]')).toBeTruthy();
      expect(el.querySelector('input[aria-label="Ceiling height in feet"]')).toBeTruthy();
      expect(el.querySelectorAll('.seg button').length).toBe(3);
    });

    it('the public Visualizer still starts on the 2D plan', () => {
      const { app } = openVisualizer();
      expect(app.activeView()).toBe('visualizer');
      expect(app.canvasTab()).toBe('plan');
    });

    describe('ceiling height', () => {
      const INPUT = 'input[aria-label="Ceiling height in feet"]';

      function type(el: HTMLElement, fixture: { detectChanges(): void }, value: string): void {
        const input = el.querySelector<HTMLInputElement>(INPUT)!;
        input.value = value;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
      }

      it('shows a ceiling height field that starts at 9 ft and allows 7 to 14 ft', () => {
        const { el } = openVisualizer();
        const input = el.querySelector<HTMLInputElement>(INPUT)!;
        expect(input).toBeTruthy();
        expect(Number(input.value)).toBe(9);
        expect(input.getAttribute('min')).toBe('7');
        expect(input.getAttribute('max')).toBe('14');
        expect(input.getAttribute('aria-describedby')).toBe('ceiling-hint');
        expect(el.querySelector('#ceiling-hint')!.textContent).toContain('7 to 14 ft');
      });

      it('typing a value changes nothing until Generate Room is pressed', () => {
        const { fixture, app, el } = openVisualizer();
        type(el, fixture, '11');
        expect(app.draftCeiling()).toBe(11);
        expect(app.ceilingHeight()).toBe(9);
      });

      it('Generate Room applies the ceiling to the Elevation view', () => {
        const { fixture, app, el, tab } = openVisualizer();
        tab('Elevation').click();
        type(el, fixture, '11');
        Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
          .find((b) => b.textContent?.trim() === 'Generate Room')!
          .click();
        fixture.detectChanges();
        expect(app.ceilingHeight()).toBe(11);
        expect(app.roomError()).toBe('');
        expect(el.querySelector('app-elevation-view .dim-side')!.textContent).toContain('11 ft');
        expect(el.querySelector('app-elevation-view .elev')!.getAttribute('aria-label')).toContain('11 feet high');
      });

      it('accepts both ends of the range', () => {
        const { app } = openVisualizer();
        for (const v of [7, 14]) {
          app.draftCeiling.set(v);
          app.generateRoom();
          expect(app.ceilingHeight()).toBe(v);
          expect(app.roomError()).toBe('');
        }
      });

      it('rounds to one decimal place like the room size', () => {
        const { app } = openVisualizer();
        app.draftCeiling.set(9.26);
        app.generateRoom();
        expect(app.ceilingHeight()).toBe(9.3);
        expect(app.draftCeiling()).toBe(9.3);
      });

      it('rejects a ceiling below 7 ft or above 14 ft with a message and applies nothing', () => {
        const { app } = openVisualizer();
        for (const bad of [6.9, 0, -3, 14.1, 99]) {
          app.draftCeiling.set(bad);
          app.generateRoom();
          expect(app.roomError()).toBe('Ceiling height must be between 7 ft and 14 ft.');
          expect(app.ceilingHeight()).toBe(9);
        }
      });

      it('a bad ceiling also stops the room size from being applied', () => {
        const { app } = openVisualizer();
        app.onDimensionInput('width', '20');
        app.onDimensionInput('length', '10');
        app.draftCeiling.set(30);
        app.generateRoom();
        expect(app.appliedWidth()).toBe(12);
        expect(app.appliedLength()).toBe(15);
        expect(app.ceilingHeight()).toBe(9);
        // fixing the ceiling lets the same press apply everything
        app.draftCeiling.set(10);
        app.generateRoom();
        expect(app.appliedWidth()).toBe(20);
        expect(app.appliedLength()).toBe(10);
        expect(app.ceilingHeight()).toBe(10);
      });

      it('shows the error in the room setup panel and clears it after a valid press', () => {
        const { fixture, app, el } = openVisualizer();
        app.draftCeiling.set(2);
        app.generateRoom();
        fixture.detectChanges();
        expect(el.querySelector('.err')!.textContent).toContain('Ceiling height must be between 7 ft and 14 ft.');
        app.draftCeiling.set(8);
        app.generateRoom();
        fixture.detectChanges();
        expect(el.querySelector('.err')).toBeNull();
      });

      it('ignores empty and non-numeric keystrokes, keeping the last good draft', () => {
        const { app } = openVisualizer();
        app.onCeilingInput('12');
        for (const junk of ['', '   ', 'abc', 'NaN', 'Infinity', '-Infinity']) {
          app.onCeilingInput(junk);
          expect(app.draftCeiling()).toBe(12);
        }
        app.onCeilingInput(null as unknown as string);
        expect(app.draftCeiling()).toBe(12);
      });

      it('an out-of-range typed value is kept as a draft so the message can explain it', () => {
        const { app } = openVisualizer();
        app.onCeilingInput('20');
        expect(app.draftCeiling()).toBe(20);
        expect(app.ceilingHeight()).toBe(9);
      });

      it('resetting the workspace restores 9 ft in both the draft and the applied value', () => {
        const { app } = openVisualizer();
        app.draftCeiling.set(13);
        app.generateRoom();
        expect(app.ceilingHeight()).toBe(13);
        app.resetWorkspace();
        expect(app.ceilingHeight()).toBe(9);
        expect(app.draftCeiling()).toBe(9);
      });

      it('does not touch the area, the estimate or the furniture', () => {
        const { app } = openVisualizer();
        const area = app.area();
        const total = app.estimateTotal();
        const placed = JSON.stringify(app.placed());
        app.draftCeiling.set(14);
        app.generateRoom();
        expect(app.area()).toBe(area);
        expect(app.estimateTotal()).toBe(total);
        expect(JSON.stringify(app.placed())).toBe(placed);
      });

      it('leaves the 2D plan and Perspective without a ceiling field or change', () => {
        const { fixture, app, el, tab } = openVisualizer();
        tab('Perspective').click();
        fixture.detectChanges();
        const before = el.querySelector('app-room-visualizer')!.innerHTML;
        app.draftCeiling.set(13);
        app.generateRoom();
        fixture.detectChanges();
        expect(el.querySelector('app-room-visualizer')!.innerHTML).toBe(before);
      });
    });

    describe('new pieces do not land on top of existing ones', () => {
      /** True when two placed pieces share floor area in the current room. */
      function overlap(app: AppComponent, a: ReturnType<AppComponent['placed']>[number], b: ReturnType<AppComponent['placed']>[number]): boolean {
        const rw = app.appliedWidth();
        const rl = app.appliedLength();
        const ax = (a.x / 100) * rw, ay = (a.y / 100) * rl, bx = (b.x / 100) * rw, by = (b.y / 100) * rl;
        return Math.min(ax + a.w, bx + b.w) - Math.max(ax, bx) > 1e-6 && Math.min(ay + a.l, by + b.l) - Math.max(ay, by) > 1e-6;
      }
      function anyOverlap(app: AppComponent): boolean {
        const list = app.placed();
        return list.some((a, i) => list.slice(i + 1).some((b) => overlap(app, a, b)));
      }

      it('the bed that used to cover the default table now has its own spot', () => {
        const { app } = openVisualizer();
        app.addFurniture('bed');
        const bed = app.placed()[app.placed().length - 1];
        expect(bed.defId).toBe('bed');
        expect(anyOverlap(app)).toBe(false);
      });

      it('adding several pieces in a row leaves none of them overlapping', () => {
        // NOTE: bed, wardrobe, chair, chair is the longest such sequence here. A second
        // 7x3 sofa cannot fit afterwards: it x-overlaps every legal bed/wardrobe position,
        // so it would have to clear the sofa, table, bed and wardrobe in y, and the tallest
        // free y-band in a 12x15 room is 2.4 ft < 3 ft. That overfill case is covered below.
        const { app } = openVisualizer();
        for (const id of ['bed', 'wardrobe', 'chair', 'chair'] as const) app.addFurniture(id);
        expect(app.placed().length).toBe(6);
        expect(anyOverlap(app)).toBe(false);
      });

      it('an overfilled room still adds an in-bounds piece and selects it', () => {
        const { app } = openVisualizer();
        for (const id of ['bed', 'wardrobe', 'chair', 'chair', 'sofa', 'table'] as const) app.addFurniture(id);
        expect(app.placed().length).toBe(8);
        const last = app.placed()[app.placed().length - 1];
        expect(Number.isFinite(last.x) && Number.isFinite(last.y)).toBe(true);
        expect(last.x).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(last.y).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(last.x + (last.w / app.appliedWidth()) * 100).toBeLessThanOrEqual(99 + 1e-6);
        expect(last.y + (last.l / app.appliedLength()) * 100).toBeLessThanOrEqual(99 + 1e-6);
        expect(app.selectedItemId()).toBe(last.uid);
      });

      it('every new piece stays inside the room', () => {
        const { app } = openVisualizer();
        for (const id of ['bed', 'wardrobe', 'chair', 'sofa', 'table', 'chair'] as const) app.addFurniture(id);
        for (const p of app.placed()) {
          expect(p.x).toBeGreaterThanOrEqual(1 - 1e-9);
          expect(p.y).toBeGreaterThanOrEqual(1 - 1e-9);
          expect(p.x + (p.w / app.appliedWidth()) * 100).toBeLessThanOrEqual(99 + 1e-6);
          expect(p.y + (p.l / app.appliedLength()) * 100).toBeLessThanOrEqual(99 + 1e-6);
        }
      });

      it('the first piece still goes where it always did when nothing is in the way', () => {
        const { app } = openVisualizer();
        app.clearFurniture();
        app.addFurniture('chair');
        const chair = app.placed()[0];
        expect([chair.x, chair.y]).toEqual([6, 6]);
      });

      it('a larger room keeps new pieces apart too', () => {
        const { app } = openVisualizer();
        app.draftWidth.set(30);
        app.draftLength.set(30);
        app.generateRoom();
        for (let i = 0; i < 10; i++) app.addFurniture('bed');
        expect(anyOverlap(app)).toBe(false);
      });

      it('the smallest room still accepts a piece, even if it has to overlap', () => {
        const { app } = openVisualizer();
        app.draftWidth.set(4);
        app.draftLength.set(4);
        app.generateRoom();
        const before = app.placed().length;
        app.addFurniture('bed');
        expect(app.placed().length).toBe(before + 1);
        const bed = app.placed()[app.placed().length - 1];
        expect(Number.isFinite(bed.x) && Number.isFinite(bed.y)).toBe(true);
      });

      it('Add to Visualizer from a product page also avoids overlap', () => {
        const { app } = openVisualizer();
        app.onVisualizerRequested('Beds');
        expect(anyOverlap(app)).toBe(false);
        expect(app.activeView()).toBe('visualizer');
      });

      it('the new piece is selected, and what gets saved with an estimate is unchanged', () => {
        const { app } = openVisualizer();
        app.addFurniture('bed');
        const bed = app.placed()[app.placed().length - 1];
        expect(app.selectedItemId()).toBe(bed.uid);
        const lines = (app as unknown as { placedFurnitureLines(): { furnitureType: string; quantity: number }[] }).placedFurnitureLines();
        expect(lines).toEqual([
          { furnitureType: 'sofa', quantity: 1 },
          { furnitureType: 'table', quantity: 1 },
          { furnitureType: 'bed', quantity: 1 },
        ]);
      });

      it('the new piece shows in the plan and in the Elevation view', () => {
        const { fixture, app, el, tab } = openVisualizer();
        app.addFurniture('bed');
        fixture.detectChanges();
        expect(el.querySelectorAll('app-floor-plan .f-item').length).toBe(3);
        tab('Elevation').click();
        fixture.detectChanges();
        expect(el.querySelectorAll('app-elevation-view .piece').length).toBe(3);
      });
    });
    it('does not change what is saved with an estimate', () => {
      const { app } = openVisualizer();
      app.addFurniture('bed');
      app.canvasTab.set('elevation');
      app.elevationWall.set('left');
      // the saved lines are still type + quantity only
      const lines = (app as unknown as { placedFurnitureLines(): { furnitureType: string; quantity: number }[] })
        .placedFurnitureLines();
      expect(lines.every((l) => Object.keys(l).sort().join() === 'furnitureType,quantity')).toBe(true);
      expect(lines.length).toBeGreaterThan(0);
    });
  });
});
