import { getUser } from "../api/client";
import { ROLE_PERMISSIONS, normalizeRole, type Role } from "../lib/roles";

export type Permission = keyof (typeof ROLE_PERMISSIONS)["admin"];

export function useRole(): {
  role: Role;
  can: (permission: Permission) => boolean;
} {
  const user = getUser() as Record<string, unknown> | null;
  const role = normalizeRole(user?.role);
  const matrix = ROLE_PERMISSIONS[role];

  function can(permission: Permission): boolean {
    return Boolean(matrix[permission]);
  }

  return { role, can };
}
