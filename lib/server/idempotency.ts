import { and, eq } from "drizzle-orm";
import { db, type Database } from "@/db";
import { idempotencyKeys, type JsonValue } from "@/db/schema";
import { AppError } from "./errors";
import { hashIdempotentRequest } from "./idempotency-hash";

export { hashIdempotentRequest } from "./idempotency-hash";

export type IdempotencyClaim =
  | { state: "claimed"; id: string }
  | { state: "replay"; status: number; body: JsonValue };

export async function claimIdempotency(
  input: { organizationId: string; scope: string; key: string; request: unknown; ttlSeconds?: number },
  database: Database = db,
): Promise<IdempotencyClaim> {
  const requestHash = hashIdempotentRequest(input.request);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlSeconds ?? 86_400) * 1_000);
  const lockedUntil = new Date(now.getTime() + 30_000);

  const [created] = await database
    .insert(idempotencyKeys)
    .values({
      organizationId: input.organizationId,
      scope: input.scope,
      key: input.key,
      requestHash,
      expiresAt,
      lockedUntil,
    })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeys.id });
  if (created) return { state: "claimed", id: created.id };

  const [existing] = await database
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.organizationId, input.organizationId),
        eq(idempotencyKeys.scope, input.scope),
        eq(idempotencyKeys.key, input.key),
      ),
    )
    .limit(1);
  if (!existing) throw new AppError("CONFLICT", "Idempotency state changed; retry request");
  if (existing.requestHash !== requestHash) {
    throw new AppError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different request");
  }
  if (existing.status === "completed" && existing.responseStatus && existing.responseBody !== null) {
    return { state: "replay", status: existing.responseStatus, body: existing.responseBody as JsonValue };
  }
  if (existing.expiresAt <= now) {
    await database.delete(idempotencyKeys).where(eq(idempotencyKeys.id, existing.id));
    return claimIdempotency(input, database);
  }
  throw new AppError("CONFLICT", "An identical request is already processing");
}

export async function completeIdempotency(
  id: string,
  response: { status: number; body: JsonValue },
  database: Database = db,
): Promise<void> {
  await database
    .update(idempotencyKeys)
    .set({ status: "completed", responseStatus: response.status, responseBody: response.body, lockedUntil: null, updatedAt: new Date() })
    .where(eq(idempotencyKeys.id, id));
}

export async function failIdempotency(id: string, database: Database = db): Promise<void> {
  await database
    .update(idempotencyKeys)
    .set({ status: "failed", lockedUntil: null, updatedAt: new Date() })
    .where(eq(idempotencyKeys.id, id));
}
