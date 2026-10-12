import { TestBed } from '@angular/core/testing';
import { BarChartComponent } from './bar-chart.component';
import { DonutChartComponent } from './donut-chart.component';
import { LineChartComponent } from './line-chart.component';
import { compactRupees, niceTicks } from './chart-utils';

describe('chart helpers', () => {
  it('rounds the axis up to whole, readable steps starting at 0', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(430)).toEqual([0, 200, 400, 600]);
    expect(niceTicks(NaN)).toEqual([0, 1]);
  });

  it('writes money in short Indian units', () => {
    expect(compactRupees(850)).toBe('₹850');
    expect(compactRupees(12500)).toBe('₹12.5k');
    expect(compactRupees(270000)).toBe('₹2.7L');
    expect(compactRupees(25000000)).toBe('₹2.5Cr');
    expect(compactRupees(NaN)).toBe('');
  });
});

describe('SVG charts', () => {
  function render<T>(type: new () => T, inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({ imports: [type as never] });
    const fixture = TestBed.createComponent(type as never) as import('@angular/core/testing').ComponentFixture<T>;
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('donut: draws one arc per non-empty slice, prints every share and the total', () => {
    const el = render(DonutChartComponent, {
      data: [
        { label: 'Pending', value: 3 },
        { label: 'Completed', value: 1 },
        { label: 'Cancelled', value: 0 },
      ],
      heading: 'Orders by status',
      centerLabel: 'orders',
    });
    // The base ring plus two slices; the empty slice has no arc but still has a legend line.
    expect(el.querySelectorAll('svg circle').length).toBe(3);
    const legend = Array.from(el.querySelectorAll('.adm-legend li')).map((li) =>
      Array.from(li.querySelectorAll('span:not(.adm-legend-swatch)')).map((s) => s.textContent!.trim())
    );
    expect(legend).toEqual([['Pending', '3', '75%'], ['Completed', '1', '25%'], ['Cancelled', '0', '0%']]);
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toContain('Pending 3 (75%)');
    expect(el.querySelector('svg text')!.textContent).toBe('4');
  });

  it('donut: with no data shows a plain ring and says so', () => {
    const el = render(DonutChartComponent, { data: [{ label: 'A', value: 0 }], heading: 'Empty' });
    expect(el.querySelectorAll('svg circle').length).toBe(1);
    expect(el.textContent).toContain('No data');
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toBe('Empty. A 0 (0%).');
  });

  it('bar: scales to the largest value and prints each value', () => {
    const el = render(BarChartComponent, {
      data: [
        { label: 'New', value: 10 },
        { label: 'Closed', value: 5 },
        { label: 'Lost', value: 0 },
      ],
      heading: 'Leads by status',
    });
    const widths = Array.from(el.querySelectorAll('svg rect[fill]:not([fill="#eef1f6"])')).map((r) => Number(r.getAttribute('width')));
    expect(widths.length).toBe(2);
    expect(widths[0]).toBeCloseTo(widths[1] * 2, 3);
    expect(Array.from(el.querySelectorAll('svg text')).map((t) => t.textContent!.trim())).toEqual(['New', '10', 'Closed', '5', 'Lost', '0']);
  });

  it('line: plots each point, labels the ends of the axis and offers the data as a hidden table', () => {
    const data = Array.from({ length: 14 }, (_, i) => ({ label: `D${i + 1}`, value: i === 3 ? 5 : 0 }));
    const el = render(LineChartComponent, { data, heading: 'Orders per day' });
    expect(el.querySelectorAll('svg circle').length).toBe(14);
    const axis = Array.from(el.querySelectorAll('svg text.adm-axis-text')).map((t) => t.textContent!.trim());
    expect(axis).toContain('D1');
    expect(axis).toContain('D14');
    expect(el.querySelectorAll('table tbody tr').length).toBe(14);
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toBe('Orders per day. Total 5. Highest 5 on D4.');
  });

  it('line: a single point or no data does not break the chart', () => {
    const one = render(LineChartComponent, { data: [{ label: 'Today', value: 2 }], heading: 'One' });
    expect(one.querySelectorAll('svg circle').length).toBe(1);
    TestBed.resetTestingModule();
    const none = render(LineChartComponent, { data: [], heading: 'None' });
    expect(none.querySelector('svg')!.getAttribute('aria-label')).toBe('None: no data');
  });
});
