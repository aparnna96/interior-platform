import { signal } from '@angular/core';
import { TableState } from './table-state';

interface Row {
  readonly id: number;
  readonly name: string;
  readonly kind: string;
  readonly total: number | null;
}

const ROWS: readonly Row[] = [
  { id: 1, name: 'Birch table', kind: 'table', total: 300 },
  { id: 2, name: 'Aria sofa', kind: 'sofa', total: 1200 },
  { id: 3, name: 'Cedar chair', kind: 'chair', total: null },
  { id: 4, name: 'Dune sofa', kind: 'sofa', total: 900 },
];

function many(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}`, kind: 'x', total: i }));
}

describe('TableState', () => {
  const make = (rows: () => readonly Row[], kind = signal<string | null>(null)) =>
    new TableState<Row>(rows, {
      searchText: (r) => `${r.name} ${r.kind}`,
      filter: () => {
        const k = kind();
        return k === null ? null : (r) => r.kind === k;
      },
      sorters: { name: (r) => r.name.toLowerCase(), total: (r) => r.total },
      pageSize: 10,
    });

  it('keeps the server order until a sort is chosen', () => {
    const t = make(() => ROWS);
    expect(t.pageRows().map((r) => r.id)).toEqual([1, 2, 3, 4]);
    expect(t.sortKey()).toBeNull();
  });

  it('searches case-insensitively over the search text', () => {
    const t = make(() => ROWS);
    t.setQuery('  SOFA ');
    expect(t.pageRows().map((r) => r.id)).toEqual([2, 4]);
    expect(t.isNarrowed()).toBeTrue();
    t.setQuery('nothing like this');
    expect(t.total()).toBe(0);
    expect(t.from()).toBe(0);
    expect(t.to()).toBe(0);
    expect(t.page()).toBe(1);
  });

  it('applies the page filter on top of the search', () => {
    const kind = signal<string | null>('sofa');
    const t = make(() => ROWS, kind);
    expect(t.pageRows().map((r) => r.id)).toEqual([2, 4]);
    t.setQuery('dune');
    expect(t.pageRows().map((r) => r.id)).toEqual([4]);
    kind.set(null);
    t.setQuery('');
    expect(t.total()).toBe(4);
  });

  it('cycles a column through ascending, descending and off', () => {
    const t = make(() => ROWS);
    t.toggleSort('name');
    expect(t.ariaSort('name')).toBe('ascending');
    expect(t.pageRows().map((r) => r.id)).toEqual([2, 1, 3, 4]);
    t.toggleSort('name');
    expect(t.ariaSort('name')).toBe('descending');
    expect(t.pageRows().map((r) => r.id)).toEqual([4, 3, 1, 2]);
    t.toggleSort('name');
    expect(t.ariaSort('name')).toBe('none');
    expect(t.pageRows().map((r) => r.id)).toEqual([1, 2, 3, 4]);
    expect(t.ariaSort('total')).toBe('none');
  });

  it('sorts numbers as numbers and always puts missing values last', () => {
    const t = make(() => ROWS);
    t.toggleSort('total');
    expect(t.pageRows().map((r) => r.id)).toEqual([1, 4, 2, 3]);
    t.toggleSort('total');
    expect(t.pageRows().map((r) => r.id)).toEqual([2, 4, 1, 3]);
  });

  it('ignores a column that has no sorter', () => {
    const t = make(() => ROWS);
    t.toggleSort('kind');
    expect(t.sortKey()).toBeNull();
  });

  it('pages the rows and reports the visible range', () => {
    const t = make(() => many(25));
    expect(t.pageCount()).toBe(3);
    expect([t.from(), t.to(), t.total()]).toEqual([1, 10, 25]);
    t.next();
    expect(t.pageRows()[0].id).toBe(11);
    t.goTo(3);
    expect([t.from(), t.to(), t.pageRows().length]).toEqual([21, 25, 5]);
    t.next();
    expect(t.page()).toBe(3);
    t.goTo(-4);
    expect(t.page()).toBe(1);
    t.previous();
    expect(t.page()).toBe(1);
  });

  it('returns to page 1 on a new search, sort or page size, and ignores an unknown page size', () => {
    const t = make(() => many(60));
    t.goTo(3);
    t.setQuery('item');
    expect(t.page()).toBe(1);
    t.goTo(2);
    t.toggleSort('name');
    expect(t.page()).toBe(1);
    t.goTo(2);
    t.setPageSize(25);
    expect([t.page(), t.pageCount()]).toEqual([1, 3]);
    t.setPageSize(7);
    expect(t.pageSize()).toBe(25);
  });

  it('never strands the table on a page that no longer exists', () => {
    const rows = signal<Row[]>(many(30));
    const t = make(() => rows());
    t.goTo(3);
    expect(t.page()).toBe(3);
    rows.set(many(12));
    expect(t.page()).toBe(2);
    rows.set([]);
    expect(t.page()).toBe(1);
    expect(t.pageRows()).toEqual([]);
  });

  it('reset clears the search and the sort', () => {
    const t = make(() => ROWS);
    t.setQuery('sofa');
    t.toggleSort('name');
    t.reset();
    expect([t.query(), t.sortKey(), t.total()]).toEqual(['', null, 4]);
  });
});
