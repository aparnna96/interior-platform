import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { safeReturnUrl } from '../app-paths';
import { RegisterComponent } from '../register/register.component';
import { AUTH_REGISTER_IMAGE } from '../home/home-data';

/** The /register page. Registering does not log in; the link below leads to /login. */
@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [RegisterComponent],
  styleUrl: './auth-pages.css',
  template: `
    <section class="auth-page auth-split" aria-label="Create account">
      <div class="auth-photo" aria-hidden="true">
        <img [src]="photo.image" alt="" />
      </div>
      <div class="auth-main">
        <header class="auth-head">
          <p class="kicker">Account</p>
          <h1>Create your account</h1>
          <p class="sub">An account keeps your cart, saved estimates, proposals and orders together.</p>
        </header>
        <div class="auth-card">
          <app-register />
        </div>
        <p class="auth-switch">
          Already have an account?
          <button type="button" class="linklike" (click)="goLogin()">Log in</button>
        </p>
      </div>
    </section>
  `,
})
export class RegisterPageComponent {
  private readonly router = inject(Router);
  readonly photo = AUTH_REGISTER_IMAGE;

  goLogin(): void {
    const returnUrl = safeReturnUrl(this.router.parseUrl(this.router.url).queryParams['returnUrl']);
    this.router
      .navigate(['/login'], returnUrl ? { queryParams: { returnUrl } } : {})
      .catch(() => undefined);
  }
}
