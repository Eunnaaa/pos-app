import { z, type ZodType } from "zod";
import { AppError } from "./errors";

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/json") {
    throw new AppError("BAD_REQUEST", "Content-Type must be application/json");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError("BAD_REQUEST", "Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function parseSearchParams<T>(url: string, schema: ZodType<T>): T {
  const values = Object.fromEntries(new URL(url).searchParams.entries());
  return schema.parse(values);
}

export const uuidSchema = z.string().uuid();
export const idempotencyKeySchema = z.string().min(8).max(200).regex(/^[A-Za-z0-9._:-]+$/);

export function getRequiredHeader(request: Request, name: string, maxLength = 500): string {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new AppError("BAD_REQUEST", `Missing ${name} header`);
  if (value.length > maxLength) throw new AppError("BAD_REQUEST", `${name} header is too long`);
  return value;
}
