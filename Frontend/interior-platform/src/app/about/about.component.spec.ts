import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AboutComponent } from './about.component';

describe('AboutComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AboutComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  function setup() {
    const fixture = TestBed.createComponent(AboutComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the heading, the four offers and the three principles', () => {
    const el = setup().nativeElement as HTMLElement;
    expect(el.querySelector('h1')!.textContent).toContain('Confident Group');
    expect(el.querySelectorAll('.offer').length).toBe(4);
    expect(el.querySelectorAll('.principles li').length).toBe(3);
  });

  it('sends each offer to its page', () => {
    const fixture = setup();
    const seen: unknown[] = [];
    fixture.componentInstance.navigate.subscribe((d: unknown) => seen.push(d));
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.offer-link'));
    links.forEach((b) => b.click());
    expect(seen).toEqual(['interiors', 'catalogue', 'visualizer', 'estimates']);
  });

  it('keeps the enquiry form hidden until Talk to us is chosen', () => {
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-lead-form')).toBeFalsy();
    const talk = Array.from(el.querySelectorAll<HTMLButtonElement>('.ab-actions button')).find((b) =>
      b.textContent?.includes('Talk to us')
    )!;
    talk.click();
    fixture.detectChanges();
    expect(el.querySelector('app-lead-form')).toBeTruthy();
  });
});
