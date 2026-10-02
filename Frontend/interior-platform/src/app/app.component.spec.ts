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

    it('authenticated save posts only width/length and shows the server record', () => {
      const { fixture, app, httpMock, el } = openEstimatesAuthed();

      const button = savePanel(el)?.querySelector('button') as HTMLButtonElement;
      expect(button?.textContent).toContain('Save Estimate');
      button.click();

      const req = httpMock.expectOne(SAVE_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ width: 12, length: 15 });
      expect(Object.keys(req.request.body).sort()).toEqual(['length', 'width']);
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
      expect(sidebarLabels(fixture)).toContain('Products');
      // The mobile workspace nav renders on workspace views.
      fixture.componentInstance.activeView.set('estimates');
      fixture.detectChanges();
      httpMock.expectOne(ESTIMATES_URL).flush([]);
      fixture.detectChanges();
      const mobile = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.mnav button')
      ).map((b) => (b as HTMLElement).textContent?.trim());
      expect(mobile).toContain('Products');
      httpMock.verify();
    });

    it('Field Staff does not see Products management navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['FieldStaff']);
      expect(sidebarLabels(fixture)).toContain('Leads');
      expect(sidebarLabels(fixture)).not.toContain('Products');
      httpMock.verify();
    });

    it('customers do not see Products management navigation', () => {
      const { fixture, httpMock } = createAuthedApp(['Customer']);
      expect(sidebarLabels(fixture)).not.toContain('Products');
      httpMock.verify();
    });

    it('anonymous visitors do not see Products management navigation', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      expect(sidebarLabels(fixture)).not.toContain('Products');
    });

    it('Admin opens the Products workspace', () => {
      const { fixture, httpMock } = createAuthedApp(['Admin']);
      const productsButton = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('#app-sidebar .nav-item')
      ).find((b) => (b as HTMLElement).textContent?.trim() === 'Products') as HTMLButtonElement;
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
});
