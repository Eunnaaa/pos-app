import { sql } from "drizzle-orm";
import { bigint, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";

export type JsonValue =
  | boolean
  | number
  | string
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const idColumn = (name = "id") => uuid(name).defaultRandom().primaryKey();

export const moneyColumn = (name: string) =>
  bigint(name, { mode: "bigint" }).default(sql`0`).notNull();

export const quantityColumn = (name: string) =>
  bigint(name, { mode: "bigint" }).default(sql`0`).notNull();

export const jsonColumn = <T extends JsonValue>(name: string) => jsonb(name).$type<T>();

export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
