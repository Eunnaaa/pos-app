import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { parseJson } from "@/lib/server";

const schema = z.object({ email: z.string().email().toLowerCase() });

export const POST = apiHandler(async (request) => {
  const input = await parseJson(request, schema);
  const [existing] = await db.select({ id: user.id }).from(user).where(sql`lower(${user.email}) = ${input.email}`).limit(1);
  return dataResponse({ registered: Boolean(existing) });
});