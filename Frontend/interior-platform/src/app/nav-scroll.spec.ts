import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

/** Regression guard: the public navbar must gain/lose its scrolled state
 *  as the window scrolls (drives the visible compact navbar treatment). */
describe('AppComponent navbar scroll state', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
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
});
