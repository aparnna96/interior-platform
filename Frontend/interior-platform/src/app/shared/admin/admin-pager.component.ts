import { Component, input } from '@angular/core';
import { PAGE_SIZES, TableState } from './table-state';

/** Range text, page buttons and rows-per-page for a {@link TableState}. */
@Component({
  selector: 'app-admin-pager',
  standalone: true,
  template: `
    @if (table().total() > 0) {
      <nav class="adm-pager" [attr.aria-label]="label() + ' pagination'">
        <p class="adm-pager-range" aria-live="polite">
          Showing {{ table().from() }}–{{ table().to() }} of {{ table().total() }}
          @if (table().isNarrowed()) {
            <span> (filtered)</span>
          }
        </p>
        <label class="adm-pager-size">
          <span>Rows per page</span>
          <select [value]="table().pageSize()" (change)="onSize($event)" [attr.aria-label]="'Rows per page for ' + label()">
            @for (size of sizes; track size) {
              <option [value]="size" [selected]="size === table().pageSize()">{{ size }}</option>
            }
          </select>
        </label>
        <div class="adm-pager-nav">
          <button
            type="button"
            class="adm-page-btn"
            (click)="table().previous()"
            [disabled]="table().page() <= 1"
            aria-label="Previous page"
          >Previous</button>
          <span class="adm-pager-page">Page {{ table().page() }} of {{ table().pageCount() }}</span>
          <button
            type="button"
            class="adm-page-btn"
            (click)="table().next()"
            [disabled]="table().page() >= table().pageCount()"
            aria-label="Next page"
          >Next</button>
        </div>
      </nav>
    }
  `,
})
export class AdminPagerComponent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly table = input.required<TableState<any>>();
  /** What the table lists, used in the accessible names ("orders"). */
  readonly label = input('table');
  readonly sizes = PAGE_SIZES;

  onSize(event: Event): void {
    this.table().setPageSize(Number((event.target as HTMLSelectElement).value));
  }
}
