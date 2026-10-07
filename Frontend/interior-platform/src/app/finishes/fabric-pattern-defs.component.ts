import { Component } from '@angular/core';

/**
 * Shared SVG fabric patterns (presentational only).
 *
 * Gradients cannot fill SVG shapes, so the plan and the elevation fill their
 * cushions and upholstery with these patterns instead. Place this component
 * inside the element that sets the `--fabric` custom property: each pattern
 * paints the fabric colour first, so the texture always follows the swatch.
 * The ids match the fabric entries in finish-patterns.ts.
 */
@Component({
  selector: 'app-fabric-pattern-defs',
  standalone: true,
  template: `
    <svg class="fabric-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="fab-weave" width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" style="fill: var(--fabric)" />
          <path d="M0 1 H3 M1 0 V3" stroke="rgba(0,0,0,0.14)" stroke-width="0.45" fill="none" />
        </pattern>
        <pattern id="fab-boucle" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" style="fill: var(--fabric)" />
          <circle cx="1" cy="1" r="0.7" fill="rgba(0,0,0,0.13)" />
          <circle cx="3" cy="3" r="0.7" fill="rgba(255,255,255,0.5)" />
        </pattern>
        <pattern id="fab-velvet" width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" style="fill: var(--fabric)" />
          <path d="M0 3 L3 0" stroke="rgba(0,0,0,0.10)" stroke-width="0.4" fill="none" />
        </pattern>
        <pattern id="fab-linen" width="6" height="2.5" patternUnits="userSpaceOnUse">
          <rect width="6" height="2.5" style="fill: var(--fabric)" />
          <path d="M0 1.2 H3.4 M3.8 2.3 H6" stroke="rgba(0,0,0,0.13)" stroke-width="0.4" fill="none" />
        </pattern>
      </defs>
    </svg>
  `,
  styles: [':host { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }'],
})
export class FabricPatternDefsComponent {}
