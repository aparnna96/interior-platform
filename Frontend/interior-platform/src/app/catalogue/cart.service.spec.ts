import { TestBed } from '@angular/core/testing';
import { CartService } from './cart.service';
import { PRODUCTS } from './catalogue-products';

describe('CartService', () => {
  let cart: CartService;
  const first = PRODUCTS[0];
  const second = PRODUCTS[1];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    cart = TestBed.inject(CartService);
    cart.clear();
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

  it('calculates line subtotal from catalogue price', () => {
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
});
