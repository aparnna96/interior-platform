import { Component, input, output } from '@angular/core';

export type AdminStateKind = 'loading' | 'empty' | 'error' | 'login' | 'denied';

const ICONS: Record<Exclude<AdminStateKind, 'loading'>, readonly string[]> = {
  empty: ['M2 9.5h3.2l.9 1.8h3.8l.9-1.8H14', 'M3.2 3.5h9.6l1.2 6v3A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-3z'],
  error: ['M8 2 14.5 13.5h-13z', 'M8 6.5v3', 'M8 11.6v.1'],
  login: ['M4.5 7V5a3.5 3.5 0 0 1 7 0v2', 'M3.5 7h9a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z'],
  denied: ['M8 1.5 13.5 3.5v4c0 3.2-2.2 5.6-5.5 7-3.3-1.4-5.5-3.8-5.5-7v-4z', 'M5.8 8l1.6 1.6L10.4 6.4'],
};

/**
 * One panel for every Admin page state: loading, empty, error, "log in" and
 * "no access". The page picks the kind and the words; this draws it, so the
 * markup (and its roles) is the same everywhere. Loading is announced
 * politely; errors and access problems are alerts. The optional action
 * (Try again, Back to list) is reported through `action`.
 */
@Component({
  selector: 'app-admin-state',
  standalone: true,
  template: `
    <div class="adm-state" [attr.data-kind]="kind()" [attr.role]="kind() === 'error' || kind() === 'denied' ? 'alert' : null" [attr.aria-live]="kind() === 'loading' ? 'polite' : null">
      @if (kind() === 'loading') {
        <span class="adm-spinner" aria-hidden="true"></span>
      } @else {
        <span class="adm-state-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16">
            @for (d of paths(); track d) {
              <path [attr.d]="d" />
            }
          </svg>
        </span>
      }
      <p class="adm-state-title">{{ title() }}</p>
      @if (message()) {
        <span class="adm-state-text">{{ message() }}</span>
      }
      @if (actionLabel()) {
        <button type="button" class="adm-btn adm-btn-primary" (click)="action.emit()">{{ actionLabel() }}</button>
      }
    </div>
  `,
})
export class AdminStateComponent {
  readonly kind = input.required<AdminStateKind>();
  readonly title = input.required<string>();
  readonly message = input<string | null>(null);
  readonly actionLabel = input<string | null>(null);
  readonly action = output<void>();

  paths(): readonly string[] {
    const k = this.kind();
    return k === 'loading' ? [] : ICONS[k];
  }
}
