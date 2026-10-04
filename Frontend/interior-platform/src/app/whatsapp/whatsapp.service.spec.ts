import { TestBed } from '@angular/core/testing';
import { WHATSAPP_BUSINESS_NUMBER, WhatsappService } from './whatsapp.service';
import type { LeadResponse } from '../leads/lead.service';

const NUMBER = '919876543210';

function lead(partial: Partial<LeadResponse> = {}): LeadResponse {
  return {
    id: 'lead-id-1',
    name: 'Asha Rao',
    phone: '+911234567890',
    email: 'asha@example.com',
    message: 'Living room makeover.',
    interestedProductId: null,
    source: 'Interior Enquiry',
    status: 0,
    createdAt: '2026-09-30T10:00:00Z',
    ...partial,
  };
}

function serviceFor(number: string): WhatsappService {
  TestBed.configureTestingModule({
    providers: [{ provide: WHATSAPP_BUSINESS_NUMBER, useValue: number }],
  });
  return TestBed.inject(WhatsappService);
}

describe('WhatsappService', () => {
  it('is configured when a valid digits-only number is supplied', () => {
    expect(serviceFor(NUMBER).isConfigured()).toBeTrue();
  });

  it('is not configured when the number is empty', () => {
    const service = serviceFor('');
    expect(service.isConfigured()).toBeFalse();
    expect(service.buildUrl(lead())).toBeNull();
    expect(service.openChat(lead())).toBeFalse();
  });

  it('is not configured by default (no company number in the project)', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(WhatsappService).isConfigured()).toBeFalse();
  });

  it('rejects numbers that are not digits only', () => {
    for (const bad of [
      '+919876543210',
      '91 98765 43210',
      '91-9876543210',
      '(91)9876543210',
      '91987abc3210',
      'evil.com/x?y=',
      'https://example.com',
      '123',
      '1'.repeat(16),
    ]) {
      TestBed.resetTestingModule();
      const service = serviceFor(bad);
      expect(service.isConfigured()).withContext(bad).toBeFalse();
      expect(service.buildUrl(lead())).withContext(bad).toBeNull();
    }
  });

  it('builds a wa.me URL with the configured number and encoded text', () => {
    const service = serviceFor(NUMBER);
    const url = service.buildUrl(lead())!;
    expect(url.startsWith(`https://wa.me/${NUMBER}?text=`)).toBeTrue();
    const text = url.slice(`https://wa.me/${NUMBER}?text=`.length);
    expect(decodeURIComponent(text)).toBe(service.buildMessage(lead()));
    expect(text).not.toContain('\n');
    expect(text).not.toContain(' ');
    expect(new URL(url).hostname).toBe('wa.me');
  });

  it('includes the required lead fields and the server lead id', () => {
    const message = serviceFor(NUMBER).buildMessage(lead());
    expect(message).toContain('Hello Confident Group,');
    expect(message).toContain('I have submitted an interior enquiry through your website.');
    expect(message).toContain('Lead ID: lead-id-1');
    expect(message).toContain('Name: Asha Rao');
    expect(message).toContain('Phone: +911234567890');
    expect(message).toContain('Email: asha@example.com');
    expect(message).toContain('Enquiry:\nLiving room makeover.');
    expect(message).toContain('Source:\nInterior Enquiry');
    expect(message).toContain('Thank you.');
  });

  it('omits the email line when no email was provided', () => {
    const service = serviceFor(NUMBER);
    expect(service.buildMessage(lead({ email: null }))).not.toContain('Email');
    expect(service.buildMessage(lead({ email: '  ' }))).not.toContain('Email');
  });

  it('omits the product section when no product is available', () => {
    const service = serviceFor(NUMBER);
    expect(service.buildMessage(lead())).not.toContain('Interested Product');
    expect(service.buildMessage(lead(), null)).not.toContain('Interested Product');
    expect(service.buildMessage(lead(), '  ')).not.toContain('Interested Product');
  });

  it('includes the product name when supplied', () => {
    const message = serviceFor(NUMBER).buildMessage(
      lead({ source: 'Furniture Product', interestedProductId: 'aria-3s-sofa' }),
      'Aria 3-Seater Fabric Sofa'
    );
    expect(message).toContain('Interested Product:\nAria 3-Seater Fabric Sofa');
    expect(message).toContain('Source:\nFurniture Product');
  });

  it('omits the source section when there is no source', () => {
    expect(serviceFor(NUMBER).buildMessage(lead({ source: null }))).not.toContain('Source');
  });

  it('never prints undefined or null', () => {
    const message = serviceFor(NUMBER).buildMessage(
      lead({ email: null, source: null, interestedProductId: null }),
      undefined
    );
    expect(message).not.toContain('undefined');
    expect(message).not.toContain('null');
    expect(message).not.toMatch(/:\s*\n\n/);
  });

  it('encodes special characters safely', () => {
    const service = serviceFor(NUMBER);
    const tricky = lead({ message: 'Need 2 sofas & a table? 100% #urgent =yes\nLine two "quoted" ₹5,000' });
    const url = service.buildUrl(tricky)!;
    const query = url.split('?text=')[1];
    expect(query).not.toMatch(/[&#\s"]/);
    expect(query).not.toContain('=');
    expect(decodeURIComponent(query)).toContain('Need 2 sofas & a table? 100% #urgent =yes\nLine two "quoted" ₹5,000');
    // Only the text parameter exists; nothing injected into the URL.
    expect(new URL(url).searchParams.get('text')).toBe(service.buildMessage(tricky));
    expect([...new URL(url).searchParams.keys()]).toEqual(['text']);
  });

  it('opens the generated URL safely in a new context and makes no HTTP calls', () => {
    const service = serviceFor(NUMBER);
    const open = spyOn(window, 'open').and.returnValue(null);
    expect(service.openChat(lead(), 'Sofa')).toBeTrue();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(service.buildUrl(lead(), 'Sofa')!, '_blank', 'noopener,noreferrer');
  });

  it('does not touch browser storage', () => {
    const service = serviceFor(NUMBER);
    const local = spyOn(localStorage, 'setItem').and.callThrough();
    const session = spyOn(sessionStorage, 'setItem').and.callThrough();
    spyOn(window, 'open').and.returnValue(null);
    service.openChat(lead());
    expect(local).not.toHaveBeenCalled();
    expect(session).not.toHaveBeenCalled();
  });
});
