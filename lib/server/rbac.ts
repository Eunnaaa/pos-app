import type { TenantRole } from "@/db/schema";
import { AppError } from "./errors";

export const permissions = [
  "dashboard:read",
  "pos:write",
  "sales:read",
  "sales:write",
  "inventory:read",
  "inventory:write",
  "purchases:read",
  "purchases:write",
  "customers:read",
  "customers:write",
  "suppliers:read",
  "suppliers:write",
  "finance:read",
  "finance:write",
  "finance:close",
  "finance:reopen",
  "reports:read",
  "employees:manage",
  "branches:manage",
  "settings:manage",
  "users:manage",
] as const;
export type Permission = (typeof permissions)[number];

const all = new Set<Permission>(permissions);
const rolePermissions: Record<TenantRole, ReadonlySet<Permission>> = {
  owner: all,
  cashier: new Set(["dashboard:read", "pos:write", "sales:read", "sales:write", "customers:read", "customers:write", "reports:read", "inventory:read"]),
};

export function can(role: TenantRole, permission: Permission, grants: readonly string[] = []): boolean {
  return rolePermissions[role].has(permission) || grants.includes(permission);
}

export function requirePermission(role: TenantRole, permission: Permission, grants: readonly string[] = []): void {
  if (!can(role, permission, grants)) throw new AppError("FORBIDDEN", `Missing permission: ${permission}`);
}

export function requireAnyRole(role: TenantRole, allowed: readonly TenantRole[]): void {
  if (!allowed.includes(role)) throw new AppError("FORBIDDEN", "Role is not permitted for this action");
}
