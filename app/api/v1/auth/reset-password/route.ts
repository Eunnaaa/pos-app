import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { account, user } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { auth } from "@/lib/auth";
import { AppError, parseJson } from "@/lib/server";

const resetPasswordSchema = z.object({
  email: z.string().email(),
  newPassword: z.string().min(12, "Password baru minimal 12 karakter"),
});

export const POST = apiHandler(async (request) => {
  const input = await parseJson(request, resetPasswordSchema);

  // Find user by email
  const [foundUser] = await db
    .select()
    .from(user)
    .where(eq(user.email, input.email.toLowerCase().trim()))
    .limit(1);

  if (!foundUser) {
    throw new AppError("NOT_FOUND", "Alamat email tidak terdaftar dalam sistem");
  }

  // Hash new password using Better-Auth
  const ctx = await auth.$context;
  const hashedPassword = await ctx.password.hash(input.newPassword);

  // Check if credential account exists
  const [acc] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, foundUser.id), eq(account.providerId, "credential")))
    .limit(1);

  if (acc) {
    await db
      .update(account)
      .set({
        password: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(account.id, acc.id));
  } else {
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: foundUser.id,
      providerId: "credential",
      userId: foundUser.id,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return dataResponse({
    success: true,
    message: "Kata sandi berhasil diperbarui. Silakan masuk menggunakan kata sandi baru Anda.",
  });
});
