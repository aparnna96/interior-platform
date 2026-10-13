import { Injectable, computed, signal } from '@angular/core';

/** localStorage key for the saved product ids. */
export const WISHLIST_KEY = 'ip.wishlist';

/** Reads the saved ids; anything unreadable or malformed counts as an empty list. */
function readSaved(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(WISHLIST_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((x): x is string => typeof x === 'string' && x !== ''))];
  } catch {
    return [];
  }
}

/**
 * Wishlist ("Saved" pieces), kept in this browser only.
 *
 * Product ids live in localStorage: no account, API or database is involved,
 * so a list does not follow the visitor to another device or browser. Newest
 * saves come first.
 */
@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly idsState = signal<string[]>(readSaved());

  /** Saved product ids, newest first. */
  readonly ids = this.idsState.asReadonly();
  /** Number of saved pieces — drives the navbar badge. */
  readonly count = computed(() => this.idsState().length);

  has(productId: string): boolean {
    return this.idsState().includes(productId);
  }

  /** Saves the piece, or removes it when it is already saved. */
  toggle(productId: string): void {
    if (!productId) return;
    this.set(this.has(productId) ? this.idsState().filter((id) => id !== productId) : [productId, ...this.idsState()]);
  }

  remove(productId: string): void {
    if (this.has(productId)) this.set(this.idsState().filter((id) => id !== productId));
  }

  /** Drops saved ids that are not in `available` (pieces the shop no longer sells). */
  retain(available: ReadonlySet<string>): void {
    const kept = this.idsState().filter((id) => available.has(id));
    if (kept.length !== this.idsState().length) this.set(kept);
  }

  private set(ids: string[]): void {
    this.idsState.set(ids);
    try {
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(ids));
    } catch {
      // Storage is full or blocked (private mode): the list still works until the page closes.
    }
  }
}
