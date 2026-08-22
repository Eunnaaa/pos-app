import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { AppError, parseJson } from "@/lib/server";
import { publishEvent, RedisKeys } from "@/lib/redis";

const statusSchema = z.object({
  status: z.enum(["queued", "cooking", "ready", "served", "cancelled"]),
});

export const PATCH = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
  const context = await requireApiContext(request, "sales:write");
  const input = await parseJson(request, statusSchema);

  const existing = await db.execute<{ status: string; branch_id: string }>(sql`
    select status, branch_id from kitchen_tickets
    where id = ${id} and organization_id = ${context.organizationId}
    ${context.branchId ? sql`and branch_id = ${context.branchId}` : sql``}
    limit 1
  `);
  const row = existing.rows[0] as { status: string; branch_id: string } | undefined;
  if (!row) throw new AppError("NOT_FOUND", "Kitchen ticket not found");

  const now = new Date();
  const updates: Record<string, unknown> = { status: input.status, updated_at: now };
  if (input.status === "cooking" && row.status === "queued") updates.started_at = now;
  if (input.status === "ready" && row.status === "cooking") updates.ready_at = now;
  if (input.status === "served" && row.status === "ready") updates.served_at = now;

  const setClause = sql.join(
    Object.entries(updates).map(([col, val]) => sql`${sql.identifier(col)} = ${val}`),
    sql.raw(", "),
  );

  await db.execute(sql`update kitchen_tickets set ${setClause} where id = ${id}`);

  const branchId = row.branch_id || context.branchId;
  if (branchId) {
    void publishEvent(RedisKeys.kdsChannel(branchId), {
      type: "TICKET_STATUS_CHANGED",
      ticketId: id,
      status: input.status,
    });
  }

  return dataResponse({ id, status: input.status });
});
