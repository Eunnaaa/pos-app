import { apiHandler, dataResponse } from "@/lib/api";
import { requireTenantSession } from "@/lib/server/auth";
import { can } from "@/lib/server/rbac";

export const GET = apiHandler(async (request) => {
  const orgId = request.headers.get("x-organization-id")?.trim();
  if (!orgId) throw new Error("Missing organization ID");
  const { session, tenant } = await requireTenantSession(orgId);
  const permissionCheck = can(tenant.role, "pos:write");
  return dataResponse({
    userId: session.user.id,
    role: tenant.role,
    permissions: tenant.permissions,
    canPosWrite: permissionCheck,
  });
});
