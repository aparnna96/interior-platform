import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app.component';

/** Regression guard: the public navbar must gain/lose its scrolled state
 *  as the window scrolls (drives the elevated navbar treatment). */
describe('AppComponent navbar scroll state', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      // AppComponent injects CartService → ProductService → HttpClient.
      providers: [provideHttpClient()],
    }).compileComponents();
  });

  it('toggles navScrolled and .scrolled while scrolling and back', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const header = fixture.nativeElement.querySelector('header.pubnav') as HTMLElement;
    expect(header).toBeTruthy();
    expect(app.navScrolled()).toBe(false);
    expect(header.classList.contains('scrolled')).toBe(false);

    window.scrollTo(0, 120);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(app.navScrolled()).toBe(true);
    expect(header.classList.contains('scrolled')).toBe(true);

    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(app.navScrolled()).toBe(false);
    expect(header.classList.contains('scrolled')).toBe(false);
  });

  it('collapses to the compact centered logo on scroll down and expands on scroll up', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const header = fixture.nativeElement.querySelector('header.pubnav') as HTMLElement;
    const compact = fixture.nativeElement.querySelector('.pubnav-compact') as HTMLButtonElement;

    const scrollToY = (y: number): void => {
      window.scrollTo(0, y);
      window.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
    };

    scrollToY(0);
    expect(app.navHidden()).toBe(false);
    expect(header.classList.contains('nav-hidden')).toBe(false);

    // Past the collapse threshold with clear downward travel: full bar
    // collapses, compact centered logo takes over — header stays visible.
    scrollToY(220);
    expect(app.navHidden()).toBe(true);
    expect(header.classList.contains('nav-hidden')).toBe(true);
    expect(compact.getAttribute('aria-hidden')).toBe('false');
    expect(compact.getAttribute('tabindex')).toBe('0');
    expect(getComputedStyle(header).visibility).not.toBe('hidden');
    expect(getComputedStyle(header).transform).toBe('none');

    // Scrolling upward expands it again (still elevated while off the top).
    scrollToY(150);
    expect(app.navHidden()).toBe(false);
    expect(header.classList.contains('nav-hidden')).toBe(false);
    expect(app.navScrolled()).toBe(true);
    expect(compact.getAttribute('aria-hidden')).toBe('true');
    expect(compact.getAttribute('tabindex')).toBe('-1');

    // Back at the very top it is always expanded.
    scrollToY(0);
    expect(app.navHidden()).toBe(false);
    expect(header.classList.contains('nav-hidden')).toBe(false);
  });

  it('ignores tiny scroll jitter so the header does not flicker between states', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;

    const scrollToY = (y: number): void => {
      window.scrollTo(0, y);
      window.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
    };

    scrollToY(0);
    scrollToY(220);
    expect(app.navHidden()).toBe(true);

    // A 3px upward wobble is within tolerance: stays hidden.
    scrollToY(217);
    expect(app.navHidden()).toBe(true);

    // A clear upward swipe reveals.
    scrollToY(150);
    expect(app.navHidden()).toBe(false);

    // A 3px downward wobble while visible does not re-hide.
    scrollToY(153);
    expect(app.navHidden()).toBe(false);

    scrollToY(0);
  });

  it('stays expanded while the mobile menu is open', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const header = fixture.nativeElement.querySelector('header.pubnav') as HTMLElement;

    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    app.drawerOpen.set(true);
    fixture.detectChanges();

    window.scrollTo(0, 600);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(app.navHidden()).toBe(false);
    expect(header.classList.contains('nav-hidden')).toBe(false);

    app.drawerOpen.set(false);
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
  });

  it('expands the full navbar when the centered compact logo is activated', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const header = fixture.nativeElement.querySelector('header.pubnav') as HTMLElement;
    const compact = fixture.nativeElement.querySelector('.pubnav-compact') as HTMLButtonElement;

    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    window.scrollTo(0, 300);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(app.navHidden()).toBe(true);

    compact.click();
    fixture.detectChanges();

    expect(app.navHidden()).toBe(false);
    expect(header.classList.contains('nav-hidden')).toBe(false);
    // Full brand is back in the tab order once expanded.
    const brand = fixture.nativeElement.querySelector('.pubnav-brand') as HTMLButtonElement;
    brand.focus();
    expect(document.activeElement).toBe(brand);

    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
  });

  it('keeps the compact centered logo keyboard-focusable with an accessible label', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compact = fixture.nativeElement.querySelector('.pubnav-compact') as HTMLButtonElement;

    expect(compact.tagName.toLowerCase()).toBe('button');
    expect(compact.getAttribute('aria-label') ?? '').toContain('show navigation');
    expect(compact.querySelector('img.brand-logo')).toBeTruthy();

    // Expanded at the top: removed from the tab order.
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(compact.getAttribute('tabindex')).toBe('-1');
    expect(compact.getAttribute('aria-hidden')).toBe('true');

    // Collapsed: keyboard-reachable.
    window.scrollTo(0, 300);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(compact.getAttribute('tabindex')).toBe('0');
    expect(compact.getAttribute('aria-hidden')).toBe('false');
    compact.focus();
    expect(document.activeElement).toBe(compact);

    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
  });

  it('expands immediately when the mobile menu is opened from the compact state', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;

    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    window.scrollTo(0, 400);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(app.navHidden()).toBe(true);

    app.openDrawer();
    fixture.detectChanges();
    expect(app.navHidden()).toBe(false);
    expect(app.drawerOpen()).toBe(true);

    app.closeDrawer();
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
  });
});
