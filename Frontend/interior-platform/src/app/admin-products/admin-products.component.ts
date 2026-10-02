import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../auth.service';
import {
  ProductService,
  PRODUCT_CATEGORIES,
  PRODUCT_ROOMS,
  type AdminProductDto,
  type ProductUpsertRequest,
} from '../catalogue/product.service';

/** Slug rule mirrors the backend Id pattern (lowercase, numbers, hyphens). */
const SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * Internal Admin-only product management over GET /api/products/admin,
 * POST /api/products, PUT /api/products/{id} and DELETE /api/products/{id}
 * (soft-deactivation). Visible only to Admin sessions; the backend remains
 * the authorization boundary, so anyone else issues no requests and sees an
 * access-denied/login state instead. The public catalogue (GET /api/products,
 * active only) is untouched — this workspace always reads the admin list.
 */
@Component({
  selector: 'app-admin-products',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-products.component.html',
  styleUrl: './admin-products.component.css',
})
export class AdminProductsComponent {
  private readonly auth = inject(AuthService);
  private readonly products = inject(ProductService);
  private readonly fb = inject(FormBuilder);

  /** Admin-only gate; anyone else never loads admin data. */
  readonly canAccess = computed(() => this.auth.isAdmin());
  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());

  readonly list = signal<AdminProductDto[] | null>(null);
  readonly listLoading = signal(false);
  readonly listError = signal<string | null>(null);
  readonly forbidden = signal(false);
  readonly notice = signal<string | null>(null);

  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly confirmingDeactivateId = signal<string | null>(null);
  readonly deactivatingId = signal<string | null>(null);
  readonly deactivateError = signal<string | null>(null);

  readonly categories = PRODUCT_CATEGORIES;
  readonly rooms = PRODUCT_ROOMS;

  readonly form = this.fb.group({
    id: ['', [Validators.required, Validators.maxLength(100)]],
    name: ['', [Validators.required, Validators.maxLength(200)]],
    category: [PRODUCT_CATEGORIES[0], [Validators.required]],
    room: [PRODUCT_ROOMS[0], [Validators.required]],
    price: [0, [Validators.required, Validators.min(1), Validators.pattern(/^[0-9]+$/)]],
    material: ['', [Validators.required, Validators.maxLength(200)]],
    finish: ['', [Validators.required, Validators.maxLength(200)]],
    blurb: ['', [Validators.required, Validators.maxLength(500)]],
    description: ['', [Validators.required, Validators.maxLength(2000)]],
    dimensions: ['', [Validators.required, Validators.maxLength(100)]],
    imageUrl: ['', [Validators.required, Validators.maxLength(2000)]],
    details: ['', [Validators.required]],
    isActive: [true],
  });

  constructor() {
    if (this.auth.isAdmin()) {
      this.loadProducts();
    }
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        // Never show one session's admin data to another session.
        this.resetAll();
      } else if (
        this.auth.isAdmin() &&
        this.list() === null &&
        !this.listLoading() &&
        !this.listError() &&
        !this.forbidden()
      ) {
        this.loadProducts();
      }
    });
  }

  /** GET /api/products/admin — Admin only; no-op otherwise or while loading. */
  loadProducts(): void {
    if (!this.auth.isAdmin() || this.listLoading()) return;
    this.listLoading.set(true);
    this.listError.set(null);
    this.forbidden.set(false);
    this.products.getAdminProducts().subscribe({
      next: (products) => {
        this.list.set(products ?? []);
        this.listLoading.set(false);
      },
      error: (err: unknown) => {
        this.listLoading.set(false);
        this.handleListError(err);
      },
    });
  }

  openCreate(): void {
    if (!this.auth.isAdmin()) return;
    this.editingId.set(null);
    this.form.reset({
      id: '',
      name: '',
      category: PRODUCT_CATEGORIES[0],
      room: PRODUCT_ROOMS[0],
      price: 0,
      material: '',
      finish: '',
      blurb: '',
      description: '',
      dimensions: '',
      imageUrl: '',
      details: '',
      isActive: true,
    });
    this.form.get('id')?.enable();
    this.formError.set(null);
    this.notice.set(null);
    this.formOpen.set(true);
  }

  openEdit(product: AdminProductDto): void {
    if (!this.auth.isAdmin()) return;
    this.editingId.set(product.id);
    this.form.reset({
      id: product.id,
      name: product.name,
      category: product.category,
      room: product.room,
      price: product.price,
      material: product.material,
      finish: product.finish,
      blurb: product.blurb,
      description: product.description,
      dimensions: product.dimensions,
      imageUrl: product.image,
      details: product.details.join('\n'),
      isActive: product.isActive,
    });
    // The route id stays authoritative on save; the slug itself is immutable.
    this.form.get('id')?.disable();
    this.formError.set(null);
    this.notice.set(null);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
    this.formError.set(null);
    this.form.get('id')?.enable();
  }

  /** POST for create, PUT to the editing route id for edits. */
  submitForm(): void {
    if (!this.auth.isAdmin() || !this.formOpen() || this.saving()) return;
    this.formError.set(null);
    this.notice.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('Please complete the highlighted fields.');
      return;
    }
    const request = this.buildRequest();
    if (request === null) {
      this.formError.set('Please complete the highlighted fields.');
      return;
    }
    const editingId = this.editingId();
    this.saving.set(true);
    const done = (saved: AdminProductDto) => {
      this.saving.set(false);
      this.closeForm();
      this.notice.set(
        editingId === null
          ? `Product '${saved.name}' created.`
          : `Product '${saved.name}' updated.`
      );
      this.loadProducts();
    };
    if (editingId === null) {
      this.products.createProduct(request).subscribe({
        next: done,
        error: (err: unknown) => {
          this.saving.set(false);
          this.formError.set(this.describeError(err));
        },
      });
    } else {
      this.products.updateProduct(editingId, request).subscribe({
        next: done,
        error: (err: unknown) => {
          this.saving.set(false);
          this.formError.set(this.describeError(err));
        },
      });
    }
  }

  /** First tap arms an inline confirmation; nothing is deleted yet. */
  requestDeactivate(id: string): void {
    if (!this.auth.isAdmin() || this.deactivatingId() !== null) return;
    this.deactivateError.set(null);
    this.notice.set(null);
    this.confirmingDeactivateId.set(id);
  }

  cancelDeactivate(): void {
    this.confirmingDeactivateId.set(null);
    this.deactivateError.set(null);
  }

  /** DELETE is soft-deactivation on the backend; the row stays, Inactive. */
  confirmDeactivate(): void {
    const id = this.confirmingDeactivateId();
    if (!this.auth.isAdmin() || id === null || this.deactivatingId() !== null) return;
    this.deactivatingId.set(id);
    this.deactivateError.set(null);
    this.products.deactivateProduct(id).subscribe({
      next: () => {
        this.deactivatingId.set(null);
        this.confirmingDeactivateId.set(null);
        this.notice.set('Product deactivated.');
        this.loadProducts();
      },
      error: (err: unknown) => {
        this.deactivatingId.set(null);
        this.handleDeactivateError(err);
      },
    });
  }

  inr(n: number): string {
    return n.toLocaleString('en-IN');
  }

  private buildRequest(): ProductUpsertRequest | null {
    const value = this.form.getRawValue();
    const details = String(value.details ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const price = Number(value.price);
    const slug = String(value.id ?? '').trim();
    if (
      this.editingId() === null &&
      (slug.length === 0 || slug.length > 100 || !SLUG_PATTERN.test(slug))
    ) {
      this.form.get('id')?.setErrors({ pattern: true });
      return null;
    }
    if (!Number.isInteger(price) || price < 1) {
      this.form.get('price')?.setErrors({ min: true });
      return null;
    }
    if (details.length === 0) {
      this.form.get('details')?.setErrors({ required: true });
      return null;
    }
    if (!String(value.imageUrl ?? '').match(/^https?:\/\/.+/)) {
      this.form.get('imageUrl')?.setErrors({ pattern: true });
      return null;
    }
    return {
      ...(this.editingId() === null ? { id: slug } : {}),
      name: String(value.name ?? '').trim(),
      category: String(value.category ?? ''),
      room: String(value.room ?? ''),
      price,
      material: String(value.material ?? '').trim(),
      finish: String(value.finish ?? '').trim(),
      blurb: String(value.blurb ?? '').trim(),
      description: String(value.description ?? '').trim(),
      dimensions: String(value.dimensions ?? '').trim(),
      imageUrl: String(value.imageUrl ?? '').trim(),
      details,
      isActive: value.isActive ?? true,
    };
  }

  private resetAll(): void {
    this.list.set(null);
    this.listLoading.set(false);
    this.listError.set(null);
    this.forbidden.set(false);
    this.notice.set(null);
    this.closeForm();
    this.confirmingDeactivateId.set(null);
    this.deactivatingId.set(null);
    this.deactivateError.set(null);
    this.saving.set(false);
  }

  private handleListError(err: unknown): void {
    if ((err as { status?: number })?.status === 401) {
      this.auth.logout();
      this.resetAll();
      this.listError.set('Your session has expired. Please log in again.');
      return;
    }
    if ((err as { status?: number })?.status === 403) {
      this.forbidden.set(true);
      return;
    }
    this.listError.set(this.describeError(err));
  }

  private handleDeactivateError(err: unknown): void {
    const status = (err as { status?: number })?.status;
    if (status === 401) {
      this.auth.logout();
      this.resetAll();
      this.listError.set('Your session has expired. Please log in again.');
      return;
    }
    if (status === 403) {
      this.forbidden.set(true);
      this.confirmingDeactivateId.set(null);
      return;
    }
    // The product row is untouched; the confirmation stays open for retry.
    this.deactivateError.set(this.describeError(err));
  }

  private describeError(err: unknown): string {
    const status = (err as { status?: number })?.status;
    const body = (err as { error?: unknown })?.error;
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      const title = record['title'];
      if (typeof title === 'string' && title) return title;
      const errors = record['errors'];
      if (errors && typeof errors === 'object') {
        const first = Object.values(errors as Record<string, unknown>)
          .flat()
          .map(String)
          .find((m) => m);
        if (first) return first;
      }
    }
    if (typeof body === 'string' && body) return body;
    if (status === 404) return 'That product could not be found. The list may be out of date.';
    if (status === 409) return 'A product with this slug already exists.';
    return 'Something went wrong. Please try again.';
  }
}
