import { Component, computed, input } from '@angular/core';
import { TableState } from './table-state';

/**
 * Column header of a sortable Admin table: `<th admSort="status" [table]="table">Status</th>`.
 * It renders a button inside the th (keyboard and screen-reader friendly) and
 * sets aria-sort on the th itself. Click order: ascending, descending, off.
 */
@Component({
  selector: 'th[admSort]',
  standalone: true,
  host: { '[attr.aria-sort]': 'sort()' },
  template: `
    <button type="button" class="adm-sort" (click)="table().toggleSort(key())">
      <ng-content />
      <span class="adm-sort-mark" aria-hidden="true">{{ mark() }}</span>
    </button>
  `,
})
export class SortHeaderComponent {
  readonly key = input.required<string>({ alias: 'admSort' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly table = input.required<TableState<any>>();

  readonly sort = computed(() => this.table().ariaSort(this.key()));
  readonly mark = computed(() => {
    const s = this.sort();
    return s === 'ascending' ? '▲' : s === 'descending' ? '▼' : '↕';
  });
}
