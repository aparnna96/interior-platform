import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import type { CatalogueCategory, CatalogueProduct } from './catalogue-products';
import { AuthService } from '../auth.service';
import type { Observable } from 'rxjs';

/**
 * Read-only product API client (catalogue integration, Task 1).
 *
 * Not wired into any component yet. Fetches the public product list and
 * maps each entry onto the existing {@link CatalogueProduct} frontend type.
 * No caching, persistence, retry, or interceptors — a single load signal set.
 */
export interface ProductDto {
  id: string;
  name: string;
  category: string;
  room: string;
  price: number;
  material: string;
  finish: string;
  blurb: string;
  description: string;
  dimensions: string;
  image: string;
  details: string[];
}

const PRODUCTS_URL = `${environment.apiBaseUrl}/api/products`;

/** Admin product shape: public fields plus IsActive visibility. */
export interface AdminProductDto extends ProductDto {
  isActive: boolean;
}

/**
 * Write payload for POST /api/products and PUT /api/products/{id}.
 * Field names match the backend DTOs (binding is case-insensitive).
 * `id` is the Admin-supplied slug for creation only — updates address the
 * product through the route id, which stays authoritative.
 */
export interface ProductUpsertRequest {
  id?: string;
  name: string;
  category: string;
  room: string;
  price: number;
  material: string;
  finish: string;
  blurb: string;
  description: string;
  dimensions: string;
  imageUrl: string;
  details: string[];
  isActive: boolean;
}

/** Backend category allowlist, mirrored for admin dropdowns (server owns validation). */
export const PRODUCT_CATEGORIES = ['Sofas', 'Beds', 'Tables', 'Chairs', 'Wardrobes'];

/** Backend room allowlist, mirrored for admin dropdowns (server owns validation). */
export const PRODUCT_ROOMS = ['Living Room', 'Bedroom', 'Dining', 'Workspace'];

/** Frontend-only field with no backend column: safe default until Task 2. */
export const PRODUCT_SWATCH_DEFAULT = '';

/** Maps one API entry onto the existing frontend product type. */
export function toCatalogueProduct(dto: ProductDto): CatalogueProduct {
  return {
    id: dto.id,
    name: dto.name,
    category: dto.category as CatalogueCategory,
    room: dto.room as CatalogueProduct['room'],
    price: dto.price,
    finish: dto.finish,
    blurb: dto.blurb,
    details: [...dto.details],
    swatch: PRODUCT_SWATCH_DEFAULT,
    image: dto.image,
    material: dto.material,
    dimensions: dto.dimensions,
    description: dto.description,
  };
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** Mapped products. Left untouched when a load fails. */
  readonly products = signal<CatalogueProduct[]>([]);
  /** True while a GET request is in flight. */
  readonly loading = signal(false);
  /** Concise failure message from the last load, or null. */
  readonly error = signal<string | null>(null);

  /** Loads GET /api/products. Ignored while a load is already in progress. */
  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.http.get<ProductDto[]>(PRODUCTS_URL).subscribe({
      next: (dtos) => {
        this.products.set((dtos ?? []).map(toCatalogueProduct));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load products.');
        this.loading.set(false);
      },
    });
  }

  /** GET /api/products/admin — Admin only, active and inactive. Bearer auth. */
  getAdminProducts(): Observable<AdminProductDto[]> {
    return this.http.get<AdminProductDto[]>(`${PRODUCTS_URL}/admin`, { headers: this.authHeaders() });
  }

  /** POST /api/products — Admin only. `id` slug is part of the request. */
  createProduct(request: ProductUpsertRequest): Observable<AdminProductDto> {
    return this.http.post<AdminProductDto>(PRODUCTS_URL, request, { headers: this.authHeaders() });
  }

  /** PUT /api/products/{id} — Admin only. The route id stays authoritative. */
  updateProduct(id: string, request: ProductUpsertRequest): Observable<AdminProductDto> {
    return this.http.put<AdminProductDto>(`${PRODUCTS_URL}/${id}`, request, { headers: this.authHeaders() });
  }

  /**
   * DELETE /api/products/{id} — Admin only. Soft-deactivation: the backend
   * flips IsActive instead of deleting the row. Resolves on 204 No Content.
   */
  deactivateProduct(id: string): Observable<void> {
    return this.http.delete<void>(`${PRODUCTS_URL}/${id}`, { headers: this.authHeaders() });
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.token();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
