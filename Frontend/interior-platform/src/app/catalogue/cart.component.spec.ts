import { TestBed } from '@angular/core/testing';
import { CartComponent } from './cart.component';
import { CartService } from './cart.service';
import { PRODUCTS } from './catalogue-products';

describe('CartComponent', () => {
  let cart: CartService;
  const first = PRODUCTS[0];
  const second = PRODUCTS[1];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CartComponent],
    }).compileComponents();
    cart = TestBed.inject(CartService);
    cart.clear();
  });

  function setup() {
    const fixture = TestBed.createComponent(CartComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('creates with a polished empty state', () => {
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance).toBeTruthy();
    expect(el.textContent).toContain('Your cart is empty');
    expect(el.textContent).toContain('Browse Furniture');
    expect(el.querySelector('.cart-empty')).toBeTruthy();
    expect(el.querySelector('.summary')).toBeFalsy();
  });

  it('emits browse to return to the Furniture catalogue', () => {
    const fixture = setup();
    let browsed = false;
    fixture.componentInstance.browse.subscribe(() => (browsed = true));
    fixture.componentInstance.goBrowse();
    expect(browsed).toBeTrue();
  });

  it('displays added products with catalogue data and line subtotal', () => {
    cart.add(first.id, 2);
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain(first.name);
    expect(el.textContent).toContain(first.category);
    expect(el.textContent).toContain(first.room);
    expect(el.textContent).toContain(`₹${(first.price * 2).toLocaleString('en-IN')}`);
    const img = el.querySelector('.line-media img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe(first.image);
    expect(img?.getAttribute('alt')).toBe(first.name);
  });

  it('shows summary with item count, subtotal and total', () => {
    cart.add(first.id, 2);
    cart.add(second.id, 1);
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('3');
    expect(el.textContent).toContain(`₹${(first.price * 2 + second.price).toLocaleString('en-IN')}`);
    expect(el.querySelector('.summary')).toBeTruthy();
    const checkout = el.querySelector('.summary .btn-primary') as HTMLButtonElement | null;
    expect(checkout?.textContent).toContain('Proceed to Checkout');
    expect(checkout?.disabled).toBeTrue();
    expect(el.textContent).toContain('Checkout arrives in a later stage.');
  });

  it('increments, decrements (min 1) and removes through the view', () => {
    cart.add(first.id, 2);
    const fixture = setup();
    const cmp = fixture.componentInstance;

    cmp.cart.increment(first.id);
    fixture.detectChanges();
    expect(cart.qtyOf(first.id)).toBe(3);

    cmp.cart.decrement(first.id);
    cmp.cart.decrement(first.id);
    cmp.cart.decrement(first.id);
    fixture.detectChanges();
    expect(cart.qtyOf(first.id)).toBe(1);

    cmp.cart.remove(first.id);
    fixture.detectChanges();
    expect(cart.lines().length).toBe(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Your cart is empty');
  });
});
