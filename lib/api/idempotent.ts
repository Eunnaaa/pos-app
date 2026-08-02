import type { ApiContext } from "./context";
import { toJsonValue } from "./response";
import {
  claimIdempotency,
  completeIdempotency,
  failIdempotency,
  getRequiredHeader,
  idempotencyKeySchema,
} from "@/lib/server";

export async function withIdempotency(
  request: Request,
  context: ApiContext,
  scope: string,
  body: unknown,
  execute: () => Promise<Response>,
): Promise<Response> {
  const key = idempotencyKeySchema.parse(getRequiredHeader(request, "idempotency-key", 200));
  const claim = await claimIdempotency({ organizationId: context.organizationId, scope, key, request: body });
  if (claim.state === "replay") return Response.json(claim.body, { status: claim.status, headers: { "idempotency-replayed": "true" } });

  try {
    const response = await execute();
    const payload = response.status === 204 ? null : await response.clone().json();
    await completeIdempotency(claim.id, { status: response.status, body: toJsonValue(payload) });
    response.headers.set("idempotency-replayed", "false");
    return response;
  } catch (error) {
    await failIdempotency(claim.id);
    throw error;
  }
}
