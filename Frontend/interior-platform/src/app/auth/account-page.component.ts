import { Component, computed, inject, output } from '@angular/core';
import { AuthService, ROLE_ADMIN, ROLE_FIELD_STAFF } from '../auth.service';
import { CartService } from '../catalogue/cart.service';
import type { AppView } from '../app-paths';

/**
 * The /account page: who is logged in, where to go next, and Log out.
 * Navigation is reported to the shell through outputs so the address bar and
 * the page stay in step in one place.
 */
@Component({
  selector: 'app-account-page',
  standalone: true,
  styleUrl: './auth-pages.css',
  template: `
    <section class="auth-page" aria-label="Your account">
      <header class="auth-head">
        <p class="kicker">Account</p>
        <h1>Your account</h1>
      </header>

      @if (!auth.isAuthenticated()) {
        <div class="auth-card">
          <p class="acct-h2">You are not logged in</p>
          <p class="sub">Log in to see your account, cart, estimates, proposals and orders.</p>
          <div class="acct-links">
            <button type="button" class="btn btn-primary" (click)="loginRequested.emit()">Log in</button>
          </div>
        </div>
      } @else {
        <div class="auth-card">
          <dl class="acct-rows">
            <div><dt>Email</dt><dd>{{ auth.email() ?? 'Signed in' }}</dd></div>
            <div><dt>Role</dt><dd>{{ roleLabel() }}</dd></div>
          </dl>
        </div>

        <div class="auth-card">
          <p class="acct-h2">Your activity</p>
          <div class="acct-links">
            <button type="button" class="btn btn-secondary" (click)="navigate.emit('orders')">Orders</button>
            <button type="button" class="btn btn-secondary" (click)="navigate.emit('proposals')">Proposals</button>
            <button type="button" class="btn btn-secondary" (click)="navigate.emit('estimates')">Estimates</button>
            <button type="button" class="btn btn-secondary" (click)="navigate.emit('cart')">Cart ({{ cart.totalQty() }})</button>
          </div>
        </div>

        @if (auth.isStaff()) {
          <div class="auth-card">
            <p class="acct-h2">Team tools</p>
            <div class="acct-links">
              <button type="button" class="btn btn-secondary" (click)="navigate.emit('leads')">Leads</button>
              @if (auth.isAdmin()) {
                <button type="button" class="btn btn-secondary" (click)="navigate.emit('admin-dashboard')">Dashboard</button>
                <button type="button" class="btn btn-secondary" (click)="navigate.emit('admin-products')">Products</button>
                <button type="button" class="btn btn-secondary" (click)="navigate.emit('admin-orders')">Manage orders</button>
                <button type="button" class="btn btn-secondary" (click)="navigate.emit('admin-proposals')">Manage proposals</button>
              }
            </div>
          </div>
        }

        <div class="acct-links">
          <button type="button" class="btn btn-primary" (click)="logout()">Log out</button>
        </div>
      }
    </section>
  `,
})
export class AccountPageComponent {
  readonly auth = inject(AuthService);
  readonly cart = inject(CartService);

  /** Asks the shell to open another page. */
  readonly navigate = output<AppView>();
  /** Asks the shell to open the login page (visitor landed here logged out). */
  readonly loginRequested = output<void>();

  readonly roleLabel = computed(() => {
    const roles = this.auth.roles();
    if (roles.includes(ROLE_ADMIN)) return 'Admin';
    if (roles.includes(ROLE_FIELD_STAFF)) return 'Field staff';
    return 'Customer';
  });

  /** Ends the session, clears the per-user cart, and returns to the home page. */
  logout(): void {
    this.auth.logout();
    this.cart.clear();
    this.navigate.emit('home');
  }
}
