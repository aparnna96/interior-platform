import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { InteriorsComponent } from './interiors.component';
import { LeadFormComponent } from '../leads/lead-form.component';

const LEADS_URL = 'http://localhost:5175/api/leads';

describe('InteriorsComponent enquiry entry', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InteriorsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setup() {
    const fixture = TestBed.createComponent(InteriorsComponent);
    fixture.detectChanges();
    return fixture;
  }

  function cta(fixture: ReturnType<typeof TestBed.createComponent<InteriorsComponent>>) {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.in-actions button')
    );
    return buttons.find((b) => b.textContent?.includes('Talk to us')) as HTMLButtonElement;
  }

  it('creates with existing interiors content', async () => {
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance).toBeTruthy();
    expect(el.textContent).toContain('Interiors');
    expect(el.textContent).toContain('Browse by room');
    expect(el.textContent).toContain('Recent looks');
    expect(el.textContent).toContain('Explore Furniture');
    expect(el.querySelectorAll('.room-tile').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('.look-tile').length).toBeGreaterThan(0);
  });

  it('renders the Talk to us CTA and hides the form initially', async () => {
    const fixture = setup();
    expect(cta(fixture)).toBeTruthy();
    expect(fixture.componentInstance.showEnquiry()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-lead-form')).toBeFalsy();
  });

  it('opens the lead form when the CTA is chosen', async () => {
    const fixture = setup();
    cta(fixture).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.showEnquiry()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-lead-form')).toBeTruthy();
  });

  it('passes source Interior Enquiry with no product id to the form', async () => {
    const fixture = setup();
    cta(fixture).click();
    fixture.detectChanges();
    const leadForm = fixture.debugElement.query(By.directive(LeadFormComponent))
      .componentInstance as LeadFormComponent;
    expect(leadForm.source).toBe('Interior Enquiry');
    expect(leadForm.interestedProductId).toBeUndefined();
    expect(leadForm.contextLabel).toBe('Interior Enquiry');
  });

  it('submits a general enquiry successfully through the page', async () => {
    const fixture = setup();
    cta(fixture).click();
    fixture.detectChanges();
    const leadForm = fixture.debugElement.query(By.directive(LeadFormComponent))
      .componentInstance as LeadFormComponent;
    leadForm.form.setValue({
      name: 'Asha Rao',
      phone: '+911234567890',
      email: '',
      message: 'Bedroom interiors enquiry.',
    });
    leadForm.onSubmit();
    const req = httpMock.expectOne(LEADS_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Asha Rao',
      phone: '+911234567890',
      message: 'Bedroom interiors enquiry.',
      source: 'Interior Enquiry',
    });
    req.flush({
      id: 'lead-id-9',
      name: 'Asha Rao',
      phone: '+911234567890',
      email: null,
      message: 'Bedroom interiors enquiry.',
      interestedProductId: null,
      source: 'Interior Enquiry',
      status: 0,
      createdAt: '2026-09-30T10:00:00Z',
    });
    fixture.detectChanges();
    expect(leadForm.submitted).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'submitted successfully'
    );
  });

  it('keeps existing navigation working', async () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    let destination: unknown = null;
    cmp.navigate.subscribe((d: unknown) => (destination = d));
    cmp.go('catalogue');
    expect(destination).toBe('catalogue');
  });
});
