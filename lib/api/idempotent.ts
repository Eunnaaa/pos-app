import type { ApiContext } from "./context";
import { toJsonValue } from "./response";
import {
  claimIdempotency,
  completeIdempotency,
  failIdempotency,
  getRequiredHeader,
  idempotencyKeySchema,
} from "@/lib/server";

type IdempotentContext = Pick<ApiContext, "organizationId">;

export async function withIdempotency(
  request: Request,
  context: IdempotentContext,
  scope: string,
  body: unknown,
  execute: () => Promise<Response>,
): Promise<Response> {
  const key = idempotencyKeySchema.parse(getRequiredHeader(request, "idempotency-key", 200));
  const claim = await claimIdempotency({ organizationId: context.organizationId, scope, key, request: body });
  if (claim.state === "replay") {
    if (claim.status === 204) return new Response(null, { status: 204, headers: { "idempotency-replayed": "true" } });
    return Response.json(claim.body, { status: claim.status, headers: { "idempotency-replayed": "true" } });
  }

  let response: Response;
  try {
    response = await execute();
  } catch (error) {
    await failIdempotency(claim.id);
    throw error;
  }

  const payload = response.status === 204 ? null : await response.clone().json();
  let completionError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await completeIdempotency(claim.id, { status: response.status, body: toJsonValue(payload) });
      completionError = undefined;
      break;
    } catch (error) {
      completionError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  // The business operation already committed. Keep the claim in processing state
  // so a retry can recover through the operation's stable business reference.
  if (completionError) throw completionError;
  response.headers.set("idempotency-replayed", "false");
  return response;
}
