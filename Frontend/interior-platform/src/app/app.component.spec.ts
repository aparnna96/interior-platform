import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app.component';
import { AUTH_TOKEN_KEY } from './auth.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      // AppComponent injects CartService → HttpClient (+ AuthService).
      providers: [provideHttpClient()],
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
});
