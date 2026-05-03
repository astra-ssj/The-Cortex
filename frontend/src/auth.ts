/**
 * Auth state: token and user in memory (not localStorage).
 * API client reads token via getToken() for Authorization header and SSE URL.
 */

import type { Role } from "./lib/roles";

export interface AuthUser {
  name: string;
  email: string;
  /** RBAC — mirrors JWT/session when backend adds claims; useRole normalizes unknown values to admin. */
  role?: Role | string;
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
