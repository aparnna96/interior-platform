import {
  DEFAULT_PATTERN_ID,
  FABRIC_PATTERNS,
  FLOOR_PATTERNS,
  FinishKind,
  WALL_PATTERNS,
  findPattern,
  patternsFor,
} from './finish-patterns';

const KINDS: FinishKind[] = ['wall', 'floor', 'fabric'];

describe('finish patterns', () => {
  it('offers 4 wall, 5 floor and 5 fabric options (plain plus 4 textures)', () => {
    expect(WALL_PATTERNS.length).toBe(4);
    expect(FLOOR_PATTERNS.length).toBe(5);
    expect(FABRIC_PATTERNS.length).toBe(5);
  });

  it('every pattern belongs to the list it is in, with a unique id and a name', () => {
    for (const kind of KINDS) {
      const list = patternsFor(kind);
      expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
      for (const p of list) {
        expect(p.kind).toBe(kind);
        expect(p.name.trim().length).toBeGreaterThan(0);
        expect(p.id).toMatch(/^[a-z]+$/);
      }
    }
  });

  it('each kind has a default that exists and reproduces today\'s look', () => {
    expect(DEFAULT_PATTERN_ID).toEqual({ wall: 'plain', floor: 'classic', fabric: 'plain' });
    for (const kind of KINDS) {
      expect(patternsFor(kind).some((p) => p.id === DEFAULT_PATTERN_ID[kind])).toBe(true);
    }
    // the defaults add nothing on top of the existing colours and floor texture
    expect(findPattern('wall', 'plain').image).toBeNull();
    expect(findPattern('floor', 'classic').image).toBeNull();
    expect(findPattern('fabric', 'plain').image).toBeNull();
  });

  it('every non-default drawing texture has an image for the views', () => {
    for (const p of [...WALL_PATTERNS, ...FLOOR_PATTERNS]) {
      if (p.id === DEFAULT_PATTERN_ID[p.kind]) continue;
      expect(p.image).toBeTruthy();
    }
  });

  it('every chip can show a preview, except plain colours', () => {
    for (const kind of KINDS) {
      for (const p of patternsFor(kind)) {
        if (p.id === 'plain') expect(p.preview).toBeNull();
        else expect(p.preview).toBeTruthy();
      }
    }
  });

  it('textures use local CSS gradients only: no URLs and no external assets', () => {
    for (const kind of KINDS) {
      for (const p of patternsFor(kind)) {
        for (const css of [p.image, p.preview, p.size, p.previewSize]) {
          if (css === null) continue;
          expect(css).not.toMatch(/url\(|https?:|\/\//i);
        }
      }
    }
  });

  it('fabric textures have a matching SVG pattern id for the drawing views', () => {
    const ids = FABRIC_PATTERNS.filter((p) => p.id !== 'plain').map((p) => p.id);
    expect(ids).toEqual(['weave', 'boucle', 'velvet', 'linen']);
  });

  it('findPattern returns the requested pattern', () => {
    expect(findPattern('floor', 'herringbone').name).toBe('Herringbone');
    expect(findPattern('wall', 'slats').id).toBe('slats');
    expect(findPattern('fabric', 'velvet').kind).toBe('fabric');
  });

  it('findPattern falls back to the default for an unknown, empty or missing id', () => {
    for (const bad of ['nope', '', null, undefined, 'PLAIN', 'herringbone-'] as (string | null | undefined)[]) {
      expect(findPattern('wall', bad).id).toBe('plain');
      expect(findPattern('floor', bad).id).toBe('classic');
      expect(findPattern('fabric', bad).id).toBe('plain');
    }
  });

  it('a floor id is not valid for walls', () => {
    expect(findPattern('wall', 'herringbone').id).toBe('plain');
  });

  it('an unknown kind gives an empty list rather than throwing', () => {
    expect(patternsFor('ceiling' as FinishKind)).toEqual([]);
  });
});