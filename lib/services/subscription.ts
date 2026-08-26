import { and, count, eq, gte, sql } from "drizzle-orm";
import { PLANS, PlanConfig, PlanFeatures, PlanId, TRIAL_DURATION_DAYS } from "@/config/plans";
import { db } from "@/db";
import {
  branches,
  products,
  salesOrders,
  subscriptions,
  tenantMembers,
  warehouses,
  type PlanTier,
  type SubscriptionStatus,
} from "@/db/schema";
import { AppError } from "@/lib/server";

export interface OrganizationPlanSummary {
  planId: PlanId;
  plan: PlanConfig;
  status: SubscriptionStatus;
  isTrial: boolean;
  trialDaysLeft: number;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  billingCycle: "monthly" | "yearly";
  usage: {
    monthlyOrders: number;
    maxMonthlyOrders: number;
    products: number;
    maxProducts: number;
    branches: number;
    maxBranches: number;
    members: number;
    maxMembers: number;
    warehouses: number;
    maxWarehouses: number;
    historyDays: number;
  };
  features: PlanFeatures;
}

export async function getOrCreateSubscription(organizationId: string) {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);

  if (existing) return existing;

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS);

  const [created] = await db
    .insert(subscriptions)
    .values({
      organizationId,
      plan: "free",
      status: "active",
      billingCycle: "monthly",
      trialEndsAt,
      currentPeriodStart: new Date(),
    })
    .returning();

  return created;
}

export async function getOrganizationPlan(organizationId: string): Promise<OrganizationPlanSummary> {
  const sub = await getOrCreateSubscription(organizationId);
  const now = new Date();

  let effectivePlanId: PlanId = (sub.plan as PlanId) || "free";
  let isTrial = false;
  let trialDaysLeft = 0;

  // Check if inside 14-day Pro trial for new free accounts
  if (sub.plan === "free" && sub.trialEndsAt && new Date(sub.trialEndsAt) > now) {
    const diffMs = new Date(sub.trialEndsAt).getTime() - now.getTime();
    trialDaysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (trialDaysLeft > 0) {
      isTrial = true;
      effectivePlanId = "pro"; // Grants Pro features during trial
    }
  }

  // Check if paid plan has expired
  if (sub.plan !== "free" && sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < now) {
    effectivePlanId = "free";
  }

  const planConfig = PLANS[effectivePlanId] || PLANS.free;

  // Calculate usage counts
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [[ordersCount], [productsCount], [branchesCount], [membersCount], [warehousesCount]] = await Promise.all([
    db
      .select({ count: count() })
      .from(salesOrders)
      .where(and(eq(salesOrders.organizationId, organizationId), gte(salesOrders.occurredAt, startOfMonth))),
    db
      .select({ count: count() })
      .from(products)
      .where(and(eq(products.organizationId, organizationId), eq(products.isActive, true))),
    db
      .select({ count: count() })
      .from(branches)
      .where(and(eq(branches.organizationId, organizationId), eq(branches.isActive, true))),
    db
      .select({ count: count() })
      .from(tenantMembers)
      .where(and(eq(tenantMembers.organizationId, organizationId), eq(tenantMembers.isActive, true))),
    db
      .select({ count: count() })
      .from(warehouses)
      .where(and(eq(warehouses.organizationId, organizationId), eq(warehouses.isActive, true))),
  ]);

  return {
    planId: effectivePlanId,
    plan: planConfig,
    status: sub.status,
    isTrial,
    trialDaysLeft,
    trialEndsAt: sub.trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd,
    billingCycle: sub.billingCycle,
    usage: {
      monthlyOrders: Number(ordersCount?.count ?? 0),
      maxMonthlyOrders: planConfig.limits.maxMonthlyOrders,
      products: Number(productsCount?.count ?? 0),
      maxProducts: planConfig.limits.maxProducts,
      branches: Number(branchesCount?.count ?? 0),
      maxBranches: planConfig.limits.maxBranches,
      members: Number(membersCount?.count ?? 0),
      maxMembers: planConfig.limits.maxMembers,
      warehouses: Number(warehousesCount?.count ?? 0),
      maxWarehouses: planConfig.limits.maxWarehouses,
      historyDays: planConfig.limits.historyDays,
    },
    features: planConfig.features,
  };
}

export async function assertCanCreateOrder(organizationId: string): Promise<void> {
  const { plan, usage } = await getOrganizationPlan(organizationId);
  if (usage.monthlyOrders >= plan.limits.maxMonthlyOrders) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      `Batas kuota transaksi ${plan.name} (${plan.limits.maxMonthlyOrders} transaksi/bulan) telah tercapai. Upgrade ke paket Pro untuk transaksi tanpa batas.`,
    );
  }
}

export async function assertCanCreateProduct(organizationId: string): Promise<void> {
  const { plan, usage } = await getOrganizationPlan(organizationId);
  if (usage.products >= plan.limits.maxProducts) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      `Batas katalog produk untuk paket ${plan.name} (${plan.limits.maxProducts} produk) telah tercapai. Upgrade ke paket Pro untuk menambah produk tanpa batas.`,
    );
  }
}

export async function assertCanCreateBranch(organizationId: string): Promise<void> {
  const { plan, usage } = await getOrganizationPlan(organizationId);
  if (usage.branches >= plan.limits.maxBranches) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      `Batas cabang untuk paket ${plan.name} (${plan.limits.maxBranches} cabang) telah tercapai. Upgrade ke paket Business untuk mengelola hingga 5 cabang.`,
    );
  }
}

export async function assertCanCreateMember(organizationId: string): Promise<void> {
  const { plan, usage } = await getOrganizationPlan(organizationId);
  if (usage.members >= plan.limits.maxMembers) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      `Paket Starter (Free) dibatasi 1 akun. Upgrade ke Pro untuk menambah staf kasir tanpa batas dengan hak akses terpisah.`,
    );
  }
}

export async function assertFeatureEnabled(
  organizationId: string,
  feature: keyof PlanFeatures,
  featureName = "Fitur ini",
): Promise<void> {
  const { plan } = await getOrganizationPlan(organizationId);
  if (!plan.features[feature]) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      `${featureName} hanya tersedia untuk pelanggan paket Pro ke atas. Silakan upgrade paket bisnis Anda.`,
    );
  }
}

export async function upgradeSubscription(
  organizationId: string,
  input: {
    plan: PlanTier;
    billingCycle: "monthly" | "yearly";
    paymentProvider?: string;
    externalSubscriptionId?: string;
  },
) {
  const now = new Date();
  const currentPeriodEnd = new Date();
  if (input.billingCycle === "yearly") {
    currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
  } else {
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);
  }

  const [updated] = await db
    .insert(subscriptions)
    .values({
      organizationId,
      plan: input.plan,
      status: "active",
      billingCycle: input.billingCycle,
      currentPeriodStart: now,
      currentPeriodEnd,
      paymentProvider: input.paymentProvider || "midtrans",
      externalSubscriptionId: input.externalSubscriptionId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [subscriptions.organizationId],
      set: {
        plan: input.plan,
        status: "active",
        billingCycle: input.billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd,
        paymentProvider: input.paymentProvider || "midtrans",
        externalSubscriptionId: input.externalSubscriptionId,
        updatedAt: now,
      },
    })
    .returning();

  return updated;
}
