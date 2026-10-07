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
    function openEstimates() {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      app.activeView.set('estimates');
      fixture.detectChanges();
      return { fixture, app, el: fixture.nativeElement as HTMLElement };
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

    it('shows the illustrative-pricing disclaimer, never a final quotation', () => {
      const { el } = openEstimates();
      expect(el.textContent).toContain('Illustrative estimate — final pricing may vary.');
      expect(el.textContent).not.toContain('final quotation');
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

    it('Admin sees Products management navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      expect(sidebarLabels(fixture)).toContain('Manage products');
      // The mobile workspace nav renders on workspace views.
      fixture.componentInstance.activeView.set('estimates');
      fixture.detectChanges();
      httpMock.expectOne(ESTIMATES_URL).flush([]);
      fixture.detectChanges();
      const mobile = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.mnav button')
      ).map((b) => (b as HTMLElement).textContent?.trim());
      expect(mobile).toContain('Manage products');
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
      const productsButton = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('#app-sidebar .nav-item')
      ).find((b) => (b as HTMLElement).textContent?.trim() === 'Manage products') as HTMLButtonElement;
      productsButton.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.activeView()).toBe('admin-products');
      expect((fixture.nativeElement as HTMLElement).querySelector('app-admin-products')).toBeTruthy();
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

    it('Admin sees Admin Orders navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      expect(sidebarLabels(fixture)).toContain('Manage orders');
      // The mobile workspace nav renders on workspace views.
      fixture.componentInstance.activeView.set('estimates');
      fixture.detectChanges();
      httpMock.expectOne(ESTIMATES_URL).flush([]);
      fixture.detectChanges();
      const mobile = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.mnav button')
      ).map((b) => (b as HTMLElement).textContent?.trim());
      expect(mobile).toContain('Manage orders');
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
      const ordersButton = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('#app-sidebar .nav-item')
      ).find((b) => (b as HTMLElement).textContent?.trim() === 'Manage orders') as HTMLButtonElement;
      ordersButton.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.activeView()).toBe('admin-orders');
      expect((fixture.nativeElement as HTMLElement).querySelector('app-admin-orders')).toBeTruthy();
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

    it('Admin sees Admin Proposals navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[aria-label="Manage proposals"]')
      ).toBeTruthy();
      // The mobile workspace nav renders on workspace views.
      fixture.componentInstance.activeView.set('estimates');
      fixture.detectChanges();
      httpMock.expectOne(ESTIMATES_URL).flush([]);
      fixture.detectChanges();
      const mobile = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.mnav button')
      ).map((b) => (b as HTMLElement).textContent?.trim());
      expect(mobile).toContain('Manage proposals');
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
      const proposalsButton = (fixture.nativeElement as HTMLElement).querySelector(
        '#app-sidebar [aria-label="Manage proposals"]'
      ) as HTMLButtonElement;
      proposalsButton.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.activeView()).toBe('admin-proposals');
      expect((fixture.nativeElement as HTMLElement).querySelector('app-admin-proposals')).toBeTruthy();
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

    it('admins see customer Orders and Proposals separately from Manage orders and Manage proposals', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      const { items, groups } = sidebar(fixture);
      expect(groups).toContain('Operations');
      expect(items).toContain('Orders');
      expect(items).toContain('Proposals');
      expect(items).toContain('Manage orders');
      expect(items).toContain('Manage proposals');
      expect(items).toContain('Manage products');
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

    it('the mobile menu matches: Cart and Orders for customers, Manage entries for admins', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      fixture.componentInstance.activeView.set('estimates');
      fixture.detectChanges();
      httpMock.expectOne(ESTIMATES_URL).flush([]);
      fixture.detectChanges();
      const mobile = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.mnav button')
      ).map((b) => (b as HTMLElement).textContent?.trim());
      expect(mobile).toContain('Cart');
      expect(mobile).toContain('Orders');
      expect(mobile).toContain('Manage orders');
      expect(mobile).toContain('Manage products');
      expect(mobile).toContain('Manage proposals');
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
