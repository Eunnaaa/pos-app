import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiHandler, dataResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = apiHandler(async () => {
  await db.execute(sql`select 1`);
  return dataResponse({ status: "ok", service: "kasir-ku", timestamp: new Date() });
});
