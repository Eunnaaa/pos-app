import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getServerEnv } from "@/config/env";
import * as schema from "@/db/schema";

const env = getServerEnv();
const globalForDb = globalThis as unknown as { posPool?: Pool };

export const pool =
  globalForDb.posPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : false,
  });

if (env.NODE_ENV !== "production") globalForDb.posPool = pool;

export const db = drizzle(pool, { schema, casing: "snake_case" });
export type Database = typeof db;
