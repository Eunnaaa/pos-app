import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { branches, platformSettings } from "@/db/schema";
import { getServerEnv } from "@/config/env";
import { decryptSecret } from "@/lib/server/secrets";

/** Use the same credential for creating a charge and validating its webhook. */
export async function resolveMidtransServerKey(branchId?: string | null): Promise<string> {
  if (branchId) {
    const [branch] = await db.select({ metadata: branches.metadata })
      .from(branches).where(eq(branches.id, branchId)).limit(1);
    const metadata = (branch?.metadata ?? {}) as Record<string, unknown>;
    const branchKey = decryptSecret(metadata.midtransServerKey).trim();
    if (branchKey) return branchKey;
  }
  const [settings] = await db.select({ value: platformSettings.value })
    .from(platformSettings).where(eq(platformSettings.key, "general_config")).limit(1);
  const metadata = (settings?.value ?? {}) as Record<string, unknown>;
  return decryptSecret(metadata.midtransServerKey || getServerEnv().MIDTRANS_SERVER_KEY || "").trim();
}
