import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { LeadFormComponent } from './lead-form.component';
import { LeadService, type LeadCreateRequest } from './lead.service';

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
});
