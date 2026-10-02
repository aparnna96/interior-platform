import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../environments/environment';

/** Storage key for the JWT. Exported for tests; not part of any API. */
export const AUTH_TOKEN_KEY = 'ip.auth.token';

/** Role names issued by the backend login endpoint. */
export const ROLE_ADMIN = 'Admin';
export const ROLE_FIELD_STAFF = 'FieldStaff';
export const ROLE_CUSTOMER = 'Customer';

/** Claim keys that may carry roles in a JWT payload. */
const ROLE_CLAIM_KEYS = [
  'role',
  'roles',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
];

interface LoginResponse {
  Token?: string;
  token?: string;
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Decodes role names from a JWT payload without verifying the signature.
 * Display-only: the backend remains the actual authorization boundary, so a
 * forged token only changes which navigation items render, never what the
 * API returns. Unknown or malformed tokens yield no roles.
 */
export function decodeJwtRoles(token: string | null): string[] {
  if (!token) return [];
  const parts = token.split('.');
  if (parts.length < 2) return [];
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
    const found: string[] = [];
    for (const key of ROLE_CLAIM_KEYS) {
      const value = payload[key];
      if (typeof value === 'string' && value) found.push(value);
      else if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === 'string' && entry) found.push(entry);
        }
      }
    }
    return [...new Set(found)];
  } catch {
    return [];
  }
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private registerUrl = `${environment.apiBaseUrl}/api/auth/register`;
  private loginUrl = `${environment.apiBaseUrl}/api/auth/login`;

  private readonly tokenState = signal<string | null>(readStoredToken());

  /** True when a JWT is stored. Drives cart loading/clearing. */
  readonly isAuthenticated = computed(() => this.tokenState() !== null);

  /** Role names decoded from the stored JWT (display-only, see decodeJwtRoles). */
  readonly roles = computed(() => decodeJwtRoles(this.tokenState()));

  /** True for Admin/FieldStaff sessions: gates the internal Leads workspace. */
  readonly isStaff = computed(
    () => this.roles().includes(ROLE_ADMIN) || this.roles().includes(ROLE_FIELD_STAFF)
  );

  /** True for Admin sessions only: gates internal admin workspaces. */
  readonly isAdmin = computed(() => this.roles().includes(ROLE_ADMIN));

  constructor(private http: HttpClient) {}

  register(email: string, password: string): Observable<unknown> {
    return this.http.post(this.registerUrl, { email, password });
  }

  /**
   * Logs in via POST /api/auth/login and stores the returned JWT.
   * The backend answers `{ Token: "<jwt>" }`; lowercase `token` is
   * accepted too. Emits the stored token.
   */
  login(email: string, password: string): Observable<string> {
    return this.http.post<LoginResponse>(this.loginUrl, { email, password }).pipe(
      map((body) => body?.Token ?? body?.token ?? ''),
      tap((token) => {
        if (!token) {
          throw new Error('Login did not return a token.');
        }
        this.setToken(token);
      })
    );
  }

  /** Current JWT, or null when logged out. Sent as `Bearer` on cart calls. */
  token(): string | null {
    return this.tokenState();
  }

  logout(): void {
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
      // Storage unavailable — in-memory state is still cleared below.
    }
    this.tokenState.set(null);
  }

  private setToken(token: string): void {
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch {
      // Storage unavailable — keep the token in memory for this session.
    }
    this.tokenState.set(token);
  }
}
