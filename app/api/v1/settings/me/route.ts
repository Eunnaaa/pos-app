import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { auth } from "@/lib/auth";
import { parseJson, requireSession } from "@/lib/server";

const nameSchema = z.string().trim().min(1).max(100);
const emailSchema = z.string().trim().email().max(150).toLowerCase();

const updateSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    locale: z.string().trim().max(20).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Tidak ada data yang dikirim");

export const GET = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  return dataResponse({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    image: session.user.image,
    locale: session.user.locale,
  });
});

export const PATCH = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  const input = await parseJson(request, updateSchema);
  const result: { name?: string; email?: string; emailVerified?: boolean; image?: string; locale?: string; emailStatus?: "pending" } = {};

  if (input.name !== undefined && input.name !== session.user.name) {
    await auth.api.updateUser({
      headers: request.headers,
      body: { name: input.name },
    });
    result.name = input.name;
  }

  if (input.email !== undefined && input.email !== session.user.email) {
    await auth.api.changeEmail({
      headers: request.headers,
      body: { newEmail: input.email, callbackURL: "/dashboard/settings" },
    });
    result.emailStatus = "pending";
  }

  if (input.locale !== undefined && input.locale !== session.user.locale) {
    await db.update(user).set({ locale: input.locale, updatedAt: new Date() }).where(eq(user.id, session.user.id));
    result.locale = input.locale;
  }

  return dataResponse(result);
});