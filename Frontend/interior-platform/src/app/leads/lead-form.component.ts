import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { LeadService } from './lead.service';

/** Rejects whitespace-only values that Validators.required would accept. */
export function nonBlank(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (value == null || String(value).trim().length === 0) {
    return { blank: true };
  }
  return null;
}

/**
 * Reusable interior enquiry form. Submits to POST /api/leads (anonymous).
 * Product context (interestedProductId) and source are supplied by the
 * parent page — the visitor never types them.
 */
@Component({
  selector: 'app-lead-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './lead-form.component.html',
  styleUrl: './lead-form.component.css',
})
export class LeadFormComponent implements OnChanges {
  /** Optional product slug submitted as interestedProductId. */
  @Input() interestedProductId?: string;
  /** Optional label shown as the enquiry context (e.g. product name). */
  @Input() contextLabel?: string;
  /** Optional source tag submitted with the lead (e.g. "Furniture Product"). */
  @Input() source?: string;

  form: FormGroup;
  isSubmitting = false;
  submitted = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private leadService: LeadService,
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, nonBlank, Validators.maxLength(100)]],
      phone: ['', [Validators.required, nonBlank, Validators.maxLength(20)]],
      email: ['', [Validators.email, Validators.maxLength(256)]],
      message: ['', [Validators.required, nonBlank, Validators.maxLength(2000)]],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['interestedProductId'] || changes['source']) {
      this.resetState();
    }
  }

  onSubmit(): void {
    this.errorMessage = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isSubmitting) return;
    this.isSubmitting = true;

    const value = this.form.value;
    this.leadService
      .submitLead({
        name: String(value.name).trim(),
        phone: String(value.phone).trim(),
        email: value.email ? String(value.email).trim() : undefined,
        message: String(value.message).trim(),
        interestedProductId: this.interestedProductId,
        source: this.source,
      })
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          this.submitted = true;
          this.form.reset();
        },
        error: () => {
          this.isSubmitting = false;
          this.errorMessage =
            'Something went wrong while sending your enquiry. Please check your details and try again.';
        },
      });
  }

  /** Clears the success state so another enquiry can be sent. */
  sendAnother(): void {
    this.submitted = false;
    this.errorMessage = '';
  }

  private resetState(): void {
    this.submitted = false;
    this.errorMessage = '';
    this.isSubmitting = false;
  }
}
