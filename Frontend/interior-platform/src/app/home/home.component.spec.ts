import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { HomeComponent } from './home.component';
import { FEATURED_PRODUCT_IDS } from './home-data';
import { ProductService, type ProductDto } from '../catalogue/product.service';
import { environment } from '../../environments/environment';

const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;

function dto(
  id: string,
  name: string,
  category: string,
  room: string,
  price: number
): ProductDto {
  return {
    id,
    name,
    category,
    room,
    price,
    material: 'Test Material',
    finish: 'Test Finish',
    blurb: `${name} blurb.`,
    description: `${name} description.`,
    dimensions: '10 × 10 × 10 cm',
    image: `https://example.com/${id}.jpg`,
    details: [`${name} detail`],
  };
}

/** Deliberately shuffled relative to FEATURED_PRODUCT_IDS. */
const API_PRODUCTS: ProductDto[] = [
  dto('oslo-wardrobe', 'Oslo 6-Door Wardrobe', 'Wardrobes', 'Bedroom', 54999),
  dto('terra-coffee-table', 'Terra Solid Wood Coffee Table', 'Tables', 'Living Room', 12999),
  dto('haven-queen-bed', 'Haven Queen Storage Bed', 'Beds', 'Bedroom', 38999),
  dto('sona-loveseat', 'Sona 2-Seater Loveseat', 'Sofas', 'Living Room', 28499),
  dto('aria-3s-sofa', 'Aria 3-Seater Fabric Sofa', 'Sofas', 'Living Room', 42999),
];

describe('HomeComponent featured products', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setup() {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('creates with no featured products before the API responds', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    expect(cmp).toBeTruthy();
    expect(cmp.featured()).toEqual([]);
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('.feat');
    expect(cards.length).toBe(0);
    httpMock.expectOne(PRODUCTS_URL).flush([]);
    fixture.destroy();
  });

  it('loads products through ProductService on init', () => {
    const fixture = setup();
    const req = httpMock.expectOne(PRODUCTS_URL);
    expect(req.request.method).toBe('GET');
    req.flush(API_PRODUCTS);
    expect(TestBed.inject(ProductService).products().length).toBe(API_PRODUCTS.length);
    fixture.destroy();
  });

  it('derives the at-a-glance counts from the live catalogue', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    expect([cmp.pieceCount(), cmp.categoryCount(), cmp.roomCount()]).toEqual([0, 0, 0]);
    httpMock.expectOne(PRODUCTS_URL).flush(API_PRODUCTS);
    fixture.detectChanges();
    expect(cmp.pieceCount()).toBe(5);
    expect(cmp.categoryCount()).toBe(4);
    expect(cmp.roomCount()).toBe(2);
    const labels = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.glance li span')).map((s) => s.textContent);
    expect(labels).toEqual(['Furniture pieces', 'Furniture categories', 'Rooms furnished']);
    fixture.destroy();
  });

  it('resolves featured products in FEATURED_PRODUCT_IDS order', () => {
    const fixture = setup();
    httpMock.expectOne(PRODUCTS_URL).flush(API_PRODUCTS);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp.featured().map((p) => p.id)).toEqual([...FEATURED_PRODUCT_IDS]);
    expect(cmp.featured().length).toBe(FEATURED_PRODUCT_IDS.length);
    fixture.destroy();
  });

  it('renders featured cards once products arrive asynchronously', () => {
    const fixture = setup();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.feat').length).toBe(0);
    httpMock.expectOne(PRODUCTS_URL).flush(API_PRODUCTS);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll('.feat');
    expect(cards.length).toBe(FEATURED_PRODUCT_IDS.length);
    expect(el.textContent).toContain('Aria 3-Seater Fabric Sofa');
    expect(el.textContent).toContain('Oslo 6-Door Wardrobe');
    fixture.destroy();
  });

  it('opens a featured piece from its photo and saves it with the heart', () => {
    localStorage.removeItem('ip.wishlist');
    const fixture = setup();
    httpMock.expectOne(PRODUCTS_URL).flush(API_PRODUCTS);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    const opened: string[] = [];
    cmp.openProduct.subscribe((id: string) => opened.push(id));

    (el.querySelector('.feat .feat-media') as HTMLButtonElement).click();
    expect(opened).toEqual([FEATURED_PRODUCT_IDS[0]]);

    const heart = el.querySelector('.feat .heart-btn') as HTMLButtonElement;
    expect(heart.getAttribute('aria-pressed')).toBe('false');
    heart.click();
    fixture.detectChanges();
    expect(heart.getAttribute('aria-pressed')).toBe('true');
    expect(cmp.isSaved(FEATURED_PRODUCT_IDS[0])).toBeTrue();
    heart.click();
    fixture.detectChanges();
    expect(cmp.isSaved(FEATURED_PRODUCT_IDS[0])).toBeFalse();
    fixture.destroy();
    localStorage.removeItem('ip.wishlist');
  });

  it('does not crash when the API fails', () => {
    const fixture = setup();
    httpMock
      .expectOne(PRODUCTS_URL)
      .flush('Server error', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp.featured()).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.feat').length).toBe(0);
    expect(fixture.componentInstance).toBeTruthy();
    fixture.destroy();
  });

  it('keeps existing interactions working', () => {
    const fixture = setup();
    httpMock.expectOne(PRODUCTS_URL).flush(API_PRODUCTS);
    const cmp = fixture.componentInstance;
    let destination: unknown = null;
    cmp.navigate.subscribe((d: unknown) => (destination = d));
    cmp.go('catalogue');
    expect(destination).toBe('catalogue');
    const before = cmp.slideIndex();
    cmp.nextSlide();
    expect(cmp.slideIndex()).toBe((before + 1) % cmp.slides.length);
    fixture.destroy();
  });
});

describe('HomeComponent hero carousel controls', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    httpMock.verify();
  });

  function setup(useClock = false) {
    if (useClock) jasmine.clock().install();
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    httpMock.expectOne(PRODUCTS_URL).flush([]);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const hero = (fixture.nativeElement as HTMLElement).querySelector('header.hero') as HTMLElement;
    return { fixture, cmp, hero };
  }

  function pointer(type: string, x: number, y: number, extra: PointerEventInit = {}): PointerEvent {
    return new PointerEvent(type, { clientX: x, clientY: y, pointerType: 'touch', isPrimary: true, bubbles: true, ...extra });
  }

  function swipe(hero: HTMLElement, fromX: number, toX: number, fromY = 200, toY = 200, extra: PointerEventInit = {}) {
    hero.dispatchEvent(pointer('pointerdown', fromX, fromY, extra));
    hero.dispatchEvent(pointer('pointerup', toX, toY, extra));
  }

  it('the previous / next arrows and the dots change the slide', () => {
    const { fixture, cmp, hero } = setup();
    const n = cmp.slides.length;
    (hero.querySelector('.hero-next') as HTMLButtonElement).click();
    expect(cmp.slideIndex()).toBe(1);
    (hero.querySelector('.hero-prev') as HTMLButtonElement).click();
    (hero.querySelector('.hero-prev') as HTMLButtonElement).click();
    expect(cmp.slideIndex()).toBe(n - 1);
    (hero.querySelectorAll('.hero-dots button')[2] as HTMLButtonElement).click();
    expect(cmp.slideIndex()).toBe(2);
    fixture.destroy();
  });

  it('a swipe left shows the next slide and a swipe right the previous one', () => {
    const { fixture, cmp, hero } = setup();
    swipe(hero, 300, 200);
    expect(cmp.slideIndex()).toBe(1);
    swipe(hero, 200, 300);
    expect(cmp.slideIndex()).toBe(0);
    swipe(hero, 200, 300);
    expect(cmp.slideIndex()).toBe(cmp.slides.length - 1);
    fixture.destroy();
  });

  it('a tap, a short drag, a mostly-vertical drag and a mouse drag do not change the slide', () => {
    const { fixture, cmp, hero } = setup();
    swipe(hero, 200, 200);
    swipe(hero, 200, 215);
    swipe(hero, 200, 120, 100, 260);
    swipe(hero, 300, 150, 200, 200, { pointerType: 'mouse' });
    swipe(hero, 300, 150, 200, 200, { isPrimary: false });
    expect(cmp.slideIndex()).toBe(0);
    fixture.destroy();
  });

  it('a cancelled touch is forgotten, so a later stray pointerup does nothing', () => {
    const { fixture, cmp, hero } = setup();
    hero.dispatchEvent(pointer('pointerdown', 300, 200));
    hero.dispatchEvent(pointer('pointercancel', 300, 200));
    hero.dispatchEvent(pointer('pointerup', 100, 200));
    expect(cmp.slideIndex()).toBe(0);
    fixture.destroy();
  });

  it('the Left and Right arrow keys move between slides and other keys do nothing', () => {
    const { fixture, cmp, hero } = setup();
    hero.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(cmp.slideIndex()).toBe(1);
    hero.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(cmp.slideIndex()).toBe(0);
    hero.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    hero.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    expect(cmp.slideIndex()).toBe(0);
    fixture.destroy();
  });

  it('keeps the automatic animation running', () => {
    const { fixture, cmp } = setup(true);
    jasmine.clock().tick(5001);
    expect(cmp.slideIndex()).toBe(1);
    jasmine.clock().tick(5000);
    expect(cmp.slideIndex()).toBe(2);
    fixture.destroy();
  });

  it('a manual change restarts the 5 second timer instead of skipping again at once', () => {
    const { fixture, cmp, hero } = setup(true);
    jasmine.clock().tick(4000);
    (hero.querySelector('.hero-next') as HTMLButtonElement).click();
    expect(cmp.slideIndex()).toBe(1);
    jasmine.clock().tick(2000);
    expect(cmp.slideIndex()).toBe(1);
    jasmine.clock().tick(3100);
    expect(cmp.slideIndex()).toBe(2);
    fixture.destroy();
  });

  it('a mouse resting over the hero does not stop the animation', () => {
    const { fixture, cmp, hero } = setup(true);
    hero.dispatchEvent(pointer('pointerenter', 100, 100, { pointerType: 'mouse' }));
    hero.dispatchEvent(pointer('pointermove', 120, 110, { pointerType: 'mouse' }));
    jasmine.clock().tick(5001);
    expect(cmp.slideIndex()).toBe(1);
    jasmine.clock().tick(5000);
    expect(cmp.slideIndex()).toBe(2);
    fixture.destroy();
  });

  it('after clicking Next with the mouse the animation carries on from the new slide', () => {
    const { fixture, cmp, hero } = setup(true);
    (hero.querySelector('.hero-next') as HTMLButtonElement).click();
    expect(cmp.slideIndex()).toBe(1);
    jasmine.clock().tick(5001);
    expect(cmp.slideIndex()).toBe(2);
    fixture.destroy();
  });

  it('a touch on the hero does not freeze the animation', () => {
    const { fixture, cmp, hero } = setup(true);
    hero.dispatchEvent(pointer('pointerenter', 100, 100, { pointerType: 'touch' }));
    jasmine.clock().tick(5001);
    expect(cmp.slideIndex()).toBe(1);
    fixture.destroy();
  });

  it('keyboard focus on a hero control pauses the animation and leaving it resumes', () => {
    const { fixture, cmp } = setup(true);
    cmp.onHeroFocusIn({ target: { matches: (s: string) => s === ':focus-visible' } } as unknown as FocusEvent);
    jasmine.clock().tick(20000);
    expect(cmp.slideIndex()).toBe(0);
    cmp.onHeroFocusOut();
    jasmine.clock().tick(5001);
    expect(cmp.slideIndex()).toBe(1);
    fixture.destroy();
  });

  it('a tap-focus (not keyboard) does not pause the animation', () => {
    const { fixture, cmp } = setup(true);
    cmp.onHeroFocusIn({ target: { matches: () => false } } as unknown as FocusEvent);
    jasmine.clock().tick(5001);
    expect(cmp.slideIndex()).toBe(1);
    fixture.destroy();
  });

  it('manual controls still work while the animation is paused by keyboard focus', () => {
    const { fixture, cmp, hero } = setup(true);
    cmp.onHeroFocusIn({ target: { matches: (s: string) => s === ':focus-visible' } } as unknown as FocusEvent);
    (hero.querySelector('.hero-next') as HTMLButtonElement).click();
    expect(cmp.slideIndex()).toBe(1);
    jasmine.clock().tick(20000);
    expect(cmp.slideIndex()).toBe(1);
    fixture.destroy();
  });

  it('leaves the page and stops the timer when destroyed', () => {
    const { fixture, cmp } = setup(true);
    fixture.destroy();
    const at = cmp.slideIndex();
    jasmine.clock().tick(30000);
    expect(cmp.slideIndex()).toBe(at);
  });

  it('exposes labelled prev / next buttons and one dot per slide', () => {
    const { fixture, cmp, hero } = setup();
    expect(hero.querySelector('.hero-prev')!.getAttribute('aria-label')).toBe('Previous slide');
    expect(hero.querySelector('.hero-next')!.getAttribute('aria-label')).toBe('Next slide');
    expect(hero.querySelectorAll('.hero-dots button').length).toBe(cmp.slides.length);
    fixture.destroy();
  });
});
describe('HomeComponent reviews', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function setup() {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    httpMock.expectOne(PRODUCTS_URL).flush([]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, cmp: fixture.componentInstance, el };
  }

  it('shows one card per review with its quote, name and place', () => {
    const { fixture, cmp, el } = setup();
    const cards = Array.from(el.querySelectorAll('section[aria-label="Customer reviews"] .rev-card'));
    expect(cards.length).toBe(cmp.reviews.length);
    const first = cards[0] as HTMLElement;
    expect(first.querySelector('.rev-quote')!.textContent).toContain(cmp.reviews[0].quote);
    expect(first.querySelector('.rev-who strong')!.textContent).toContain(cmp.reviews[0].name);
    expect(first.querySelector('.rev-who')!.textContent).toContain(cmp.reviews[0].city);
    fixture.destroy();
  });

  it('draws five stars per card and says the rating in words for screen readers', () => {
    const { fixture, cmp, el } = setup();
    for (const [i, card] of Array.from(el.querySelectorAll('.rev-card')).entries()) {
      const rating = cmp.reviews[i].rating;
      expect(card.querySelectorAll('.rev-star').length).toBe(5);
      expect(card.querySelectorAll('.rev-star:not(.off)').length).toBe(rating);
      expect(card.querySelector('.rev-stars')!.getAttribute('aria-label')).toBe(`Rated ${rating} out of 5`);
    }
    fixture.destroy();
  });

  it('labels the reviews as samples', () => {
    const { fixture, el } = setup();
    const head = el.querySelector('section[aria-label="Customer reviews"] .block-head')!;
    expect(head.querySelector('.rev-sample')!.textContent).toContain('Sample reviews');
    fixture.destroy();
  });

  it('shows initials instead of a photo', () => {
    const { fixture, el } = setup();
    expect(el.querySelectorAll('.rev-card img').length).toBe(0);
    expect(el.querySelector('.rev-card .rev-avatar')!.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.componentInstance.initials('Meera Nair')).toBe('MN');
    expect(fixture.componentInstance.initials('  Arjun  Rao Menon ')).toBe('AR');
    expect(fixture.componentInstance.initials('Sana')).toBe('S');
    expect(fixture.componentInstance.initials('')).toBe('');
    fixture.destroy();
  });

  it('has labelled arrows, and the list can be reached by keyboard', () => {
    const { fixture, el } = setup();
    const arrows = el.querySelectorAll('.rev-arrow');
    expect(arrows.length).toBe(2);
    expect(arrows[0].getAttribute('aria-label')).toBe('Previous reviews');
    expect(arrows[1].getAttribute('aria-label')).toBe('Next reviews');
    expect(el.querySelector('.rev-track')!.getAttribute('tabindex')).toBe('0');
    fixture.destroy();
  });

  it('the arrows scroll the list and switch off at each end', () => {
    const { fixture, cmp, el } = setup();
    const track = el.querySelector('.rev-track') as HTMLElement;
    const prev = el.querySelectorAll('.rev-arrow')[0] as HTMLButtonElement;
    const next = el.querySelectorAll('.rev-arrow')[1] as HTMLButtonElement;
    cmp.onReviewScroll();
    fixture.detectChanges();

    // Narrow enough that the cards overflow, so there is more to the right and nothing to the left.
    track.style.width = '320px';
    track.style.gridAutoColumns = '280px';
    cmp.onReviewScroll();
    fixture.detectChanges();
    expect(prev.disabled).toBeTrue();
    expect(next.disabled).toBeFalse();

    const spy = spyOn(track, 'scrollBy');
    next.click();
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.calls.mostRecent().args[0] as ScrollToOptions).left).toBeGreaterThan(0);
    prev.disabled = false;
    cmp.scrollReviews(-1);
    expect((spy.calls.mostRecent().args[0] as ScrollToOptions).left).toBeLessThan(0);

    track.scrollLeft = track.scrollWidth;
    cmp.onReviewScroll();
    fixture.detectChanges();
    expect(next.disabled).toBeTrue();
    expect(prev.disabled).toBeFalse();
    fixture.destroy();
  });
});
