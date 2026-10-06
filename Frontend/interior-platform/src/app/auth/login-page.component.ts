import { AfterViewInit, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { landingPathFor, safeReturnUrl } from '../app-paths';
import { LoginComponent } from './login.component';

/**
 * The /login page. After a successful login the visitor goes back to the page
 * they were heading for (validated `returnUrl`), or to their role's landing
 * page. Unsafe return addresses are ignored, so this can never be used as an
 * open redirect.
 */
@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [LoginComponent],
  styleUrl: './auth-pages.css',
  template: `
    <section class="auth-page" aria-label="Log in">
      <header class="auth-head">
        <p class="kicker">Account</p>
        <h1>Log in</h1>
        <p class="sub">Log in to use your cart, estimates, proposals and orders. You can browse without an account.</p>
      </header>
      <div class="auth-card">
        <app-login (loggedIn)="onLoggedIn()" />
      </div>
      <p class="auth-switch">
        New here?
        <button type="button" class="linklike" (click)="goRegister()">Create an account</button>
      </p>
    </section>
  `,
})
export class LoginPageComponent implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  ngAfterViewInit(): void {
    setTimeout(() => document.getElementById('login-email')?.focus(), 0);
  }

  /** The validated return address from the current URL, or null. */
  private returnUrl(): string | null {
    return safeReturnUrl(this.router.parseUrl(this.router.url).queryParams['returnUrl']);
  }

  onLoggedIn(): void {
    const target = this.returnUrl() ?? landingPathFor(this.auth.roles());
    this.router.navigateByUrl(target).catch(() => undefined);
  }

  goRegister(): void {
    const returnUrl = this.returnUrl();
    this.router
      .navigate(['/register'], returnUrl ? { queryParams: { returnUrl } } : {})
      .catch(() => undefined);
  }
}
