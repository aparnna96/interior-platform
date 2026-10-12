import { computed, signal } from '@angular/core';

export type SortDirection = 'asc' | 'desc';

/** A sortable cell value. Null (or an unreadable value) always sorts last. */
export type SortValue = string | number | null | undefined;

export interface TableOptions<T> {
  /** Everything a search should match for a row, joined as one string. */
  readonly searchText: (row: T) => string;
  /** Sortable columns by key. A column that is not listed here is not sortable. */
  readonly sorters?: Readonly<Record<string, (row: T) => SortValue>>;
  /** Extra filter (status, category...). Read inside a computed, so signals it reads are tracked. */
  readonly filter?: () => ((row: T) => boolean) | null;
  readonly pageSize?: number;
}

export const PAGE_SIZES: readonly number[] = [10, 25, 50];

function compare(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

/**
 * Search, sort, filter and page state for one client-side Admin table.
 *
 * The Admin list endpoints return every row, so all of this runs over the
 * loaded rows. Without a sort the server order is kept (newest first).
 * Changing the search, a filter or the page size returns to page 1; the
 * current page is also clamped, so shrinking the result never strands the
 * table on an empty page.
 */
export class TableState<T> {
  readonly query = signal('');
  readonly sortKey = signal<string | null>(null);
  readonly sortDir = signal<SortDirection>('asc');
  readonly pageSize = signal(PAGE_SIZES[0]);
  private readonly requestedPage = signal(1);

  /** Rows after search and filter, in server order. */
  readonly filtered = computed<readonly T[]>(() => {
    const rows = this.rows();
    const needle = this.query().trim().toLowerCase();
    const extra = this.options.filter?.() ?? null;
    return rows.filter(
      (row) => (extra === null || extra(row)) && (needle === '' || this.options.searchText(row).toLowerCase().includes(needle))
    );
  });

  readonly sorted = computed<readonly T[]>(() => {
    const rows = this.filtered();
    const key = this.sortKey();
    const sorter = key === null ? undefined : this.options.sorters?.[key];
    if (!sorter) return rows;
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    // Array.prototype.sort is stable, so equal values keep the server order.
    return [...rows].sort((x, y) => {
      const a = sorter(x);
      const b = sorter(y);
      const aMissing = a === null || a === undefined || (typeof a === 'number' && Number.isNaN(a));
      const bMissing = b === null || b === undefined || (typeof b === 'number' && Number.isNaN(b));
      if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
      return compare(a, b) * dir;
    });
  });

  readonly total = computed(() => this.sorted().length);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly page = computed(() => Math.min(Math.max(1, this.requestedPage()), this.pageCount()));
  readonly pageRows = computed<readonly T[]>(() => {
    const size = this.pageSize();
    const start = (this.page() - 1) * size;
    return this.sorted().slice(start, start + size);
  });
  /** 1-based position of the first and last row on this page (0 when there are no rows). */
  readonly from = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1));
  readonly to = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
  /** True when a search or filter narrowed the rows to fewer than were loaded. */
  readonly isNarrowed = computed(() => this.total() !== this.rows().length);

  constructor(
    private readonly rows: () => readonly T[],
    private readonly options: TableOptions<T>
  ) {
    if (options.pageSize) this.pageSize.set(options.pageSize);
  }

  setQuery(value: string): void {
    this.query.set(value);
    this.requestedPage.set(1);
  }

  /** Call after a filter signal changed, so the table starts again from page 1. */
  resetPage(): void {
    this.requestedPage.set(1);
  }

  /** First click sorts ascending, the second descending, the third clears the sort. */
  toggleSort(key: string): void {
    if (!this.options.sorters?.[key]) return;
    if (this.sortKey() !== key) {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    } else if (this.sortDir() === 'asc') {
      this.sortDir.set('desc');
    } else {
      this.sortKey.set(null);
      this.sortDir.set('asc');
    }
    this.requestedPage.set(1);
  }

  /** Value for the th aria-sort attribute. */
  ariaSort(key: string): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  goTo(page: number): void {
    this.requestedPage.set(Math.min(Math.max(1, Math.trunc(page) || 1), this.pageCount()));
  }

  next(): void {
    this.goTo(this.page() + 1);
  }

  previous(): void {
    this.goTo(this.page() - 1);
  }

  setPageSize(size: number): void {
    if (!PAGE_SIZES.includes(size)) return;
    this.pageSize.set(size);
    this.requestedPage.set(1);
  }

  /** Clears the search, sort and page (a filter is owned by the page and reset there). */
  reset(): void {
    this.query.set('');
    this.sortKey.set(null);
    this.sortDir.set('asc');
    this.requestedPage.set(1);
  }
}
