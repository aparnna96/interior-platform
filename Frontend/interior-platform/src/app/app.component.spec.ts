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
});
