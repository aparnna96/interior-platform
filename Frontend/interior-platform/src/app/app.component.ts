import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RoomVisualizerComponent } from './room-visualizer/room-visualizer.component';
import { FloorPlanComponent } from './floor-plan/floor-plan.component';
import { RegisterComponent } from './register/register.component';
import { DEMO_RATE, calculateEstimateTotal } from './estimate/estimate-calculator';

interface Swatch {
  name: string;
  value: string;
  code: string;
}

interface FurnitureDef {
  id: 'bed' | 'wardrobe' | 'sofa' | 'table' | 'chair';
  name: string;
  short: string;
  w: number; // feet
  l: number; // feet
}

interface PlacedItem {
  uid: string;
  defId: FurnitureDef['id'];
  name: string;
  short: string;
  w: number; // feet
  l: number; // feet
  x: number; // % left
  y: number; // % top
}

interface SavedProject {
  id: string;
  name: string;
  room: string;
  width: number;
  length: number;
  area: number;
  scheme: string;
  total: number;
  created: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RoomVisualizerComponent, FloorPlanComponent, RegisterComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  title = 'interior-platform';

  // ── views ──────────────────────────────────
  activeView = signal<'visualizer' | 'estimates' | 'projects'>('visualizer');
  showAccount = signal(false);
  canvasTab = signal<'plan' | 'preview'>('plan');

  // ── room setup (draft vs applied) ──────────
  draftWidth = signal(12);
  draftLength = signal(15);
  appliedWidth = signal(12);
  appliedLength = signal(15);
  roomError = signal('');

  area = computed(() => this.appliedWidth() * this.appliedLength());
  planAspect = computed(() => `${this.appliedWidth()} / ${this.appliedLength()}`);
  estimateTotal = computed(() => calculateEstimateTotal(this.area(), DEMO_RATE));
  demoRate = DEMO_RATE;

  rooms = ['Living Room', 'Bedroom', 'Home Office'];
  selectedRoom = signal('Living Room');

  // ── finishes ───────────────────────────────
  walls: Swatch[] = [
    { name: 'Warm White', value: '#efe9db', code: 'IP-01' },
    { name: 'Oat Milk', value: '#e4d7c0', code: 'IP-02' },
    { name: 'Soft Clay', value: '#d9bfa4', code: 'IP-03' },
    { name: 'Sage Mist', value: '#c9cfbc', code: 'IP-04' },
    { name: 'Greige', value: '#cfc3b2', code: 'IP-05' },
    { name: 'Charcoal Calm', value: '#4a443c', code: 'IP-06' },
  ];
  floors: Swatch[] = [
    { name: 'Natural Oak', value: '#c9a87c', code: 'FL-21' },
    { name: 'Light Ash', value: '#dcc7a2', code: 'FL-22' },
    { name: 'Smoked Walnut', value: '#8a6a4c', code: 'FL-23' },
    { name: 'Honey Herringbone', value: '#bd925f', code: 'FL-24' },
  ];
  fabrics: Swatch[] = [
    { name: 'Bouclé Cream', value: '#ece1d1', code: 'FB-11' },
    { name: 'Linen Sand', value: '#dccfb8', code: 'FB-12' },
    { name: 'Terracotta Weave', value: '#c98a64', code: 'FB-13' },
    { name: 'Slate Velvet', value: '#6b7280', code: 'FB-14' },
    { name: 'Moss Linen', value: '#9aa88f', code: 'FB-15' },
  ];
  accents: Swatch[] = [
    { name: 'Bronze', value: '#8c6b4a', code: 'AC-1' },
    { name: 'Clay', value: '#b4563f', code: 'AC-2' },
    { name: 'Olive', value: '#6d7a5f', code: 'AC-3' },
    { name: 'Ink', value: '#2e2821', code: 'AC-4' },
  ];
  lights = [
    { id: 'day' as const, name: 'Daylight', icon: '☀', note: '5500K · neutral' },
    { id: 'evening' as const, name: 'Evening', icon: '◐', note: '2700K · warm dim' },
    { id: 'night' as const, name: 'Night', icon: '☾', note: '2200K · lamp only' },
  ];

  selectedWall = signal(this.walls[1]);
  selectedFloor = signal(this.floors[0]);
  selectedFabric = signal(this.fabrics[0]);
  selectedAccent = signal(this.accents[0]);
  light = signal<'day' | 'evening' | 'night'>('day');
  finishTab = signal<'Walls' | 'Floor' | 'Fabric' | 'Light'>('Walls');

  schemeName = computed(
    () => `${this.selectedWall().name} × ${this.selectedFabric().name}`
  );

  // ── furniture ──────────────────────────────
  furnitureDefs: FurnitureDef[] = [
    { id: 'bed', name: 'Bed', short: 'BD', w: 6.5, l: 5 },
    { id: 'wardrobe', name: 'Wardrobe', short: 'WD', w: 6, l: 2 },
    { id: 'sofa', name: 'Sofa', short: 'SF', w: 7, l: 3 },
    { id: 'table', name: 'Table', short: 'TB', w: 4, l: 2.5 },
    { id: 'chair', name: 'Chair', short: 'CH', w: 2.5, l: 2.5 },
  ];

  placed = signal<PlacedItem[]>([
    { uid: 'f-sofa-1', defId: 'sofa', name: 'Sofa', short: 'SF', w: 7, l: 3, x: 20, y: 8 },
    { uid: 'f-table-1', defId: 'table', name: 'Table', short: 'TB', w: 4, l: 2.5, x: 34, y: 44 },
  ]);
  selectedItemId = signal<string | null>('f-sofa-1');
  private uidCounter = 2;

  selectedItem = computed(
    () => this.placed().find((p) => p.uid === this.selectedItemId()) ?? null
  );

  // ── projects (local only, frontend demo) ───
  projects = signal<SavedProject[]>([]);
  projectNotice = signal('');

  // ── room setup actions ─────────────────────
  // Draft inputs stay editable: ignore empty / non-finite keystrokes so the
  // draft signals never hold NaN/Infinity and the applied room stays valid.
  onDimensionInput(which: 'width' | 'length', raw: string): void {
    if (raw == null || String(raw).trim() === '') return;
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    if (which === 'width') this.draftWidth.set(v);
    else this.draftLength.set(v);
  }

  generateRoom(): void {
    const w = Number(this.draftWidth());
    const l = Number(this.draftLength());
    if (!Number.isFinite(w) || !Number.isFinite(l)) {
      this.roomError.set('Enter numeric width and length in feet.');
      return;
    }
    if (w < 4 || l < 4 || w > 50 || l > 50) {
      this.roomError.set('Room dimensions must be between 4 ft and 50 ft.');
      return;
    }
    this.roomError.set('');
    const rw = Math.round(w * 10) / 10;
    const rl = Math.round(l * 10) / 10;
    this.appliedWidth.set(rw);
    this.appliedLength.set(rl);
    // Keep draft inputs in sync with the applied (rounded) source of truth.
    this.draftWidth.set(rw);
    this.draftLength.set(rl);
    this.clampAllItems();
  }

  resetWorkspace(): void {
    this.draftWidth.set(12);
    this.draftLength.set(15);
    this.appliedWidth.set(12);
    this.appliedLength.set(15);
    this.roomError.set('');
    this.selectedWall.set(this.walls[1]);
    this.selectedFloor.set(this.floors[0]);
    this.selectedFabric.set(this.fabrics[0]);
    this.selectedAccent.set(this.accents[0]);
    this.light.set('day');
    this.placed.set([
      { uid: 'f-sofa-1', defId: 'sofa', name: 'Sofa', short: 'SF', w: 7, l: 3, x: 20, y: 8 },
      { uid: 'f-table-1', defId: 'table', name: 'Table', short: 'TB', w: 4, l: 2.5, x: 34, y: 44 },
    ]);
    this.selectedItemId.set('f-sofa-1');
  }

  // Keep furniture inside the room when dimensions change.
  private clampAllItems(): void {
    const rw = this.appliedWidth();
    const rl = this.appliedLength();
    this.placed.update((items) =>
      items.map((it) => ({
        ...it,
        x: this.clampN(it.x, 1, Math.max(1, 99 - (it.w / rw) * 100)),
        y: this.clampN(it.y, 1, Math.max(1, 99 - (it.l / rl) * 100)),
      }))
    );
  }

  private clampN(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
  }

  itemWPercent(item: PlacedItem): number {
    const rw = this.appliedWidth();
    if (!Number.isFinite(rw) || rw <= 0 || !Number.isFinite(item.w)) return 0;
    return (item.w / rw) * 100;
  }

  itemHPercent(item: PlacedItem): number {
    const rl = this.appliedLength();
    if (!Number.isFinite(rl) || rl <= 0 || !Number.isFinite(item.l)) return 0;
    return (item.l / rl) * 100;
  }

  // Width for the plan box so tall rooms don't overflow vertically.
  planStyle(): Record<string, string> {
    const w = this.appliedWidth();
    const l = this.appliedLength();
    if (!Number.isFinite(w) || !Number.isFinite(l) || w <= 0 || l <= 0) {
      return { 'aspect-ratio': '12 / 15', width: '100%' };
    }
    const ratio = w / l;
    if (ratio >= 1) {
      return { 'aspect-ratio': `${w} / ${l}`, width: '100%' };
    }
    const px = Math.round(Math.min(560, 460 * ratio + 120));
    return { 'aspect-ratio': `${w} / ${l}`, width: `min(100%, ${px}px)` };
  }

  // ── furniture actions (no drag-and-drop in v1) ──
  addFurniture(defId: FurnitureDef['id']): void {
    const def = this.furnitureDefs.find((d) => d.id === defId);
    if (!def) return;
    this.uidCounter += 1;
    const n = this.placed().length;
    const spotX = 6 + ((n * 13) % 60);
    const spotY = 6 + ((n * 17) % 55);
    const uid = `f-${defId}-${this.uidCounter}`;
    this.placed.update((items) => [
      ...items,
      { uid, defId: def.id, name: def.name, short: def.short, w: def.w, l: def.l, x: spotX, y: spotY },
    ]);
    this.selectedItemId.set(uid);
    this.clampAllItems();
  }

  selectItem(uid: string): void {
    // Only select ids that still exist so the control area never desyncs.
    if (!this.placed().some((p) => p.uid === uid)) {
      this.selectedItemId.set(null);
      return;
    }
    this.selectedItemId.set(uid);
  }

  removeSelected(): void {
    const id = this.selectedItemId();
    if (!id) return;
    this.placed.update((items) => items.filter((i) => i.uid !== id));
    this.selectedItemId.set(null);
  }

  removeItem(uid: string): void {
    this.placed.update((items) => items.filter((i) => i.uid !== uid));
    if (this.selectedItemId() === uid) this.selectedItemId.set(null);
  }

  nudgeSelected(dx: number, dy: number): void {
    const id = this.selectedItemId();
    if (!id) return;
    const rw = this.appliedWidth();
    const rl = this.appliedLength();
    this.placed.update((items) =>
      items.map((it) => {
        if (it.uid !== id) return it;
        const maxX = Math.max(1, 99 - (it.w / rw) * 100);
        const maxY = Math.max(1, 99 - (it.l / rl) * 100);
        return {
          ...it,
          x: this.clampN(Math.round((it.x + dx) * 10) / 10, 1, maxX),
          y: this.clampN(Math.round((it.y + dy) * 10) / 10, 1, maxY),
        };
      })
    );
  }

  placePreset(pos: 'tl' | 'tr' | 'bl' | 'br' | 'center'): void {
    const id = this.selectedItemId();
    if (!id) return;
    const rw = this.appliedWidth();
    const rl = this.appliedLength();
    this.placed.update((items) =>
      items.map((it) => {
        if (it.uid !== id) return it;
        const wP = (it.w / rw) * 100;
        const hP = (it.l / rl) * 100;
        // Clamp presets so oversized pieces still stay anchored in the room.
        const maxX = Math.max(1, 99 - wP);
        const maxY = Math.max(1, 99 - hP);
        const cx = (v: number) => this.clampN(v, 1, maxX);
        const cy = (v: number) => this.clampN(v, 1, maxY);
        switch (pos) {
          case 'tl': return { ...it, x: 2, y: 2 };
          case 'tr': return { ...it, x: cx(98 - wP), y: 2 };
          case 'bl': return { ...it, x: 2, y: cy(98 - hP) };
          case 'br': return { ...it, x: cx(98 - wP), y: cy(98 - hP) };
          case 'center': return { ...it, x: cx(50 - wP / 2), y: cy(50 - hP / 2) };
        }
      })
    );
  }

  rotateSelected(): void {
    const id = this.selectedItemId();
    if (!id) return;
    this.placed.update((items) =>
      items.map((it) => (it.uid === id ? { ...it, w: it.l, l: it.w } : it))
    );
    this.clampAllItems();
  }

  clearFurniture(): void {
    this.placed.set([]);
    this.selectedItemId.set(null);
  }

  countOf(defId: string): number {
    return this.placed().filter((p) => p.defId === defId).length;
  }

  // ── projects ───────────────────────────────
  saveProject(): void {
    const n = this.projects().length + 1;
    const p: SavedProject = {
      id: `p-${Date.now()}-${n}`,
      name: `Project ${n} — ${this.selectedRoom()}`,
      room: this.selectedRoom(),
      width: this.appliedWidth(),
      length: this.appliedLength(),
      area: this.area(),
      scheme: this.schemeName(),
      total: this.estimateTotal(),
      created: new Date().toLocaleDateString(),
    };
    this.projects.update((list) => [p, ...list]);
    this.projectNotice.set(`${p.name} saved to this workspace session.`);
    window.setTimeout(() => this.projectNotice.set(''), 2600);
  }

  loadProject(p: SavedProject): void {
    this.appliedWidth.set(p.width);
    this.appliedLength.set(p.length);
    this.draftWidth.set(p.width);
    this.draftLength.set(p.length);
    this.selectedRoom.set(p.room);
    this.activeView.set('visualizer');
    this.clampAllItems();
  }

  deleteProject(id: string): void {
    this.projects.update((list) => list.filter((p) => p.id !== id));
  }

  toggleAccount(): void {
    this.showAccount.update((v) => !v);
  }

  money(n: number): string {
    return n.toLocaleString('en-IN');
  }
}
