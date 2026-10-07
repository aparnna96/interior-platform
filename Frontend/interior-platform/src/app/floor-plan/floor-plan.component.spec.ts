import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FloorPlanComponent, FloorPlanItem } from './floor-plan.component';

const SOFA: FloorPlanItem = { uid: 's', defId: 'sofa', name: 'Sofa', short: 'SF', w: 7, l: 3, x: 20, y: 8 };

describe('FloorPlanComponent textures', () => {
  let fixture: ComponentFixture<FloorPlanComponent>;
  let el: HTMLElement;

  function create(inputs: Partial<FloorPlanComponent>): FloorPlanComponent {
    fixture = TestBed.createComponent(FloorPlanComponent);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    return fixture.componentInstance;
  }
  const floorTex = () => el.querySelector<HTMLElement>('.floor-tex')!;
  const plan = () => el.querySelector<HTMLElement>('.plan')!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FloorPlanComponent] }).compileComponents();
  });

  it('by default adds no inline texture, so each floor swatch keeps its own look', () => {
    create({ items: [SOFA], floorCode: 'FL-21' });
    expect(floorTex().style.backgroundImage).toBe('');
    expect(plan().getAttribute('data-floor')).toBe('FL-21');
    expect(plan().style.getPropertyValue('--fabric-fill')).toBe('');
  });

  it('a chosen floor texture overrides the swatch texture', () => {
    create({ floorPatternId: 'tile', floorCode: 'FL-21' });
    expect(floorTex().style.backgroundImage).toContain('linear-gradient');
    expect(floorTex().style.backgroundSize).toContain('34px');
  });

  it('every floor texture produces a drawing', () => {
    for (const id of ['plank', 'herringbone', 'tile', 'concrete']) {
      create({ floorPatternId: id });
      expect(floorTex().style.backgroundImage).not.toBe('');
    }
  });

  it('an unknown floor texture behaves like the default', () => {
    create({ floorPatternId: 'does-not-exist' });
    expect(floorTex().style.backgroundImage).toBe('');
  });

  it('a chosen fabric texture points the upholstery at an SVG pattern', () => {
    create({ items: [SOFA], fabricPatternId: 'weave' });
    expect(plan().style.getPropertyValue('--fabric-fill')).toBe('url(#fab-weave)');
    expect(el.querySelector('pattern#fab-weave')).toBeTruthy();
  });

  it('plain fabric leaves the flat colour in place', () => {
    create({ items: [SOFA], fabricPatternId: 'plain' });
    expect(plan().style.getPropertyValue('--fabric-fill')).toBe('');
  });

  it('defines all four fabric patterns and keeps the defs out of the layout', () => {
    create({ items: [SOFA] });
    for (const id of ['weave', 'boucle', 'velvet', 'linen']) expect(el.querySelector('pattern#fab-' + id)).toBeTruthy();
    const host = el.querySelector<HTMLElement>('app-fabric-pattern-defs')!;
    expect(host.getBoundingClientRect().width).toBe(0);
  });

  it('still draws the colours and furniture as before', () => {
    create({ items: [SOFA], wall: '#112233', floor: '#445566', floorPatternId: 'plank', fabricPatternId: 'velvet' });
    expect(plan().style.getPropertyValue('--wall')).toBe('#112233');
    expect(plan().style.getPropertyValue('--floor')).toBe('#445566');
    expect(el.querySelectorAll('.f-item').length).toBe(1);
  });
});