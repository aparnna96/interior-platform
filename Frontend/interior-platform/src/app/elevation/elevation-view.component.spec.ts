import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ElevationViewComponent } from './elevation-view.component';
import { FloorPlanItem } from '../floor-plan/floor-plan.component';
import { ElevationWall } from './elevation-geometry';

function item(uid: string, defId: FloorPlanItem['defId'], w: number, l: number, x: number, y: number): FloorPlanItem {
  const names: Record<string, string> = { bed: 'Bed', wardrobe: 'Wardrobe', sofa: 'Sofa', table: 'Table', chair: 'Chair' };
  return { uid, defId, name: names[defId], short: defId.slice(0, 2).toUpperCase(), w, l, x, y };
}

const SOFA = item('f-sofa-1', 'sofa', 7, 3, 20, 8);
const TABLE = item('f-table-1', 'table', 4, 2.5, 34, 44);

describe('ElevationViewComponent', () => {
  let fixture: ComponentFixture<ElevationViewComponent>;
  let cmp: ElevationViewComponent;
  let el: HTMLElement;

  function set(inputs: Partial<ElevationViewComponent>): void {
    fixture = TestBed.createComponent(ElevationViewComponent);
    cmp = fixture.componentInstance;
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  }

  function pieces(): HTMLButtonElement[] {
    return Array.from(el.querySelectorAll<HTMLButtonElement>('.piece'));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ElevationViewComponent] }).compileComponents();
  });

  it('creates with no inputs and shows an empty, finite drawing', () => {
    set({});
    expect(cmp).toBeTruthy();
    expect(el.querySelector('.elev-wall')).toBeTruthy();
    expect(pieces().length).toBe(0);
    expect(el.textContent).toContain('No furniture placed yet');
    expect(el.textContent).not.toContain('NaN');
    expect(el.textContent).not.toContain('Infinity');
  });

  it('draws one button per placed piece, named for assistive technology', () => {
    set({ width: 12, length: 15, items: [SOFA, TABLE] });
    const labels = pieces().map((p) => p.getAttribute('aria-label'));
    expect(labels.length).toBe(2);
    expect(labels).toContain('Sofa, 7 by 3 feet');
    expect(labels).toContain('Table, 4 by 2.5 feet');
    expect(el.textContent).not.toContain('No furniture placed yet');
  });

  it('shows the wall length and the ceiling height as dimension labels', () => {
    set({ width: 12, length: 15, ceilingHeight: 9, wall: 'top' });
    const text = el.textContent ?? '';
    expect(text).toContain('12 ft');
    expect(text).toContain('9 ft');
    set({ width: 12, length: 15, ceilingHeight: 9, wall: 'left' });
    expect(el.textContent).toContain('15 ft');
  });

  it('sets the frame to the wall-to-ceiling ratio', () => {
    set({ width: 12, length: 15, ceilingHeight: 9, wall: 'top' });
    const wall = el.querySelector<HTMLElement>('.elev-wall')!;
    expect(wall.style.aspectRatio.replace(/\s/g, '')).toBe('12/9');
    set({ width: 12, length: 15, ceilingHeight: 12, wall: 'right' });
    expect(el.querySelector<HTMLElement>('.elev-wall')!.style.aspectRatio.replace(/\s/g, '')).toBe('15/12');
  });

  it('scales the pieces by percentage of the wall and the ceiling', () => {
    set({ width: 12, length: 15, ceilingHeight: 9, wall: 'top', items: [SOFA] });
    const s = pieces()[0];
    expect(parseFloat(s.style.left)).toBeCloseTo(20, 2);
    expect(parseFloat(s.style.width)).toBeCloseTo(58.3333, 2);
    expect(parseFloat(s.style.height)).toBeCloseTo(33.3333, 2);
  });

  it('draws the top wall with a window, the bottom wall with a door, the side walls plain', () => {
    const kinds = (wall: ElevationWall) => {
      set({ wall });
      return Array.from(el.querySelectorAll('.opening')).map((o) => o.getAttribute('data-kind'));
    };
    expect(kinds('top')).toEqual(['window']);
    expect(kinds('bottom')).toEqual(['door']);
    expect(kinds('left')).toEqual([]);
    expect(kinds('right')).toEqual([]);
  });

  it('draws back to front: the piece nearest the wall gets the lower stacking order', () => {
    set({ width: 12, length: 15, wall: 'top', items: [TABLE, SOFA] });
    const byId = (uid: string) => pieces().find((p) => p.getAttribute('aria-label')!.startsWith(uid))!;
    const sofa = byId('Sofa');
    const table = byId('Table');
    expect(Number(sofa.style.zIndex)).toBeLessThan(Number(table.style.zIndex));
    // the DOM follows the same order, so later pieces paint over earlier ones
    expect(pieces().map((p) => p.getAttribute('data-type'))).toEqual(['sofa', 'table']);
  });

  it('reverses the stacking order when seen from the opposite wall', () => {
    set({ width: 12, length: 15, wall: 'bottom', items: [SOFA, TABLE] });
    expect(pieces().map((p) => p.getAttribute('data-type'))).toEqual(['table', 'sofa']);
  });

  it('emits the piece id when a piece is clicked', () => {
    set({ items: [SOFA, TABLE] });
    const seen: string[] = [];
    cmp.select.subscribe((id) => seen.push(id));
    pieces()[0].click();
    expect(seen.length).toBe(1);
    expect(['f-sofa-1', 'f-table-1']).toContain(seen[0]);
  });

  it('highlights the selected piece and names it in the caption', () => {
    set({ items: [SOFA, TABLE], selectedId: 'f-table-1' });
    const selected = pieces().filter((p) => p.classList.contains('selected'));
    expect(selected.length).toBe(1);
    expect(selected[0].getAttribute('data-type')).toBe('table');
    expect(selected[0].getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.elev-caption')!.textContent).toContain('Table');
    expect(el.querySelector('.elev-caption')!.textContent).toContain('4 \u00D7 2.5 ft');
  });

  it('asks to select a piece when none is selected', () => {
    set({ items: [SOFA], selectedId: null });
    expect(pieces().some((p) => p.classList.contains('selected'))).toBe(false);
    expect(el.querySelector('.elev-caption')!.textContent).toContain('Select a piece');
  });

  it('ignores a selected id that is no longer placed', () => {
    set({ items: [SOFA], selectedId: 'gone' });
    expect(pieces().some((p) => p.classList.contains('selected'))).toBe(false);
    expect(el.querySelector('.elev-caption')!.textContent).toContain('Select a piece');
  });

  it('offers the four walls, marks the current one, and emits the chosen wall', () => {
    set({ wall: 'right' });
    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>('.wall-tab'));
    expect(tabs.map((t) => t.textContent!.trim())).toEqual(['Top wall', 'Right wall', 'Bottom wall', 'Left wall']);
    expect(tabs.filter((t) => t.classList.contains('active')).map((t) => t.textContent!.trim())).toEqual(['Right wall']);
    expect(tabs[1].getAttribute('aria-pressed')).toBe('true');
    const seen: ElevationWall[] = [];
    cmp.wallChange.subscribe((w) => seen.push(w));
    tabs[3].click();
    tabs[1].click(); // already the current wall: nothing to report
    expect(seen).toEqual(['left']);
  });

  it('shows no loose decor: only the wall, an opening, the floor and the placed pieces', () => {
    set({ width: 12, length: 15, wall: 'top', items: [SOFA, TABLE] });
    const html = el.innerHTML.toLowerCase();
    for (const decor of ['rug', 'lamp', 'plant', 'curtain', 'vase', 'art']) {
      expect(html).not.toContain(`class="${decor}`);
    }
    expect(el.querySelectorAll('.piece').length).toBe(2);
    expect(el.querySelectorAll('.opening').length).toBe(1);
    expect(el.querySelectorAll('.elev-floor').length).toBe(1);
  });

  it('passes the chosen colours to the drawing as CSS variables', () => {
    set({ wallColor: '#112233', floorColor: '#445566', fabric: '#778899', accent: '#aabbcc', light: 'night' });
    const frame = el.querySelector<HTMLElement>('.elev')!;
    expect(frame.style.getPropertyValue('--wall')).toBe('#112233');
    expect(frame.style.getPropertyValue('--floor')).toBe('#445566');
    expect(frame.style.getPropertyValue('--fabric')).toBe('#778899');
    expect(frame.style.getPropertyValue('--accent')).toBe('#aabbcc');
    expect(frame.getAttribute('data-light')).toBe('night');
  });

  it('describes the drawing for assistive technology', () => {
    set({ width: 12, length: 15, ceilingHeight: 9, wall: 'top' });
    expect(el.querySelector('.elev')!.getAttribute('aria-label')).toBe('Top wall elevation, 12 feet wide, 9 feet high');
  });

  it('gives a long wall a minimum width so the drawing scrolls inside its frame', () => {
    set({ width: 4, length: 50, wall: 'left' });
    const frame = el.querySelector<HTMLElement>('.elev')!;
    expect(parseFloat(frame.style.minWidth)).toBe(800); // 50 ft x 16 px per foot
    set({ width: 50, length: 50, wall: 'top' });
    expect(parseFloat(el.querySelector<HTMLElement>('.elev')!.style.minWidth)).toBe(800);
    set({ width: 4, length: 4, wall: 'top' });
    expect(parseFloat(el.querySelector<HTMLElement>('.elev')!.style.minWidth)).toBe(64);
  });

  it('survives extreme and invalid room sizes without NaN or Infinity', () => {
    const cases: [number, number, number][] = [
      [4, 4, 7],
      [4, 50, 14],
      [50, 50, 9],
      [NaN, Infinity, NaN],
      [-10, 0, -1],
      [1e9, -1e9, 1e9],
    ];
    for (const [w, l, h] of cases) {
      for (const wall of ['top', 'right', 'bottom', 'left'] as const) {
        set({ width: w, length: l, ceilingHeight: h, wall, items: [SOFA, TABLE, item('far', 'bed', 6.5, 5, 99, 99)] });
        const html = el.innerHTML;
        expect(html).not.toContain('NaN');
        expect(html).not.toContain('Infinity');
        expect(pieces().length).toBe(3);
      }
    }
  });

  it('flags a piece larger than the room and keeps it inside the frame', () => {
    set({ width: 4, length: 4, wall: 'top', items: [item('big', 'sofa', 7, 3, 0, 0)] });
    const big = pieces()[0];
    expect(big.getAttribute('data-clipped')).toBe('true');
    expect(parseFloat(big.style.left) + parseFloat(big.style.width)).toBeLessThanOrEqual(100.0001);
  });

  it('redraws when the inputs change', () => {
    set({ width: 12, length: 15, wall: 'top', items: [SOFA] });
    expect(pieces().length).toBe(1);
    fixture.componentRef.setInput('items', [SOFA, TABLE]);
    fixture.componentRef.setInput('wall', 'bottom');
    fixture.detectChanges();
    expect(pieces().length).toBe(2);
    expect(el.querySelector('.opening')!.getAttribute('data-kind')).toBe('door');
  });

  it('does not change the items it is given', () => {
    const items = [SOFA, TABLE];
    const before = JSON.stringify(items);
    set({ items });
    expect(JSON.stringify(items)).toBe(before);
  });

  describe('textures', () => {
    const wallEl = () => el.querySelector<HTMLElement>('.elev-wall')!;
    const floorEl = () => el.querySelector<HTMLElement>('.elev-floor')!;
    const frame = () => el.querySelector<HTMLElement>('.elev')!;

    it('by default the wall and floor stay flat colour and fabric is unpatterned', () => {
      set({ items: [SOFA] });
      expect(wallEl().style.backgroundImage).toBe('');
      expect(floorEl().style.backgroundImage).toBe('');
      expect(frame().style.getPropertyValue('--fabric-fill')).toBe('');
    });

    it('a wall texture is laid over the wall colour', () => {
      set({ wallPatternId: 'slats', wallColor: '#112233' });
      expect(wallEl().style.backgroundImage).toContain('repeating-linear-gradient');
      expect(frame().style.getPropertyValue('--wall')).toBe('#112233');
    });

    it('a floor texture is laid over the floor colour', () => {
      set({ floorPatternId: 'herringbone' });
      expect(floorEl().style.backgroundImage).toContain('repeating-linear-gradient');
    });

    it('every wall and floor texture draws something', () => {
      for (const id of ['plaster', 'slats', 'stripe']) {
        set({ wallPatternId: id });
        expect(wallEl().style.backgroundImage).not.toBe('');
      }
      for (const id of ['plank', 'herringbone', 'tile', 'concrete']) {
        set({ floorPatternId: id });
        expect(floorEl().style.backgroundImage).not.toBe('');
      }
    });

    it('a fabric texture points the upholstery at an SVG pattern', () => {
      set({ items: [SOFA], fabricPatternId: 'linen' });
      expect(frame().style.getPropertyValue('--fabric-fill')).toBe('url(#fab-linen)');
      expect(el.querySelector('pattern#fab-linen')).toBeTruthy();
    });

    it('unknown texture ids behave like the defaults', () => {
      set({ wallPatternId: 'x', floorPatternId: 'y', fabricPatternId: 'z' });
      expect(wallEl().style.backgroundImage).toBe('');
      expect(floorEl().style.backgroundImage).toBe('');
      expect(frame().style.getPropertyValue('--fabric-fill')).toBe('');
    });

    it('textures add no decor and change no geometry', () => {
      set({ items: [SOFA, TABLE], wall: 'top' });
      const before = el.querySelector('.elev-wall')!.innerHTML.length;
      set({ items: [SOFA, TABLE], wall: 'top', wallPatternId: 'stripe', floorPatternId: 'tile', fabricPatternId: 'boucle' });
      expect(pieces().length).toBe(2);
      expect(el.querySelectorAll('.opening').length).toBe(1);
      expect(el.querySelector('.elev-wall')!.innerHTML.length).toBe(before);
    });
  });
  describe('scroll cue for walls wider than the frame', () => {
    /** Sizes the host, then re-reads the layout the way the resize observer does. */
    function setIn(inputs: Partial<ElevationViewComponent>, hostPx: number): void {
      set(inputs);
      el.style.width = `${hostPx}px`;
      cmp.updateScrollState();
      fixture.detectChanges();
    }
    const hint = () => el.querySelector('.scroll-hint');
    const wrap = () => el.querySelector<HTMLElement>('.elev-scroll-wrap')!;
    const scroller = () => el.querySelector<HTMLElement>('.elev-scroll')!;

    it('shows no hint, no keyboard stop and no fades when the whole wall fits', () => {
      setIn({ width: 12, length: 15, wall: 'top' }, 700);
      expect(hint()).toBeNull();
      expect(scroller().hasAttribute('tabindex')).toBe(false);
      expect(scroller().hasAttribute('role')).toBe(false);
      expect(wrap().classList.contains('fade-left')).toBe(false);
      expect(wrap().classList.contains('fade-right')).toBe(false);
    });

    it('a 50 ft wall in a narrow frame shows the hint, a keyboard stop and a right-edge fade', () => {
      setIn({ width: 50, length: 50, wall: 'top' }, 360);
      expect(hint()!.textContent).toContain('50 ft');
      expect(scroller().getAttribute('tabindex')).toBe('0');
      expect(scroller().getAttribute('role')).toBe('region');
      expect(scroller().getAttribute('aria-label')).toContain('scrolls sideways');
      expect(wrap().classList.contains('fade-right')).toBe(true);
      expect(wrap().classList.contains('fade-left')).toBe(false);
    });

    it('scrolling away from the start shows the left fade, and the far end drops the right fade', () => {
      setIn({ width: 50, length: 50, wall: 'top' }, 360);
      const s = scroller();
      s.scrollLeft = 120;
      s.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
      expect(wrap().classList.contains('fade-left')).toBe(true);
      expect(wrap().classList.contains('fade-right')).toBe(true);
      s.scrollLeft = s.scrollWidth;
      s.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
      expect(wrap().classList.contains('fade-left')).toBe(true);
      expect(wrap().classList.contains('fade-right')).toBe(false);
    });

    it('names the length of the wall being shown', () => {
      setIn({ width: 4, length: 50, wall: 'left' }, 360);
      expect(hint()!.textContent).toContain('50 ft');
    });

    it('drops the cue again when the room shrinks to fit', () => {
      setIn({ width: 50, length: 50, wall: 'top' }, 360);
      expect(hint()).toBeTruthy();
      fixture.componentRef.setInput('width', 4);
      fixture.componentRef.setInput('length', 4);
      fixture.detectChanges();
      cmp.updateScrollState();
      fixture.detectChanges();
      expect(hint()).toBeNull();
      expect(scroller().hasAttribute('tabindex')).toBe(false);
      expect(wrap().classList.contains('fade-right')).toBe(false);
    });

    it('reports whether the layout changed, so the view only refreshes when needed', () => {
      setIn({ width: 50, length: 50, wall: 'top' }, 360);
      expect(cmp.updateScrollState()).toBe(false);
      // A 4 ft wall fits the same frame, so the state flips once and then settles.
      fixture.componentRef.setInput('width', 4);
      fixture.componentRef.setInput('length', 4);
      fixture.detectChanges();
      expect(cmp.updateScrollState()).toBe(true);
      expect(cmp.updateScrollState()).toBe(false);
    });
  });
});
