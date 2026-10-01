import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../environments/environment';

/** Storage key for the JWT. Exported for tests; not part of any API. */
export const AUTH_TOKEN_KEY = 'ip.auth.token';

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

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private registerUrl = `${environment.apiBaseUrl}/api/auth/register`;
  private loginUrl = `${environment.apiBaseUrl}/api/auth/login`;

  private readonly tokenState = signal<string | null>(readStoredToken());

  /** True when a JWT is stored. Drives cart loading/clearing. */
  readonly isAuthenticated = computed(() => this.tokenState() !== null);

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
