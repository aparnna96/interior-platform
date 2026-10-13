import { TestBed } from '@angular/core/testing';
import { WISHLIST_KEY, WishlistService } from './wishlist.service';

describe('WishlistService', () => {
  function create(stored?: string): WishlistService {
    localStorage.removeItem(WISHLIST_KEY);
    if (stored !== undefined) localStorage.setItem(WISHLIST_KEY, stored);
    TestBed.resetTestingModule();
    return TestBed.inject(WishlistService);
  }

  afterEach(() => localStorage.removeItem(WISHLIST_KEY));

  it('starts empty', () => {
    const w = create();
    expect(w.ids()).toEqual([]);
    expect(w.count()).toBe(0);
  });

  it('saves a piece, newest first, and remembers it', () => {
    const w = create();
    w.toggle('aria');
    w.toggle('haven');
    expect(w.ids()).toEqual(['haven', 'aria']);
    expect(w.has('aria')).toBeTrue();
    expect(JSON.parse(localStorage.getItem(WISHLIST_KEY)!)).toEqual(['haven', 'aria']);
  });

  it('toggling a saved piece removes it', () => {
    const w = create();
    w.toggle('aria');
    w.toggle('aria');
    expect(w.has('aria')).toBeFalse();
    expect(w.count()).toBe(0);
  });

  it('reads the list saved by an earlier visit', () => {
    const w = create('["aria","haven"]');
    expect(w.ids()).toEqual(['aria', 'haven']);
  });

  it('ignores damaged storage', () => {
    expect(create('not json').ids()).toEqual([]);
    expect(create('{"a":1}').ids()).toEqual([]);
    expect(create('["aria",3,"","aria"]').ids()).toEqual(['aria']);
  });

  it('retain drops pieces the shop no longer sells', () => {
    const w = create('["aria","gone","haven"]');
    w.retain(new Set(['aria', 'haven']));
    expect(w.ids()).toEqual(['aria', 'haven']);
    expect(JSON.parse(localStorage.getItem(WISHLIST_KEY)!)).toEqual(['aria', 'haven']);
  });

  it('remove ignores a piece that is not saved', () => {
    const w = create('["aria"]');
    w.remove('other');
    expect(w.ids()).toEqual(['aria']);
  });
});
