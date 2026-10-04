import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { LeadFormComponent } from './lead-form.component';
import { LeadService, type LeadCreateRequest } from './lead.service';
import { WHATSAPP_BUSINESS_NUMBER } from '../whatsapp/whatsapp.service';

const API_RESPONSE = {
  id: 'lead-id-1',
  name: 'Asha Rao',
  phone: '+911234567890',
  email: 'asha@example.com',
  message: 'Living room makeover.',
  interestedProductId: 'aria-3s-sofa',
  source: 'Furniture Product',
  status: 0,
  createdAt: '2026-09-30T10:00:00Z',
};

describe('LeadFormComponent', () => {
  let submitLead: jasmine.Spy;

  async function setup(inputs?: {
    interestedProductId?: string;
    contextLabel?: string;
    source?: string;
  }) {
    submitLead = jasmine.createSpy('submitLead').and.returnValue(of(API_RESPONSE));
    await TestBed.configureTestingModule({
      imports: [LeadFormComponent],
      providers: [{ provide: LeadService, useValue: { submitLead } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(LeadFormComponent);
    const cmp = fixture.componentInstance;
    if (inputs?.interestedProductId !== undefined) {
      cmp.interestedProductId = inputs.interestedProductId;
    }
    if (inputs?.contextLabel !== undefined) {
      cmp.contextLabel = inputs.contextLabel;
    }
    if (inputs?.source !== undefined) {
      cmp.source = inputs.source;
    }
    fixture.detectChanges();
    return { fixture, cmp };
  }

  function fillValid(fixture: ReturnType<typeof TestBed.createComponent<LeadFormComponent>>) {
    const cmp = fixture.componentInstance;
    cmp.form.setValue({
      name: 'Asha Rao',
      phone: '+911234567890',
      email: 'asha@example.com',
      message: 'Living room makeover.',
    });
    fixture.detectChanges();
  }

  it('creates an empty, unsubmitted form', async () => {
    const { cmp } = await setup();
    expect(cmp).toBeTruthy();
    expect(cmp.form.invalid).toBeTrue();
    expect(cmp.isSubmitting).toBe(false);
    expect(cmp.submitted).toBe(false);
  });

  it('does not submit when required fields are missing', async () => {
    const { cmp } = await setup();
    cmp.onSubmit();
    expect(submitLead).not.toHaveBeenCalled();
    expect(cmp.submitted).toBe(false);
  });

  it('rejects an invalid email address', async () => {
    const { fixture, cmp } = await setup();
    cmp.form.setValue({
      name: 'Asha Rao',
      phone: '+911234567890',
      email: 'not-an-email',
      message: 'Living room makeover.',
    });
    fixture.detectChanges();
    expect(cmp.form.get('email')?.invalid).toBeTrue();
    cmp.onSubmit();
    expect(submitLead).not.toHaveBeenCalled();
  });

  it('rejects over-length values', async () => {
    const { cmp } = await setup();
    cmp.form.get('name')?.setValue('x'.repeat(101));
    cmp.form.get('phone')?.setValue('1'.repeat(21));
    cmp.form.get('message')?.setValue('m'.repeat(2001));
    expect(cmp.form.get('name')?.invalid).toBeTrue();
    expect(cmp.form.get('phone')?.invalid).toBeTrue();
    expect(cmp.form.get('message')?.invalid).toBeTrue();
    cmp.onSubmit();
    expect(submitLead).not.toHaveBeenCalled();
  });

  it('submits product id and source when supplied by the parent', async () => {
    const { fixture, cmp } = await setup({
      interestedProductId: 'aria-3s-sofa',
      contextLabel: 'Aria 3-Seater Fabric Sofa',
      source: 'Furniture Product',
    });
    fillValid(fixture);
    cmp.onSubmit();
    expect(submitLead).toHaveBeenCalledTimes(1);
    const sent = submitLead.calls.mostRecent().args[0] as LeadCreateRequest;
    expect(sent.interestedProductId).toBe('aria-3s-sofa');
    expect(sent.source).toBe('Furniture Product');
    expect(sent.name).toBe('Asha Rao');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Aria 3-Seater Fabric Sofa'
    );
  });

  it('submits without product context for a general enquiry', async () => {
    const { fixture, cmp } = await setup({ source: 'Interior Enquiry' });
    fillValid(fixture);
    cmp.onSubmit();
    const sent = submitLead.calls.mostRecent().args[0] as LeadCreateRequest;
    expect(sent.interestedProductId).toBeUndefined();
    expect(sent.source).toBe('Interior Enquiry');
  });

  it('disables submission while a request is in flight', async () => {
    const { fixture, cmp } = await setup();
    const pending = new Subject<typeof API_RESPONSE>();
    submitLead.and.returnValue(pending);
    fillValid(fixture);
    cmp.onSubmit();
    fixture.detectChanges();
    expect(cmp.isSubmitting).toBe(true);
    const button = fixture.nativeElement.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    // A second submit while in flight must not create a duplicate request.
    cmp.onSubmit();
    expect(submitLead).toHaveBeenCalledTimes(1);
    pending.next(API_RESPONSE);
    pending.complete();
  });

  it('shows a success state after a successful response', async () => {
    const { fixture, cmp } = await setup();
    fillValid(fixture);
    cmp.onSubmit();
    fixture.detectChanges();
    expect(cmp.submitted).toBe(true);
    expect(cmp.isSubmitting).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'submitted successfully'
    );
  });

  it('keeps entered values and shows an error after API failure', async () => {
    submitLead = jasmine.createSpy('submitLead').and.returnValue(
      throwError(() => new Error('Server error'))
    );
    await TestBed.configureTestingModule({
      imports: [LeadFormComponent],
      providers: [{ provide: LeadService, useValue: { submitLead } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(LeadFormComponent);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    cmp.form.setValue({
      name: 'Asha Rao',
      phone: '+911234567890',
      email: '',
      message: 'Living room makeover.',
    });
    cmp.onSubmit();
    fixture.detectChanges();
    expect(cmp.submitted).toBe(false);
    expect(cmp.isSubmitting).toBe(false);
    expect(cmp.form.get('name')?.value).toBe('Asha Rao');
    expect(cmp.form.get('message')?.value).toBe('Living room makeover.');
    expect(cmp.errorMessage.length).toBeGreaterThan(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Something went wrong'
    );
  });

  describe('Continue on WhatsApp', () => {
    const CTA = 'Continue on WhatsApp';
    const WA_NUMBER = '919876543210';

    async function setupWa(options: {
      number?: string;
      response?: unknown;
      inputs?: { interestedProductId?: string; contextLabel?: string; source?: string };
    } = {}) {
      const submit = jasmine
        .createSpy('submitLead')
        .and.returnValue(options.response ?? of(API_RESPONSE));
      await TestBed.configureTestingModule({
        imports: [LeadFormComponent],
        providers: [
          { provide: LeadService, useValue: { submitLead: submit } },
          { provide: WHATSAPP_BUSINESS_NUMBER, useValue: options.number ?? WA_NUMBER },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(LeadFormComponent);
      const cmp = fixture.componentInstance;
      Object.assign(cmp, options.inputs ?? {});
      fixture.detectChanges();
      return { fixture, cmp, submit };
    }

    function fill(fixture: ReturnType<typeof TestBed.createComponent<LeadFormComponent>>) {
      fixture.componentInstance.form.setValue({
        name: 'Asha Rao',
        phone: '+911234567890',
        email: 'asha@example.com',
        message: 'Living room makeover.',
      });
      fixture.detectChanges();
    }

    function text(fixture: ReturnType<typeof TestBed.createComponent<LeadFormComponent>>): string {
      return (fixture.nativeElement as HTMLElement).textContent ?? '';
    }

    function cta(fixture: ReturnType<typeof TestBed.createComponent<LeadFormComponent>>) {
      return Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('button')
      ).find((b) => b.textContent?.includes(CTA)) as HTMLButtonElement | undefined;
    }

    it('does not show the CTA before a successful submission', async () => {
      const { fixture } = await setupWa();
      expect(text(fixture)).not.toContain(CTA);
    });

    it('shows the CTA after a successful submission when configured', async () => {
      const { fixture, cmp } = await setupWa();
      fill(fixture);
      cmp.onSubmit();
      fixture.detectChanges();
      expect(text(fixture)).toContain('submitted successfully');
      expect(text(fixture)).toContain('Want to continue the conversation?');
      expect(cta(fixture)).toBeTruthy();
    });

    it('does not show the CTA after a failed submission', async () => {
      const { fixture, cmp } = await setupWa({
        response: throwError(() => new Error('Server error')),
      });
      fill(fixture);
      cmp.onSubmit();
      fixture.detectChanges();
      expect(text(fixture)).toContain('Something went wrong');
      expect(text(fixture)).not.toContain(CTA);
    });

    it('does not show the CTA while the submission is in flight', async () => {
      const { fixture, cmp } = await setupWa({ response: new Subject() });
      fill(fixture);
      cmp.onSubmit();
      fixture.detectChanges();
      expect(cmp.isSubmitting).toBe(true);
      expect(text(fixture)).not.toContain(CTA);
    });

    it('hides the CTA and shows no technical message when WhatsApp is not configured', async () => {
      const { fixture, cmp } = await setupWa({ number: '' });
      fill(fixture);
      cmp.onSubmit();
      fixture.detectChanges();
      expect(text(fixture)).toContain('submitted successfully');
      expect(text(fixture)).not.toContain(CTA);
      expect(text(fixture).toLowerCase()).not.toContain('whatsapp');
      expect(text(fixture)).not.toContain('whatsappBusinessNumber');
    });

    it('opens WhatsApp with the server lead id and product name for a product enquiry', async () => {
      const { fixture, cmp } = await setupWa({
        inputs: {
          interestedProductId: 'aria-3s-sofa',
          contextLabel: 'Aria 3-Seater Fabric Sofa',
          source: 'Furniture Product',
        },
      });
      const open = spyOn(window, 'open').and.returnValue(null);
      fill(fixture);
      cmp.onSubmit();
      fixture.detectChanges();

      cta(fixture)!.click();
      expect(open).toHaveBeenCalledTimes(1);
      const [url, target, features] = open.calls.mostRecent().args as [string, string, string];
      expect(url.startsWith(`https://wa.me/${WA_NUMBER}?text=`)).toBeTrue();
      expect(target).toBe('_blank');
      expect(features).toBe('noopener,noreferrer');
      const message = new URL(url).searchParams.get('text')!;
      expect(message).toContain('Lead ID: lead-id-1');
      expect(message).toContain('Interested Product:\nAria 3-Seater Fabric Sofa');
      expect(message).toContain('Source:\nFurniture Product');
    });

    it('omits product information for an interior enquiry', async () => {
      const { fixture, cmp } = await setupWa({
        response: of({
          ...API_RESPONSE,
          interestedProductId: null,
          source: 'Interior Enquiry',
        }),
        inputs: { contextLabel: 'Interior Enquiry', source: 'Interior Enquiry' },
      });
      const open = spyOn(window, 'open').and.returnValue(null);
      fill(fixture);
      cmp.onSubmit();
      fixture.detectChanges();

      cta(fixture)!.click();
      const url = open.calls.mostRecent().args[0] as string;
      const message = new URL(url).searchParams.get('text')!;
      expect(message).toContain('Source:\nInterior Enquiry');
      expect(message).not.toContain('Interested Product');
      expect(message).not.toContain('Interior Enquiry\n\nThank you.\nInterior');
    });

    it('builds the message from the persisted response, not the typed form values', async () => {
      const { fixture, cmp } = await setupWa({
        response: of({ ...API_RESPONSE, id: 'server-generated-id', name: 'Server Name' }),
      });
      fill(fixture);
      cmp.onSubmit();
      fixture.detectChanges();
      const open = spyOn(window, 'open').and.returnValue(null);
      cta(fixture)!.click();
      const message = new URL(open.calls.mostRecent().args[0] as string).searchParams.get('text')!;
      expect(message).toContain('Lead ID: server-generated-id');
      expect(message).toContain('Name: Server Name');
    });

    it('does not open WhatsApp from the component before a lead is persisted', async () => {
      const { cmp } = await setupWa();
      const open = spyOn(window, 'open').and.returnValue(null);
      cmp.continueOnWhatsapp();
      expect(open).not.toHaveBeenCalled();
    });

    it('does not resubmit the lead when the CTA is used', async () => {
      const { fixture, cmp, submit } = await setupWa();
      spyOn(window, 'open').and.returnValue(null);
      fill(fixture);
      cmp.onSubmit();
      fixture.detectChanges();
      cta(fixture)!.click();
      cta(fixture)!.click();
      expect(submit).toHaveBeenCalledTimes(1);
    });

    it('clears the CTA when making another enquiry', async () => {
      const { fixture, cmp } = await setupWa();
      fill(fixture);
      cmp.onSubmit();
      fixture.detectChanges();
      expect(cta(fixture)).toBeTruthy();
      cmp.sendAnother();
      fixture.detectChanges();
      expect(text(fixture)).not.toContain(CTA);
      expect(cmp.submittedLead).toBeNull();
    });
  });
});
