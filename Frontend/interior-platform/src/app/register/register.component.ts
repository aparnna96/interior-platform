import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  form: FormGroup;
  isSubmitting = false;
  successMessage = '';
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
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

    this.authService.register(email, password).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.successMessage = 'Registration successful! You can now log in.';
        this.form.reset();
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = this.getErrorMessage(err);
      },
    });
  }

  private getErrorMessage(err: unknown): string {
    const error = (err as { error?: unknown; message?: string })?.error;

    // Backend returns { Errors: [...] } on Identity failures.
    if (error && typeof error === 'object') {
      const record = error as Record<string, unknown>;
      const candidates = [record['Errors'], record['errors']];

      for (const candidate of candidates) {
        if (Array.isArray(candidate) && candidate.length > 0) {
          return candidate.map(String).join(' ');
        }
        // ASP.NET validation problem: { errors: { Email: [...], Password: [...] } }
        if (candidate && typeof candidate === 'object') {
          const messages = Object.values(candidate as Record<string, unknown>).flat().map(String);
          if (messages.length > 0) {
            return messages.join(' ');
          }
        }
      }

      if (typeof record['title'] === 'string') {
        return record['title'];
      }
    }

    if (typeof error === 'string' && error.length > 0) {
      return error;
    }

    if (err instanceof Error && err.message) {
      return err.message;
    }

    return 'Registration failed. Please check your details and try again.';
  }
}
