"use client";

import { authClient } from "@/lib/auth-client";
import { isSuperAdminEmail } from "@/lib/super-admin";
import {
  ACTIVE_BRANCH_KEY,
  ACTIVE_ORGANIZATION_KEY,
  ACTIVE_WAREHOUSE_KEY,
  persistActiveContext,
  type ApiEnvelope,
} from "./api";

export type UserOrganization = {
  id: string;
  name: string;
  slug: string;
  role: string;
  branches: {
    id: string;
    name: string;
    code: string;
    warehouses: { id: string; name: string; isDefault: boolean }[];
  }[];
};

export function setInitialOrganization(organization: UserOrganization) {
  const branch = organization.branches[0];
  const warehouse = branch?.warehouses.find((item) => item.isDefault) ?? branch?.warehouses[0];
  persistActiveContext({ organizationId: organization.id, branchId: branch?.id, warehouseId: warehouse?.id });
}

export async function resolveAuthenticatedDestination(): Promise<"/dashboard" | "/dashboard/admin" | "/onboarding"> {
  // 1. Check if user is Super Admin
  const session = await authClient.getSession();
  if (isSuperAdminEmail(session?.data?.user?.email)) {
    return "/dashboard/admin";
  }

  // 2. Otherwise resolve tenant organization
  const response = await fetch("/api/v1/me/organizations", { credentials: "include", cache: "no-store" });
  if (!response.ok) return "/onboarding";
  const payload = await response.json() as ApiEnvelope<UserOrganization[]> & { meta?: { isSuperAdmin?: boolean } };
  if (payload.meta?.isSuperAdmin) {
    return "/dashboard/admin";
  }
  if (!payload.data.length) {
    localStorage.removeItem(ACTIVE_ORGANIZATION_KEY);
    localStorage.removeItem(ACTIVE_BRANCH_KEY);
    localStorage.removeItem(ACTIVE_WAREHOUSE_KEY);
    return "/onboarding";
  }
  const storedId = localStorage.getItem(ACTIVE_ORGANIZATION_KEY);
  const selected = payload.data.find((item) => item.id === storedId) ?? payload.data[0];
  setInitialOrganization(selected);
  return "/dashboard";
}
