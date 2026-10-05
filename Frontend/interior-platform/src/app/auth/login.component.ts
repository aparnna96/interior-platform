import { Component, output } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../auth.service';
import { CartService } from '../catalogue/cart.service';

/**
 * Minimal login form for the Account panel.
 *
 * Uses the existing AuthService token mechanism (POST /api/auth/login) —
 * no second auth system. On success the authenticated user's persistent
 * cart is loaded; logout clears it, so one user's cart is never shown to
 * another user.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  /** Emitted after a successful login so the shell can close the Account panel. */
  loggedIn = output<void>();

  form: FormGroup;
  isSubmitting = false;
  successMessage = '';
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private cart: CartService
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }

  get isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  onSubmit(): void {
    this.successMessage = '';
    this.errorMessage = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const { email, password } = this.form.value;

    this.authService.login(email, password).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.successMessage = 'Logged in. Loading your saved cart…';
        this.form.reset();
        this.cart.load();
        this.loggedIn.emit();
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = this.getErrorMessage(err);
      },
    });
  }

  onLogout(): void {
    this.authService.logout();
    this.cart.clear();
    this.successMessage = '';
    this.errorMessage = '';
  }

  private getErrorMessage(err: unknown): string {
    const status = (err as { status?: number })?.status;
    if (status === 401) {
      return 'Invalid email or password.';
    }
    const error = (err as { error?: unknown })?.error;
    if (error && typeof error === 'object') {
      const title = (error as Record<string, unknown>)['title'];
      if (typeof title === 'string' && title) {
        return title;
      }
    }
    if (typeof error === 'string' && error) {
      return error;
    }
    return 'Login failed. Please try again.';
  }
}
