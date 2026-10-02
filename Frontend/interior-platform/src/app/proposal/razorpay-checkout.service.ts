import { Injectable } from '@angular/core';
import {
  RAZORPAY_CHECKOUT_SCRIPT_URL,
  type RazorpayCheckoutInstance,
  type RazorpayCheckoutOptions,
} from './razorpay-checkout';

/**
 * Loads and opens the official Razorpay Checkout browser script on demand.
 *
 * The script is lazy-loaded (never in index.html) so the initial bundle and
 * first paint stay untouched; it is injected at most once per page load. All
 * values handed to Checkout (key, amount, currency, order id) must come from
 * the backend payment-order response — this service never invents them.
 */
@Injectable({ providedIn: 'root' })
export class RazorpayCheckoutService {
  private loadPromise: Promise<boolean> | null = null;

  /** True when the Checkout constructor is already available. */
  isAvailable(): boolean {
    return (
      typeof window !== 'undefined' && typeof window.Razorpay === 'function'
    );
  }

  /**
   * Ensures the Checkout script is loaded. Resolves true when
   * `window.Razorpay` is ready, false when the script cannot be loaded
   * (offline/blocked) instead of throwing.
   */
  load(): Promise<boolean> {
    if (this.isAvailable()) {
      return Promise.resolve(true);
    }
    if (this.loadPromise === null) {
      this.loadPromise = new Promise<boolean>((resolve) => {
        const script = document.createElement('script');
        script.src = RAZORPAY_CHECKOUT_SCRIPT_URL;
        script.async = true;
        script.onload = () => {
          resolve(this.isAvailable());
        };
        script.onerror = () => {
          resolve(false);
        };
        document.head.appendChild(script);
      }).then((loaded) => {
        // Allow a later retry to re-attempt the network load.
        if (!loaded) {
          this.loadPromise = null;
        }
        return loaded;
      });
    }
    return this.loadPromise;
  }

  /**
   * Constructs a Checkout instance, or null when the script is unavailable.
   * Callers treat null as payment-unavailable (never a crash).
   */
  open(options: RazorpayCheckoutOptions): RazorpayCheckoutInstance | null {
    if (!this.isAvailable() || !window.Razorpay) {
      return null;
    }
    return new window.Razorpay(options);
  }
}
