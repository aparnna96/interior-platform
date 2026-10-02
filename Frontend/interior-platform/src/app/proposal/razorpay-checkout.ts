/**
 * Minimal, narrowly-scoped types for the official Razorpay Checkout browser
 * script (`https://checkout.razorpay.com/v1/checkout.js`, TEST mode). Only
 * the fields this feature uses are declared. No secrets ever cross this
 * boundary: the browser receives the public Key ID from the backend payment
 * response, never the Key Secret.
 */

/** Official Razorpay Checkout browser script location. */
export const RAZORPAY_CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

/** Successful-looking Checkout result handed to the `handler` callback. */
export interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/** Options passed to the Checkout constructor (backend values only). */
export interface RazorpayCheckoutOptions {
  /** Public Key ID returned by POST /api/proposals/{id}/payment. */
  key: string;
  /** Token amount in the smallest currency unit (paise for INR). */
  amount: number;
  /** ISO currency code returned by the backend. */
  currency: string;
  /** Provider order id returned by the backend. */
  order_id: string;
  /** Display name; platform branding only, no legal details. */
  name?: string;
  /** Short description of what is being paid for. */
  description?: string;
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
  handler?: (response: RazorpayCheckoutResponse) => void;
}

/** A constructed Checkout instance. */
export interface RazorpayCheckoutInstance {
  open(): void;
  on(event: 'payment.failed', handler: (response: unknown) => void): void;
}

/** The `window.Razorpay` constructor installed by the Checkout script. */
export type RazorpayCheckoutConstructor = new (
  options: RazorpayCheckoutOptions
) => RazorpayCheckoutInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayCheckoutConstructor;
  }
}
