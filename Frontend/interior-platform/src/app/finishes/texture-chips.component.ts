import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FinishPattern } from './finish-patterns';

/**
 * One row of texture chips (presentational only). The parent owns the choice;
 * this component shows the options over the current swatch colour and reports
 * the tapped pattern id.
 */
@Component({
  selector: 'app-texture-chips',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tex-row" role="group" [attr.aria-label]="label + ' texture'">
      @for (p of patterns; track p.id) {
        <button
          type="button"
          class="tex-chip"
          [class.active]="p.id === selectedId"
          [attr.aria-pressed]="p.id === selectedId"
          [attr.data-pattern]="p.id"
          (click)="choose.emit(p.id)"
        >
          <span
            class="tex-thumb"
            aria-hidden="true"
            [style.background-color]="baseColor"
            [style.background-image]="p.preview"
            [style.background-size]="p.previewSize"
          ></span>
          <span class="tex-name">{{ p.name }}</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; min-width: 0; }
      .tex-row { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px; }
      .tex-chip { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 4px 11px 4px 5px; border: 1px solid var(--border); background: #fff; color: var(--ink-2); font: inherit; font-size: 12.5px; font-weight: 600; border-radius: 99px; cursor: pointer; }
      .tex-chip.active { border-color: #1c1917; box-shadow: 0 0 0 1px #1c1917; color: var(--ink); }
      .tex-chip:focus-visible { outline: 2px solid #1c1917; outline-offset: 2px; }
      .tex-thumb { width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(0, 0, 0, 0.14); flex: none; }
      .tex-name { white-space: nowrap; }
    `,
  ],
})
export class TextureChipsComponent {
  @Input() label = '';
  @Input() patterns: readonly FinishPattern[] = [];
  @Input() selectedId = '';
  /** The current swatch colour, shown behind each texture so the chip previews the result. */
  @Input() baseColor = '#e4d7c0';
  @Output() choose = new EventEmitter<string>();
}
