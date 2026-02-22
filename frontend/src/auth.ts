/**
 * Auth state: token and user in memory (not localStorage).
 * API client reads token via getToken() for Authorization header and SSE URL.
 */

export interface AuthUser {
  name: string;
  email: string;
  role: "ciso" | "dpo" | "auditor";
  entity: string;
}

let apiToken: string | null = null;
let apiUser: AuthUser | null = null;

export function getToken(): string | null {
  return apiToken;
}

export function setAuth(token: string, user: AuthUser): void {
  apiToken = token;
  apiUser = user;
}

export function clearAuth(): void {
  apiToken = null;
  apiUser = null;
}

export function getUser(): AuthUser | null {
  return apiUser;
}
