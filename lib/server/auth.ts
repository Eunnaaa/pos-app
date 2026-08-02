import { headers } from "next/headers";
import { auth, type AuthSession } from "@/lib/auth";
import { AppError } from "./errors";
import { resolveTenantContext, type TenantContext } from "./tenant";

export async function requireSession(requestHeaders?: Headers): Promise<AuthSession> {
  const session = await auth.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });
  if (!session) throw new AppError("UNAUTHENTICATED", "Authentication required");
  return session;
}

export async function requireTenantSession(
  organizationId: string,
  requestHeaders?: Headers,
): Promise<{ session: AuthSession; tenant: TenantContext }> {
  const session = await requireSession(requestHeaders);
  const tenant = await resolveTenantContext(session.user.id, organizationId);
  return { session, tenant };
}
