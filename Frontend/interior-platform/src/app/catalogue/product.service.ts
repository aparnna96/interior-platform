import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import type { CatalogueCategory, CatalogueProduct } from './catalogue-products';

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
}
