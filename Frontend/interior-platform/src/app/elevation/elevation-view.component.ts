import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FloorPlanItem } from '../floor-plan/floor-plan.component';
import {
  DEFAULT_CEILING_HEIGHT_FT,
  ELEVATION_WALLS,
  ElevationGeometry,
  ElevationPiece,
  ElevationWall,
  buildElevationGeometry,
} from './elevation-geometry';
import { ElevationOpening, openingsForWall } from './room-openings';

/** A piece ready to draw: the geometry plus the name and footprint for labels. */
export interface ElevationViewPiece extends ElevationPiece {
  name: string;
  /** Footprint in feet as placed (after any rotation). */
  w: number;
  l: number;
}

/** Smallest drawing scale, so a 50 ft wall stays readable (the frame then scrolls inside itself). */
export const ELEVATION_MIN_PX_PER_FT = 16;
/** Target drawing height for a wall at the normal scale. */
export const ELEVATION_MAX_HEIGHT_PX = 420;

/**
 * Technical 2D wall elevation (presentational only).
 *
 * The parent keeps all room and furniture state. This component only draws it:
 * the wall, its window or door, the floor line and the placed furniture, back
 * to front. It deliberately has no loose decor (no rugs, lamps, plants or art)
 * and no labels on the drawing; the selected piece is named below it.
 */
@Component({
  selector: 'app-elevation-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './elevation-view.component.html',
  styleUrl: './elevation-view.component.css',
})
export class ElevationViewComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() width = 12;
  @Input() length = 15;
  @Input() ceilingHeight = DEFAULT_CEILING_HEIGHT_FT;
  @Input() items: readonly FloorPlanItem[] = [];
  @Input() selectedId: string | null = null;
  @Input() wall: ElevationWall = 'top';
  @Input() wallColor = '#e4d7c0';
  @Input() floorColor = '#c9a87c';
  @Input() fabric = '#ece1d1';
  @Input() accent = '#7c5c3e';
  @Input() light: 'day' | 'evening' | 'night' = 'day';
  @Output() select = new EventEmitter<string>();
  @Output() wallChange = new EventEmitter<ElevationWall>();

  readonly walls = ELEVATION_WALLS;

  geometry!: ElevationGeometry;
  pieces: ElevationViewPiece[] = [];
  openings: ElevationOpening[] = [];
  selected: ElevationViewPiece | null = null;
  /** CSS width of the drawing frame. */
  widthCss = '100%';
  /** Narrowest the frame may get, in px, before it scrolls instead of shrinking. */
  minWidthPx = 0;

  /** True when the drawing is wider than its frame, so it scrolls sideways inside it. */
  scrollable = false;
  /** Drawing is scrolled away from its left / right end (drives the edge fades). */
  canScrollLeft = false;
  canScrollRight = false;

  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;
  private resizeObserver?: ResizeObserver;
  private readonly cdr = inject(ChangeDetectorRef);

  constructor() {
    this.recompute();
  }

  ngOnChanges(): void {
    this.recompute();
  }

  ngAfterViewInit(): void {
    const host = this.scroller?.nativeElement;
    if (!host || typeof ResizeObserver === 'undefined') return;
    // Fires once on observe and again whenever the frame or the drawing changes size.
    this.resizeObserver = new ResizeObserver(() => {
      if (this.updateScrollState()) this.cdr.detectChanges();
    });
    this.resizeObserver.observe(host);
    const drawing = host.querySelector('.elev');
    if (drawing) this.resizeObserver.observe(drawing);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  onScroll(): void {
    this.updateScrollState();
  }

  /** Re-reads the frame and drawing sizes. Returns true when anything changed. */
  updateScrollState(): boolean {
    const el = this.scroller?.nativeElement;
    if (!el) return false;
    const max = el.scrollWidth - el.clientWidth;
    const scrollable = max > 1;
    const left = scrollable && el.scrollLeft > 1;
    const right = scrollable && el.scrollLeft < max - 1;
    const changed = scrollable !== this.scrollable || left !== this.canScrollLeft || right !== this.canScrollRight;
    this.scrollable = scrollable;
    this.canScrollLeft = left;
    this.canScrollRight = right;
    return changed;
  }

  chooseWall(id: ElevationWall): void {
    if (id !== this.geometry.wall) this.wallChange.emit(id);
  }

  get wallLabel(): string {
    return this.walls.find((w) => w.id === this.geometry.wall)?.label ?? 'Top wall';
  }

  get frameLabel(): string {
    const g = this.geometry;
    return `${this.wallLabel} elevation, ${g.wallLengthFt} feet wide, ${g.ceilingHeightFt} feet high`;
  }

  private recompute(): void {
    const items = Array.isArray(this.items) ? this.items : [];
    const g = buildElevationGeometry(
      {
        roomWidthFt: this.width,
        roomLengthFt: this.length,
        ceilingHeightFt: this.ceilingHeight,
        items,
      },
      this.wall
    );
    const byId = new Map(items.map((i) => [i.uid, i] as const));
    this.geometry = g;
    this.pieces = g.pieces.map((p) => {
      const item = byId.get(p.uid);
      return { ...p, name: item?.name ?? p.defId, w: item?.w ?? p.spanFt, l: item?.l ?? p.depthFt };
    });
    this.openings = openingsForWall(g.wall, g.wallLengthFt, g.ceilingHeightFt);
    this.selected = this.pieces.find((p) => p.uid === this.selectedId) ?? null;
    this.widthCss = `min(100%, ${Math.round(g.aspectRatio * ELEVATION_MAX_HEIGHT_PX)}px)`;
    this.minWidthPx = Math.round(g.wallLengthFt * ELEVATION_MIN_PX_PER_FT);
  }
}
