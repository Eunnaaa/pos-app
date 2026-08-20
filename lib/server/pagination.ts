import { z } from "zod";
import { AppError } from "./errors";

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
  cursor: z.string().max(500).optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

type CursorPayload = { id: string; sort: string | number };

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(cursor?: string): CursorPayload | undefined {
  if (!cursor) return undefined;
  try {
    return z
      .object({ id: z.string().min(1), sort: z.union([z.string(), z.number()]) })
      .parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new AppError("BAD_REQUEST", "Invalid pagination cursor");
  }
}

export function paginated<T>(items: T[], limit: number, cursorFor: (item: T) => CursorPayload) {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const last = data.at(-1);
  return { data, page: { hasMore, nextCursor: hasMore && last ? encodeCursor(cursorFor(last)) : null } };
}
