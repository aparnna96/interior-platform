import { Component, computed, inject, output } from '@angular/core';
import { AuthService } from '../auth.service';
import type { AppView } from '../app-paths';

/** One shortcut on the dashboard: the page it opens and what that page is for. */
interface QuickAction {
  readonly view: AppView;
  readonly label: string;
  readonly description: string;
}

/**
 * Admin back-office landing page at /admin.
 *
 * Stage 1 is the shell: an Admin-only page with quick actions to the existing
 * workspaces. It makes no API calls. The route guard keeps other roles out of
 * /admin, and this component repeats the check (like the other admin pages) so
 * a logged-out or non-Admin session sees a login or access-denied state and
 * never a shortcut. The backend remains the real authorization boundary.
 *
 * Navigation is reported to the shell through the `navigate` output so the
 * address bar and the page stay in step in one place.
 */
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css',
})
export class AdminDashboardComponent {
  private readonly auth = inject(AuthService);

  /** Admin-only gate; anyone else never sees a shortcut. */
  readonly canAccess = computed(() => this.auth.isAdmin());
  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());

  /** Asks the shell to open another page. */
  readonly navigate = output<AppView>();

  readonly actions: readonly QuickAction[] = [
    {
      view: 'admin-products',
      label: 'Manage products',
      description: 'Add, edit and deactivate catalogue products.',
    },
    {
      view: 'admin-orders',
      label: 'Manage orders',
      description: 'Review customer orders, delivery details and status.',
    },
    {
      view: 'admin-proposals',
      label: 'Manage proposals',
      description: 'See proposals, their token payments and the PDF.',
    },
    {
      view: 'admin-rates',
      label: 'Estimate rate',
      description: 'Set the ₹ per sq.ft. rate used for new estimates.',
    },
    {
      view: 'leads',
      label: 'Leads',
      description: 'Follow up website enquiries and update their status.',
    },
  ];

  /** Opens one of the shortcuts. A no-op for anyone who is not an Admin. */
  open(view: AppView): void {
    if (!this.auth.isAdmin()) return;
    this.navigate.emit(view);
  }
}
