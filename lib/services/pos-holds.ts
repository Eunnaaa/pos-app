import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import { heldOrders } from "@/db/schema";
import { AppError } from "@/lib/server";

export interface CartItem {
  variantId: string;
  quantity: number;
  unitPrice: string;
  notes?: string;
}

export interface HeldOrderData {
  items: CartItem[];
  customerId?: string;
  orderNotes?: string;
  discountAmount?: string;
}

export interface HeldOrder {
  id: string;
  organizationId: string;
  branchId: string;
  createdBy: string;
  status: "held" | "resumed" | "expired" | "discarded";
  cartData: HeldOrderData;
  createdAt: string;
  expiresAt: string;
  resumedAt: string | null;
}

const HOLD_EXPIRY_HOURS = 24;
const MAX_HELD_ORDERS_PER_USER = 20;

export async function holdOrder(
  organizationId: string,
  branchId: string,
  userId: string,
  cartData: HeldOrderData,
): Promise<HeldOrder> {
  // Validate cart has items
  if (!cartData.items || cartData.items.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Cannot hold empty cart");
  }

  // Check current held orders count
  const currentHeld = await db
    .select({ id: heldOrders.id })
    .from(heldOrders)
    .where(
      and(
        eq(heldOrders.organizationId, organizationId),
        eq(heldOrders.createdBy, userId),
        eq(heldOrders.status, "held"),
      ),
    );

  if (currentHeld.length >= MAX_HELD_ORDERS_PER_USER) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Maximum ${MAX_HELD_ORDERS_PER_USER} held orders allowed per user`,
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + HOLD_EXPIRY_HOURS * 60 * 60 * 1000);

  const [result] = await db
    .insert(heldOrders)
    .values({
      organizationId,
      branchId,
      createdBy: userId,
      status: "held",
      cartData,
      expiresAt,
    })
    .returning();

  if (!result) throw new AppError("INTERNAL_ERROR", "Failed to hold order");

  return {
    id: result.id,
    organizationId: result.organizationId,
    branchId: result.branchId,
    createdBy: result.createdBy,
    status: result.status as "held" | "resumed" | "expired" | "discarded",
    cartData: result.cartData as HeldOrderData,
    createdAt: result.createdAt.toISOString(),
    expiresAt: result.expiresAt.toISOString(),
    resumedAt: result.resumedAt?.toISOString() || null,
  };
}

export async function listHeldOrders(
  organizationId: string,
  branchId: string,
  userId: string,
): Promise<HeldOrder[]> {
  const now = new Date();

  const results = await db
    .select()
    .from(heldOrders)
    .where(
      and(
        eq(heldOrders.organizationId, organizationId),
        eq(heldOrders.branchId, branchId),
        eq(heldOrders.createdBy, userId),
        eq(heldOrders.status, "held"),
        gt(heldOrders.expiresAt, now),
      ),
    )
    .orderBy((t) => t.createdAt);

  return results.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    branchId: r.branchId,
    createdBy: r.createdBy,
    status: r.status as "held" | "resumed" | "expired" | "discarded",
    cartData: r.cartData as HeldOrderData,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    resumedAt: r.resumedAt?.toISOString() || null,
  }));
}

export async function resumeHeldOrder(
  organizationId: string,
  heldOrderId: string,
  userId: string,
): Promise<HeldOrder> {
  const [held] = await db
    .select()
    .from(heldOrders)
    .where(
      and(
        eq(heldOrders.id, heldOrderId),
        eq(heldOrders.organizationId, organizationId),
        eq(heldOrders.createdBy, userId),
        eq(heldOrders.status, "held"),
      ),
    )
    .limit(1);

  if (!held) {
    throw new AppError("NOT_FOUND", "Held order not found or already resumed");
  }

  const now = new Date();
  if (held.expiresAt < now) {
    throw new AppError("CONFLICT", "Held order has expired");
  }

  const [result] = await db
    .update(heldOrders)
    .set({
      status: "resumed",
      resumedAt: now,
    })
    .where(eq(heldOrders.id, heldOrderId))
    .returning();

  if (!result) throw new AppError("INTERNAL_ERROR", "Failed to resume held order");

  return {
    id: result.id,
    organizationId: result.organizationId,
    branchId: result.branchId,
    createdBy: result.createdBy,
    status: result.status as "held" | "resumed" | "expired" | "discarded",
    cartData: result.cartData as HeldOrderData,
    createdAt: result.createdAt.toISOString(),
    expiresAt: result.expiresAt.toISOString(),
    resumedAt: result.resumedAt?.toISOString() || null,
  };
}

export async function discardHeldOrder(
  organizationId: string,
  heldOrderId: string,
  userId: string,
): Promise<void> {
  const [held] = await db
    .select()
    .from(heldOrders)
    .where(
      and(
        eq(heldOrders.id, heldOrderId),
        eq(heldOrders.organizationId, organizationId),
        eq(heldOrders.createdBy, userId),
      ),
    )
    .limit(1);

  if (!held) {
    throw new AppError("NOT_FOUND", "Held order not found");
  }

  await db
    .update(heldOrders)
    .set({
      status: "discarded",
    })
    .where(eq(heldOrders.id, heldOrderId));
}

export async function cleanupExpiredHeldOrders(organizationId: string): Promise<number> {
  const now = new Date();

  const result = await db
    .update(heldOrders)
    .set({
      status: "expired",
    })
    .where(
      and(
        eq(heldOrders.organizationId, organizationId),
        eq(heldOrders.status, "held"),
        lte(heldOrders.expiresAt, now),
      ),
    );

  return result.rowCount || 0;
}

export async function cleanupAllExpiredHeldOrders(): Promise<number> {
  const now = new Date();
  const result = await db
    .update(heldOrders)
    .set({ status: "expired" })
    .where(and(eq(heldOrders.status, "held"), lte(heldOrders.expiresAt, now)));
  return result.rowCount || 0;
}
