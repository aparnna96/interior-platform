import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextureChipsComponent } from './texture-chips.component';
import { FLOOR_PATTERNS } from './finish-patterns';

describe('TextureChipsComponent', () => {
  let fixture: ComponentFixture<TextureChipsComponent>;
  let el: HTMLElement;

  function create(inputs: Partial<TextureChipsComponent>): TextureChipsComponent {
    fixture = TestBed.createComponent(TextureChipsComponent);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    return fixture.componentInstance;
  }
  const chips = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.tex-chip'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TextureChipsComponent] }).compileComponents();
  });

  it('shows one button per pattern with its name', () => {
    create({ label: 'Floor', patterns: FLOOR_PATTERNS, selectedId: 'classic' });
    expect(chips().map((c) => c.textContent!.trim())).toEqual(['Classic', 'Plank', 'Herringbone', 'Tile', 'Concrete']);
  });

  it('marks only the selected chip as pressed', () => {
    create({ label: 'Floor', patterns: FLOOR_PATTERNS, selectedId: 'tile' });
    const pressed = chips().filter((c) => c.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((c) => c.getAttribute('data-pattern'))).toEqual(['tile']);
    expect(pressed[0].classList.contains('active')).toBe(true);
  });

  it('reports the tapped pattern id, including the one already selected', () => {
    const cmp = create({ label: 'Floor', patterns: FLOOR_PATTERNS, selectedId: 'classic' });
    const seen: string[] = [];
    cmp.choose.subscribe((id) => seen.push(id));
    chips()[2].click();
    chips()[0].click();
    expect(seen).toEqual(['herringbone', 'classic']);
  });

  it('groups the chips under an accessible name', () => {
    create({ label: 'Fabric', patterns: FLOOR_PATTERNS, selectedId: '' });
    expect(el.querySelector('[role=group]')!.getAttribute('aria-label')).toBe('Fabric texture');
  });

  it('previews each texture over the current swatch colour', () => {
    create({ label: 'Floor', patterns: FLOOR_PATTERNS, selectedId: 'plank', baseColor: 'rgb(10, 20, 30)' });
    const thumb = el.querySelector<HTMLElement>('[data-pattern=plank] .tex-thumb')!;
    expect(thumb.style.backgroundColor).toBe('rgb(10, 20, 30)');
    expect(thumb.style.backgroundImage).toContain('gradient');
  });

  it('renders nothing but an empty group for an empty list', () => {
    create({ label: 'Wall', patterns: [], selectedId: '' });
    expect(chips().length).toBe(0);
  });

  it('hides the decorative thumbnails from assistive technology', () => {
    create({ label: 'Floor', patterns: FLOOR_PATTERNS, selectedId: 'classic' });
    expect(el.querySelectorAll('.tex-thumb[aria-hidden=true]').length).toBe(5);
  });
});