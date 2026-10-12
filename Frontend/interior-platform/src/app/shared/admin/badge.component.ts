import { Component, input } from '@angular/core';

/**
 * How a status reads at a glance. Colour is never the only signal: every
 * badge also carries the status text and a dot, and the tones keep AA contrast.
 */
export type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger';

/** Order status numbers: 0 Pending, 1 Confirmed, 2 Processing, 3 Completed, 4 Cancelled. */
export function orderTone(status: number): Tone {
  switch (status) {
    case 0: return 'warn';
    case 1:
    case 2: return 'info';
    case 3: return 'success';
    case 4: return 'danger';
    default: return 'neutral';
  }
}

/** Lead status numbers: 0 New (needs a follow-up), 1 In Progress, 2 Closed. */
export function leadTone(status: number): Tone {
  switch (status) {
    case 0: return 'warn';
    case 1: return 'info';
    case 2: return 'neutral';
    default: return 'neutral';
  }
}

/** Proposal payment state from the list flags. */
export function proposalPaymentTone(p: { isPaymentVerified: boolean; paymentAttemptCount: number }): Tone {
  if (p.isPaymentVerified) return 'success';
  return p.paymentAttemptCount > 0 ? 'warn' : 'neutral';
}

/** Payment row status numbers: 0 Pending, 1 Verified, 2 Failed. */
export function paymentTone(status: number): Tone {
  return status === 1 ? 'success' : status === 2 ? 'danger' : 'warn';
}

/** `<app-badge tone="success">Completed</app-badge>` */
@Component({
  selector: 'app-badge',
  standalone: true,
  template: `<span class="adm-badge" [attr.data-tone]="tone()"><ng-content /></span>`,
})
export class BadgeComponent {
  readonly tone = input<Tone>('neutral');
}
