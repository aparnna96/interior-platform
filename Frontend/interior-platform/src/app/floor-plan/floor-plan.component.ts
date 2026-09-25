import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface FloorPlanItem {
  uid: string;
  defId: 'bed' | 'wardrobe' | 'sofa' | 'table' | 'chair';
  name: string;
  short: string;
  w: number; // feet
  l: number; // feet
  x: number; // % left
  y: number; // % top
}

/**
 * Technical 2D floor-plan renderer (presentational only).
 * All room/furniture state lives in the parent — this component only
 * renders it. Percentages reuse the parent's formulas (w/width, l/length).
 */
@Component({
  selector: 'app-floor-plan',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './floor-plan.component.html',
  styleUrl: './floor-plan.component.css',
})
export class FloorPlanComponent {
  @Input() width = 12;
  @Input() length = 15;
  @Input() area = 180;
  @Input() wall = '#e4d7c0';
  @Input() floor = '#c9a87c';
  @Input() floorCode = 'FL-21';
  @Input() fabric = '#ece1d1';
  @Input() accent = '#7c5c3e';
  @Input() light: 'day' | 'evening' | 'night' = 'day';
  @Input() items: FloorPlanItem[] = [];
  @Input() selectedId: string | null = null;
  @Input() aspect = '12 / 15';
  @Input() planStyle: Record<string, string> = {};
  @Output() select = new EventEmitter<string>();

  wPct(it: FloorPlanItem): number {
    if (!Number.isFinite(this.width) || this.width <= 0) return 0;
    if (!Number.isFinite(it.w) || it.w <= 0) return 0;
    const v = (it.w / this.width) * 100;
    return Number.isFinite(v) ? v : 0;
  }

  hPct(it: FloorPlanItem): number {
    if (!Number.isFinite(this.length) || this.length <= 0) return 0;
    if (!Number.isFinite(it.l) || it.l <= 0) return 0;
    const v = (it.l / this.length) * 100;
    return Number.isFinite(v) ? v : 0;
  }
}
