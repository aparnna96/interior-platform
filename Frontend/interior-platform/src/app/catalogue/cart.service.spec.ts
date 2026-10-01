import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { CartService } from './cart.service';
import { ProductService, type ProductDto } from './product.service';
import type { CatalogueProduct } from './catalogue-products';
import { environment } from '../../environments/environment';

const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;

const API_PRODUCTS: ProductDto[] = [
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

describe('CartService', () => {
  let cart: CartService;
  let products: ProductService;
  let httpMock: HttpTestingController;
  let first: CatalogueProduct;
  let second: CatalogueProduct;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    cart = TestBed.inject(CartService);
    products = TestBed.inject(ProductService);
    httpMock = TestBed.inject(HttpTestingController);
    cart.clear();
    products.load();
    httpMock.expectOne(PRODUCTS_URL).flush(API_PRODUCTS);
    first = products.products()[0];
    second = products.products()[1];
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('starts empty', () => {
    expect(cart.lines()).toEqual([]);
    expect(cart.totalQty()).toBe(0);
    expect(cart.subtotal()).toBe(0);
    expect(cart.qtyOf(first.id)).toBe(0);
  });

  it('adds one product', () => {
    cart.add(first.id);
    expect(cart.qtyOf(first.id)).toBe(1);
    expect(cart.totalQty()).toBe(1);
    expect(cart.lines().length).toBe(1);
    expect(cart.lines()[0].product.id).toBe(first.id);
  });

  it('adds the same product twice by increasing quantity, not duplicating', () => {
    cart.add(first.id);
    cart.add(first.id, 2);
    expect(cart.lines().length).toBe(1);
    expect(cart.qtyOf(first.id)).toBe(3);
    expect(cart.totalQty()).toBe(3);
  });

  it('increments quantity', () => {
    cart.add(first.id);
    cart.increment(first.id);
    expect(cart.qtyOf(first.id)).toBe(2);
  });

  it('decrements quantity but never below 1', () => {
    cart.add(first.id, 2);
    cart.decrement(first.id);
    expect(cart.qtyOf(first.id)).toBe(1);
    cart.decrement(first.id);
    expect(cart.qtyOf(first.id)).toBe(1);
    expect(cart.lines().length).toBe(1);
  });

  it('removes a product', () => {
    cart.add(first.id);
    cart.add(second.id);
    cart.remove(first.id);
    expect(cart.qtyOf(first.id)).toBe(0);
    expect(cart.lines().length).toBe(1);
    expect(cart.totalQty()).toBe(1);
  });

  it('calculates line subtotal from product price', () => {
    cart.add(first.id, 3);
    expect(cart.lines()[0].subtotal).toBe(first.price * 3);
  });

  it('calculates cart subtotal across lines', () => {
    cart.add(first.id, 2);
    cart.add(second.id, 1);
    expect(cart.subtotal()).toBe(first.price * 2 + second.price);
  });

  it('counts total items across lines', () => {
    cart.add(first.id, 2);
    cart.add(second.id, 3);
    expect(cart.totalQty()).toBe(5);
  });

  it('ignores unknown product ids', () => {
    cart.add('no-such-product');
    expect(cart.lines()).toEqual([]);
    expect(cart.totalQty()).toBe(0);
  });

  it('keeps quantities when products reload without the item, then restores its line', () => {
    cart.add(first.id, 2);
    expect(cart.lines().length).toBe(1);

    products.load();
    httpMock.expectOne(PRODUCTS_URL).flush([API_PRODUCTS[1]]);
    // Stored quantity survives even though no line can be resolved.
    expect(cart.qtyOf(first.id)).toBe(2);
    expect(cart.lines().length).toBe(0);

    products.load();
    httpMock.expectOne(PRODUCTS_URL).flush(API_PRODUCTS);
    expect(cart.lines().length).toBe(1);
    expect(cart.lines()[0].qty).toBe(2);
    expect(cart.lines()[0].subtotal).toBe(first.price * 2);
  });

  it('shows lines for ids added before a later product load resolves them', () => {
    cart.add(second.id, 3);
    products.load();
    httpMock.expectOne(PRODUCTS_URL).flush(API_PRODUCTS);
    expect(cart.lines().length).toBe(1);
    expect(cart.lines()[0].product.id).toBe(second.id);
    expect(cart.totalQty()).toBe(3);
  });
});
