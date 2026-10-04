import { Injectable, InjectionToken, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import type { LeadResponse } from '../leads/lead.service';

/**
 * Public WhatsApp business number (digits only, with country code).
 * Defaults to the environment value; overridable for tests or a future
 * provider. It is public contact information, not a secret.
 */
export const WHATSAPP_BUSINESS_NUMBER = new InjectionToken<string>('WHATSAPP_BUSINESS_NUMBER', {
  providedIn: 'root',
  factory: () => environment.whatsappBusinessNumber,
});

/** E.164 allows at most 15 digits; anything shorter than 8 is not a real number. */
const BUSINESS_NUMBER_PATTERN = /^\d{8,15}$/;

const BRAND_NAME = 'Confident Group';

/**
 * Click-to-WhatsApp handoff (first stage). Pure client-side: builds a
 * https://wa.me/{number}?text={message} link from an already persisted lead
 * and opens it in a new browsing context. No HTTP calls, no credentials, and
 * nothing is stored or logged. A future official WhatsApp Business API
 * integration can replace or extend this service without touching callers.
 */
@Injectable({ providedIn: 'root' })
export class WhatsappService {
  private readonly rawNumber = inject(WHATSAPP_BUSINESS_NUMBER);

  /** True only when a syntactically valid digits-only number is configured. */
  isConfigured(): boolean {
    return BUSINESS_NUMBER_PATTERN.test(this.rawNumber ?? '');
  }

  /**
   * Builds the enquiry message from the persisted lead. Optional parts are
   * omitted when unavailable. `productName` is only used when supplied.
   */
  buildMessage(lead: LeadResponse, productName?: string | null): string {
    const contact = [
      `Name: ${clean(lead.name)}`,
      `Phone: ${clean(lead.phone)}`,
    ];
    const email = clean(lead.email);
    if (email) contact.push(`Email: ${email}`);

    const blocks = [
      `Hello ${BRAND_NAME},`,
      'I have submitted an interior enquiry through your website.',
      `Lead ID: ${clean(lead.id)}`,
      contact.join('\n'),
      `Enquiry:\n${clean(lead.message)}`,
    ];

    const product = clean(productName);
    if (product) blocks.push(`Interested Product:\n${product}`);

    const source = clean(lead.source);
    if (source) blocks.push(`Source:\n${source}`);

    blocks.push('Thank you.');
    return blocks.join('\n\n');
  }

  /** wa.me click-to-chat URL, or null when WhatsApp is not configured. */
  buildUrl(lead: LeadResponse, productName?: string | null): string | null {
    if (!this.isConfigured()) return null;
    const text = encodeURIComponent(this.buildMessage(lead, productName));
    return `https://wa.me/${this.rawNumber}?text=${text}`;
  }

  /**
   * Opens WhatsApp for a persisted lead in a new tab/app. Returns false when
   * WhatsApp is not configured (nothing is opened).
   */
  openChat(lead: LeadResponse, productName?: string | null): boolean {
    const url = this.buildUrl(lead, productName);
    if (!url) return false;
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }
}

/** Trims and drops null/undefined so no "undefined"/"null" text can leak. */
function clean(value: string | null | undefined): string {
  return value == null ? '' : String(value).trim();
}
