import { Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { CartService } from '../catalogue/cart.service';
import { safeAdminReturnUrl } from '../app-paths';

/**
 * The /admin/login page: the only way into the Admin area.
 *
 * It uses the same POST /api/auth/login as the customer login (one auth
 * system), but it only ever ends in an Admin session. An account without the
 * Admin role is signed out again and told so, so signing in here never leaves
 * a customer or field-staff session behind. After a successful login the Admin
 * goes back to the Admin page they were heading for (a validated `returnUrl`
 * that must stay inside /admin), or to the dashboard.
 *
 * Display logic only: the API still enforces every Admin permission itself.
 */
@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './admin-login.component.html',
  styleUrl: './admin-login.component.css',
})
export class AdminLoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly cart = inject(CartService);
  private readonly router = inject(Router);
  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly submitting = signal(false);
  /** The last failure, shown above the button, or null. */
  readonly error = signal<string | null>(null);

  constructor() {
    // Ready to type as soon as the page appears.
    afterNextRender(() => this.emailInput()?.nativeElement.focus());
  }

  emailError(): string | null {
    const control = this.form.controls.email;
    if (!control.invalid || !(control.touched || control.dirty)) return null;
    return control.hasError('required') ? 'Enter your email address.' : 'Enter a valid email address.';
  }

  passwordError(): string | null {
    const control = this.form.controls.password;
    if (!control.invalid || !(control.touched || control.dirty)) return null;
    return 'Enter your password.';
  }

  submit(): void {
    if (this.submitting()) return;
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email.trim(), password).subscribe({
      next: () => {
        this.submitting.set(false);
        // The cart belongs to whoever was signed in before: never carry it over.
        this.cart.clear();
        if (!this.auth.isAdmin()) {
          this.auth.logout();
          this.error.set('This account does not have Admin access.');
          return;
        }
        this.form.reset();
        this.cart.load();
        this.router.navigateByUrl(this.target()).catch(() => undefined);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.error.set(this.describe(err));
      },
    });
  }

  /** Where to go after a successful login: a safe Admin return address, else the dashboard. */
  private target(): string {
    const raw = this.router.parseUrl(this.router.url).queryParams['returnUrl'];
    return safeAdminReturnUrl(typeof raw === 'string' ? raw : null) ?? '/admin';
  }

  private describe(err: unknown): string {
    const status = (err as { status?: number })?.status;
    if (status === 401) return 'Invalid email or password.';
    const body = (err as { error?: unknown })?.error;
    if (body && typeof body === 'object') {
      const title = (body as Record<string, unknown>)['title'];
      if (typeof title === 'string' && title) return title;
    }
    if (typeof body === 'string' && body) return body;
    return 'Login failed. Please try again.';
  }
}
