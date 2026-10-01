import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ProductDetailsComponent } from './product-details.component';
import { CatalogueComponent } from './catalogue.component';
import type { CatalogueProduct } from './catalogue-products';
import type { ProductDto } from './product.service';
import { AUTH_TOKEN_KEY } from '../auth.service';
import { environment } from '../../environments/environment';

describe('ProductDetailsComponent', () => {
  const product: CatalogueProduct = {
    id: 'aria-3s-sofa',
    name: 'Aria 3-Seater Fabric Sofa',
    category: 'Sofas',
    room: 'Living Room',
    price: 42999,
    finish: 'Bouclé · Warm Beige',
    blurb: 'Deep-seat bouclé sofa for everyday lounging.',
    details: ['Bouclé cream upholstery', 'Solid wood frame'],
    swatch: '',
    image: 'https://example.com/aria.jpg',
    material: 'Performance Bouclé',
    dimensions: '220 × 92 × 82 cm',
    description: 'A generous three-seater.',
  };

  async function setup(cartQty = 0) {
    await TestBed.configureTestingModule({
      imports: [ProductDetailsComponent],
      // ProductDetails embeds the lead enquiry form (LeadService → HttpClient).
      providers: [provideHttpClient()],
    }).compileComponents();
    const fixture = TestBed.createComponent(ProductDetailsComponent);
    fixture.componentInstance.product = product;
    fixture.componentInstance.cartQty = cartQty;
    fixture.detectChanges();
    return fixture;
  }

  it('creates and displays product data from existing catalogue data', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance).toBeTruthy();
    expect(el.textContent).toContain(product.name);
    expect(el.textContent).toContain(product.room);
    expect(el.textContent).toContain(product.category);
    expect(el.textContent).toContain(product.material);
    expect(el.textContent).toContain(product.finish);
    expect(el.textContent).toContain(product.dimensions);
    expect(el.textContent).toContain(product.description);
    const img = el.querySelector('.pd-media img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe(product.image);
    expect(img?.getAttribute('alt')).toBe(product.name);
  });

  it('renders price/details from existing catalogue data (no invented specs)', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain(`₹${product.price.toLocaleString('en-IN')}`);
    for (const d of product.details) {
      expect(el.textContent).toContain(d);
    }
    expect(fixture.componentInstance.product.price).toBe(product.price);
    expect(fixture.componentInstance.product.dimensions).toBe(product.dimensions);
  });

  it('starts at quantity 1 and never goes below 1', async () => {
    const fixture = await setup();
    const cmp = fixture.componentInstance;
    expect(cmp.quantity()).toBe(1);
    cmp.decrement();
    expect(cmp.quantity()).toBe(1);
    cmp.onQtyInput('0');
    expect(cmp.quantity()).toBe(1);
    cmp.onQtyInput('-5');
    expect(cmp.quantity()).toBe(1);
    cmp.onQtyInput('');
    expect(cmp.quantity()).toBe(1);
    cmp.onQtyInput('abc');
    expect(cmp.quantity()).toBe(1);
    cmp.increment();
    expect(cmp.quantity()).toBe(2);
    cmp.decrement();
    expect(cmp.quantity()).toBe(1);
    cmp.decrement();
    expect(cmp.quantity()).toBe(1);
  });

  it('emits addToCart with selected quantity and back on return to Furniture', async () => {
    const fixture = await setup();
    const cmp = fixture.componentInstance;
    let added: { id: string; qty: number } | null = null;
    let backed = false;
    cmp.addToCart.subscribe((e: { id: string; qty: number }) => (added = e));
    cmp.back.subscribe(() => (backed = true));

    cmp.increment();
    cmp.increment();
    cmp.handleAddToCart();
    expect(added as { id: string; qty: number } | null).toEqual({ id: product.id, qty: 3 });

    cmp.goBack();
    expect(backed).toBeTrue();

    fixture.detectChanges();
    const backBtn = (fixture.nativeElement as HTMLElement).querySelector('.pd-back');
    expect(backBtn?.textContent).toContain('Back to Furniture');
  });

  it('shows a visualizer hint without touching visualizer state', async () => {
    const fixture = await setup();
    const cmp = fixture.componentInstance;
    expect(cmp.visualizerNote()).toBeNull();
    cmp.handleAddToVisualizer();
    expect(cmp.visualizerNote()).toContain('Visualizer');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Visualizer');
  });

  it('hides the enquiry form until Enquire is chosen', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.showEnquiry()).toBe(false);
    expect(el.querySelector('app-lead-form')).toBeFalsy();
  });

  it('shows the enquiry form with product context when Enquire is chosen', async () => {
    const fixture = await setup();
    const cmp = fixture.componentInstance;
    cmp.toggleEnquiry();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const form = el.querySelector('app-lead-form');
    expect(form).toBeTruthy();
    expect(el.textContent).toContain(product.name);
    cmp.toggleEnquiry();
    fixture.detectChanges();
    expect(el.querySelector('app-lead-form')).toBeFalsy();
  });
});

describe('CatalogueComponent product-details wiring', () => {
  const apiProducts: ProductDto[] = [
    {
      id: 'aria-3s-sofa',
      name: 'Aria 3-Seater Fabric Sofa',
      category: 'Sofas',
      room: 'Living Room',
      price: 42999,
      material: 'Performance Bouclé',
      finish: 'Bouclé · Warm Beige',
      blurb: 'Deep-seat bouclé sofa.',
      description: 'A generous three-seater.',
      dimensions: '220 × 92 × 82 cm',
      image: 'https://example.com/aria.jpg',
      details: ['Bouclé cream upholstery'],
    },
    {
      id: 'sona-loveseat',
      name: 'Sona 2-Seater Loveseat',
      category: 'Sofas',
      room: 'Living Room',
      price: 28499,
      material: 'Woven Cotton Blend',
      finish: 'Weave · Terracotta',
      blurb: 'Compact loveseat.',
      description: 'A compact two-seater.',
      dimensions: '152 × 86 × 84 cm',
      image: 'https://example.com/sona.jpg',
      details: ['Terracotta woven fabric'],
    },
  ];

  async function setupCatalogue() {
    await TestBed.configureTestingModule({
      imports: [CatalogueComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(CatalogueComponent);
    fixture.detectChanges();
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/products`)
      .flush(apiProducts);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance, httpMock };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify();
  });

  it('selects a valid product and returns to Furniture', async () => {
    const { fixture, cmp } = await setupCatalogue();

    expect(cmp.selected()).toBeNull();
    cmp.viewDetails('sona-loveseat');
    expect(cmp.selected()?.id).toBe('sona-loveseat');
    expect(cmp.selected()?.name).toContain('Sona');

    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-product-details')).toBeTruthy();

    cmp.closeDetails();
    expect(cmp.selected()).toBeNull();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-product-details')).toBeFalsy();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Furniture');
  });

  it('adds the details quantity to the existing cart count', async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'test-jwt');
    const { cmp, httpMock } = await setupCatalogue();
    // Authenticated session: the cart loads alongside the catalogue.
    httpMock
      .expectOne(`${environment.apiBaseUrl}/api/cart`)
      .flush({ items: [], itemCount: 0, subtotal: 0 });
    try {
      expect(cmp.cartCount()).toBe(0);
      cmp.addToCartQty({ id: 'aria-3s-sofa', qty: 3 });
      httpMock
        .expectOne(`${environment.apiBaseUrl}/api/cart/items`)
        .flush(cartWithQty(3));
      expect(cmp.qtyOf('aria-3s-sofa')).toBe(3);
      expect(cmp.cartCount()).toBe(3);
      cmp.addToCart('aria-3s-sofa');
      httpMock
        .expectOne(`${environment.apiBaseUrl}/api/cart/items`)
        .flush(cartWithQty(4));
      expect(cmp.cartCount()).toBe(4);
    } finally {
      localStorage.clear();
    }
  });
});

function cartWithQty(quantity: number) {
  const price = 42999;
  return {
    items: [
      {
        id: 'item-1',
        productId: 'aria-3s-sofa',
        slug: 'aria-3s-sofa',
        name: 'Aria 3-Seater Fabric Sofa',
        price,
        quantity,
        lineTotal: price * quantity,
        imageUrl: 'https://example.com/aria.jpg',
        isAvailable: true,
      },
    ],
    itemCount: quantity,
    subtotal: price * quantity,
  };
}
