import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { syncChanges } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext, toJsonValue } from "@/lib/api";
import { parseJson } from "@/lib/server";

const changeSchema = z.object({
  clientId: z.string().min(8).max(200),
  clientSequence: z.number().int().positive(),
  entityType: z.string().min(1).max(100),
  entityId: z.string().min(1).max(200),
  operation: z.enum(["create", "update", "delete"]),
  payload: z.record(z.string(), z.unknown()),
});
const schema = z.object({ changes: z.array(changeSchema).min(1).max(100) });

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  const input = await parseJson(request, schema);
  const results = await db.transaction(async (tx) => {
    const output = [];
    for (const change of input.changes) {
      const [existing] = await tx.select().from(syncChanges).where(and(
        eq(syncChanges.organizationId, context.organizationId),
        eq(syncChanges.clientId, change.clientId),
        eq(syncChanges.clientSequence, change.clientSequence),
      )).limit(1);
      if (existing) {
        output.push({ clientSequence: change.clientSequence, status: existing.status, id: existing.id, replayed: true });
        continue;
      }
      const [created] = await tx.insert(syncChanges).values({
        organizationId: context.organizationId,
        branchId: context.branchId,
        ...change,
        payload: toJsonValue(change.payload),
        status: "applied",
        appliedAt: new Date(),
      }).returning();
      output.push({ clientSequence: change.clientSequence, status: created.status, id: created.id, replayed: false });
    }
    return output;
  });
  return dataResponse(results, { status: 202 });
});
