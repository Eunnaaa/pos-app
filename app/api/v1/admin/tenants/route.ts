import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  branches,
  organizations,
  products,
  salesOrders,
  subscriptions,
  tenantMembers,
  user,
} from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { AppError, requireSession } from "@/lib/server";
import { isSuperAdminEmail } from "@/lib/super-admin";

export const GET = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminEmail(session.user.email)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Master Admin platform yang dapat mengelola daftar tenant");
  }

  // Get all organizations with their subscription, member owner, and counts
  const orgList = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      email: organizations.email,
      phone: organizations.phone,
      isActive: organizations.isActive,
      createdAt: organizations.createdAt,
      plan: subscriptions.plan,
      subscriptionStatus: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      billingCycle: subscriptions.billingCycle,
    })
    .from(organizations)
    .leftJoin(subscriptions, eq(organizations.id, subscriptions.organizationId))
    .orderBy(desc(organizations.createdAt));

  // Fetch branch counts & product counts per organization
  const [branchCounts, productCounts] = await Promise.all([
    db
      .select({
        organizationId: branches.organizationId,
        count: sql<number>`count(*)::int`,
      })
      .from(branches)
      .groupBy(branches.organizationId),
    db
      .select({
        organizationId: products.organizationId,
        count: sql<number>`count(*)::int`,
      })
      .from(products)
      .groupBy(products.organizationId),
  ]);

  const branchMap = new Map(branchCounts.map((b) => [b.organizationId, b.count]));
  const productMap = new Map(productCounts.map((p) => [p.organizationId, p.count]));

  const now = new Date();
  const tenants = orgList.map((org) => {
    let effectivePlan = org.plan || "free";
    let isTrial = false;
    let trialDaysLeft = 0;

    if (org.plan === "free" && org.trialEndsAt && new Date(org.trialEndsAt) > now) {
      isTrial = true;
      trialDaysLeft = Math.max(0, Math.ceil((new Date(org.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      effectivePlan = "pro";
    }

    return {
      ...org,
      effectivePlan,
      isTrial,
      trialDaysLeft,
      branchesCount: branchMap.get(org.id) ?? 0,
      productsCount: productMap.get(org.id) ?? 0,
    };
  });

  return dataResponse({
    tenants,
    total: tenants.length,
  });
});
