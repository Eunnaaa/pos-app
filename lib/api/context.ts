import type { AuthSession } from "@/lib/auth";
import {
  authorizeTenant,
  createRequestContext,
  requireTenantSession,
  type Permission,
  type RequestContext,
  type TenantContext,
} from "@/lib/server";

export type ApiContext = RequestContext & {
  session: AuthSession;
  tenant: TenantContext;
};

export async function requireApiContext(request: Request, permission: Permission): Promise<ApiContext> {
  const requestContext = createRequestContext(request);
  const { session, tenant } = await requireTenantSession(requestContext.organizationId, request.headers);
  authorizeTenant(tenant, permission, requestContext.branchId);
  return { ...requestContext, session, tenant };
}
