import { z } from "zod";
import { getRequiredHeader } from "./validation";

export type RequestContext = {
  requestId: string;
  organizationId: string;
  branchId?: string;
  ipAddress?: string;
  userAgent?: string;
};

export function createRequestContext(request: Request): RequestContext {
  const requestId = request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
  const organizationId = z.string().uuid().parse(getRequiredHeader(request, "x-organization-id", 36));
  const branchHeader = request.headers.get("x-branch-id")?.trim();
  const branchId = branchHeader ? z.string().uuid().parse(branchHeader) : undefined;
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return {
    requestId,
    organizationId,
    ...(branchId ? { branchId } : {}),
    ...(forwardedFor ? { ipAddress: forwardedFor.slice(0, 64) } : {}),
    ...(request.headers.get("user-agent") ? { userAgent: request.headers.get("user-agent")!.slice(0, 500) } : {}),
  };
}
