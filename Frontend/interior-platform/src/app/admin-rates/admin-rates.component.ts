import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { AuthService } from '../auth.service';
import {
  AdminEstimateRateService,
  MAX_ESTIMATE_RATE,
  type AdminEstimateRateDto,
} from '../estimate/estimate-rate.service';

/** Accepts whole rupees or up to two decimals, matching the server rule. */
function twoDecimals(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (value === null || value === undefined || value === '') return null;
  return /^\d+(\.\d{1,2})?$/.test(String(value)) ? null : { decimals: true };
}

/**
 * Internal Admin-only Rate Master over GET and POST /api/admin/estimate-rates.
 * Visible only to Admin sessions; the backend remains the authorization
 * boundary, so anyone else issues no requests and sees an access-denied or
 * login state instead.
 *
 * The history is append-only: "Set rate" adds a new active rate and keeps the
 * old ones. There is no edit or delete. A confirmation step spells out what
 * changes (new estimates only) before anything is sent. Existing estimates and
 * proposals keep the rate they were created with.
 */
@Component({
  selector: 'app-admin-rates',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-rates.component.html',
  styleUrl: './admin-rates.component.css',
})
export class AdminRatesComponent {
  private readonly auth = inject(AuthService);
  private readonly rates = inject(AdminEstimateRateService);
  private readonly fb = inject(FormBuilder);

  /** Admin-only gate; anyone else never loads admin data. */
  readonly canAccess = computed(() => this.auth.isAdmin());
  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());

  readonly list = signal<AdminEstimateRateDto[] | null>(null);
  readonly listLoading = signal(false);
  readonly listError = signal<string | null>(null);
  readonly forbidden = signal(false);
  readonly notice = signal<string | null>(null);

  /** The rate waiting for the Admin's confirmation; null when none is armed. */
  readonly confirming = signal<number | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly maxRate = MAX_ESTIMATE_RATE;

  /** The single rate new estimates use right now. */
  readonly active = computed(() => this.list()?.find((r) => r.isActive) ?? null);

  readonly form = this.fb.group({
    rate: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(MAX_ESTIMATE_RATE),
      twoDecimals,
    ]),
  });

  constructor() {
    if (this.auth.isAdmin()) {
      this.loadRates();
    }
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        // Never show one session's admin data to another session.
        this.resetAll();
      } else if (
        this.auth.isAdmin() &&
        this.list() === null &&
        !this.listLoading() &&
        !this.listError() &&
        !this.forbidden()
      ) {
        this.loadRates();
      }
    });
  }

  /** GET /api/admin/estimate-rates — Admin only; no-op otherwise or while loading. */
  loadRates(): void {
    if (!this.auth.isAdmin() || this.listLoading()) return;
    this.listLoading.set(true);
    this.listError.set(null);
    this.forbidden.set(false);
    this.rates.getRates().subscribe({
      next: (rows) => {
        this.list.set(rows ?? []);
        this.listLoading.set(false);
      },
      error: (err: unknown) => {
        this.listLoading.set(false);
        this.handleListError(err);
      },
    });
  }

  /** First tap validates and arms the confirmation; nothing is sent yet. */
  requestSet(): void {
    if (!this.auth.isAdmin() || this.saving()) return;
    this.formError.set(null);
    this.notice.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('Enter a rate greater than 0, up to 2 decimals.');
      return;
    }
    this.confirming.set(Number(this.form.getRawValue().rate));
  }

  cancelConfirm(): void {
    if (this.saving()) return;
    this.confirming.set(null);
    this.formError.set(null);
  }

  /** POST the confirmed rate. The body carries the rate only. */
  confirmSet(): void {
    const rate = this.confirming();
    if (!this.auth.isAdmin() || rate === null || this.saving()) return;
    this.saving.set(true);
    this.formError.set(null);
    this.rates.setRate(rate).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.confirming.set(null);
        this.form.reset({ rate: null });
        this.notice.set(
          res.status === 201
            ? `Rate set to ₹${this.inr(rate)} / sq ft. New estimates will use it.`
            : `₹${this.inr(rate)} / sq ft is already the current rate. Nothing changed.`
        );
        this.loadRates();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.handleSaveError(err);
      },
    });
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  private resetAll(): void {
    this.list.set(null);
    this.listLoading.set(false);
    this.listError.set(null);
    this.forbidden.set(false);
    this.notice.set(null);
    this.confirming.set(null);
    this.saving.set(false);
    this.formError.set(null);
    this.form.reset({ rate: null });
  }

  private handleListError(err: unknown): void {
    const status = (err as { status?: number })?.status;
    if (status === 401) {
      this.auth.logout();
      this.resetAll();
      this.listError.set('Your session has expired. Please log in again.');
      return;
    }
    if (status === 403) {
      this.forbidden.set(true);
      return;
    }
    this.listError.set(this.describeError(err));
  }

  private handleSaveError(err: unknown): void {
    const status = (err as { status?: number })?.status;
    if (status === 401) {
      this.auth.logout();
      this.resetAll();
      this.listError.set('Your session has expired. Please log in again.');
      return;
    }
    if (status === 403) {
      this.forbidden.set(true);
      this.confirming.set(null);
      return;
    }
    if (status === 409) {
      // Another Admin changed the rate first. Show the latest history; the
      // confirmation stays closed so nothing is re-sent without a fresh look.
      this.confirming.set(null);
      this.formError.set(this.describeError(err));
      this.loadRates();
      return;
    }
    // The confirmation stays open so the same rate can be retried.
    this.formError.set(this.describeError(err));
  }

  private describeError(err: unknown): string {
    const status = (err as { status?: number })?.status;
    const body = (err as { error?: unknown })?.error;
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      const errors = record['errors'];
      if (errors && typeof errors === 'object') {
        const first = Object.values(errors as Record<string, unknown>)
          .flat()
          .map(String)
          .find((m) => m);
        if (first) return first;
      }
      const title = record['title'];
      if (typeof title === 'string' && title) return title;
    }
    if (typeof body === 'string' && body) return body;
    if (status === 409) return 'The rate was changed by someone else. Reload and try again.';
    return 'Something went wrong. Please try again.';
  }
}
