import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import type { ProductDto } from './product.service';
import { WISHLIST_KEY } from './wishlist.service';
import { WishlistComponent } from './wishlist.component';

const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;

function dto(id: string, name: string): ProductDto {
  return {
    id,
    name,
    category: 'Sofas',
    room: 'Living Room',
    price: 42999,
    material: 'Bouclé',
    finish: 'Warm Beige',
    blurb: 'A sofa.',
    description: 'A sofa.',
    dimensions: '220 × 92 × 82 cm',
    image: `https://example.com/${id}.jpg`,
    details: [],
  };
}

describe('WishlistComponent', () => {
  let httpMock: HttpTestingController;

  function setup(saved: string[]) {
    localStorage.clear();
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(saved));
    TestBed.configureTestingModule({
      imports: [WishlistComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(WishlistComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('shows an empty state when nothing is saved', () => {
    const fixture = setup([]);
    httpMock.expectOne(PRODUCTS_URL).flush([dto('aria', 'Aria Sofa')]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.wl-empty')).toBeTruthy();
    expect(el.querySelectorAll('.wl-card').length).toBe(0);
  });

  it('lists the saved pieces that are still for sale and drops the rest', () => {
    const fixture = setup(['haven', 'gone', 'aria']);
    httpMock.expectOne(PRODUCTS_URL).flush([dto('aria', 'Aria Sofa'), dto('haven', 'Haven Bed')]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const names = Array.from(el.querySelectorAll('.wl-name')).map((n) => n.textContent?.trim());
    expect(names).toEqual(['Haven Bed', 'Aria Sofa']);
    expect(JSON.parse(localStorage.getItem(WISHLIST_KEY)!)).toEqual(['haven', 'aria']);
  });

  it('removes a piece with its heart', () => {
    const fixture = setup(['aria']);
    httpMock.expectOne(PRODUCTS_URL).flush([dto('aria', 'Aria Sofa')]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.heart-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.wl-card').length).toBe(0);
    expect(el.querySelector('.wl-empty')).toBeTruthy();
  });

  it('opens a product page from a saved piece', () => {
    const fixture = setup(['aria']);
    httpMock.expectOne(PRODUCTS_URL).flush([dto('aria', 'Aria Sofa')]);
    fixture.detectChanges();
    const opened: string[] = [];
    fixture.componentInstance.openProduct.subscribe((id) => opened.push(id));
    ((fixture.nativeElement as HTMLElement).querySelector('.wl-name-btn') as HTMLButtonElement).click();
    expect(opened).toEqual(['aria']);
  });
});
