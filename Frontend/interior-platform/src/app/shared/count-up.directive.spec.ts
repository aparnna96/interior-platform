import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CountUpDirective } from './count-up.directive';

@Component({
  standalone: true,
  imports: [CountUpDirective],
  template: `<strong id="n" [countUp]="value()"></strong>`,
})
class HostComponent {
  value = signal(24);
}

describe('CountUpDirective', () => {
  const waitFor = async (check: () => boolean, ms = 4000): Promise<void> => {
    const end = Date.now() + ms;
    while (!check() && Date.now() < end) {
      await new Promise((r) => setTimeout(r, 40));
    }
  };

  it('shows the target number as text once the count has run', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('#n') as HTMLElement;
    await waitFor(() => el.textContent === '24');
    expect(el.textContent).toBe('24');
  });

  it('moves to a new target when the value changes', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('#n') as HTMLElement;
    await waitFor(() => el.textContent === '24');
    fixture.componentInstance.value.set(40);
    fixture.detectChanges();
    await waitFor(() => el.textContent === '40');
    expect(el.textContent).toBe('40');
  });
});
