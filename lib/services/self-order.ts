import { and, eq, inArray } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import {
  categories,
  branches,
  customers,
  diningTables,
  organizations,
  productVariants,
  products,
  qrOrderTokens,
  salesOrderItems,
  salesOrders,
  salesPayments,
  kitchenTickets,
  kitchenTicketItems,
  platformSettings,
  warehouses,
} from "@/db/schema";
import { AppError, decryptSecret } from "@/lib/server";
import { transformImageUrl } from "@/lib/integrations/storage";
import { createMidtransPayment } from "@/lib/integrations/payments";
import { getServerEnv } from "@/config/env";
import { checkout, type CheckoutContext, type CheckoutInput } from "./checkout";
import { injectAmountToQris } from "@/lib/qris";
import { decodeQrisFromDataUrl } from "@/lib/qris-server";

export type SelfOrderMenuItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    priceAmount: bigint;
    available: boolean;
  }>;
};

export type SelfOrderMenuCategory = {
  id: string;
  name: string;
  slug: string;
  products: SelfOrderMenuItem[];
};

export type SelfOrderMenu = {
  organization: { id: string; name: string; defaultCurrency: string };
  table: { id: string; name: string; area: string | null };
  categories: SelfOrderMenuCategory[];
};

export async function resolveQrToken(token: string) {
  const [row] = await db
    .select({
      id: qrOrderTokens.id,
      organizationId: qrOrderTokens.organizationId,
      branchId: qrOrderTokens.branchId,
      tableId: qrOrderTokens.tableId,
      tableName: diningTables.name,
      tableArea: diningTables.area,
      expiresAt: qrOrderTokens.expiresAt,
      orgName: organizations.name,
      defaultCurrency: organizations.defaultCurrency,
    })
    .from(qrOrderTokens)
    .innerJoin(diningTables, eq(diningTables.id, qrOrderTokens.tableId))
    .innerJoin(organizations, eq(organizations.id, qrOrderTokens.organizationId))
    .where(and(eq(qrOrderTokens.token, token), eq(qrOrderTokens.isActive, true)))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Token self-order tidak ditemukan");
  if (row.expiresAt && row.expiresAt <= new Date()) {
    throw new AppError("CONFLICT", "Token self-order telah kedaluwarsa");
  }
  return row;
}

type MenuRow = {
  productId: string;
  productName: string;
  productDescription: string | null;
  productImageUrl: string | null;
  productMetadata: Record<string, unknown> | null;
  categoryId: string | null;
  variantId: string;
  variantName: string;
  variantSku: string;
  variantPriceAmount: bigint;
  categoryIdFull: string | null;
  categoryName: string | null;
  categorySlug: string | null;
};

export async function getMenu(token: string): Promise<SelfOrderMenu> {
  const t = await resolveQrToken(token);

  // Default warehouse untuk cabang (diambil satu untuk filter stok)
  const [warehouse] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(eq(warehouses.organizationId, t.organizationId), eq(warehouses.branchId, t.branchId), eq(warehouses.isActive, true)))
    .limit(1);
  if (!warehouse) throw new AppError("NOT_FOUND", "Gudang cabang belum dikonfigurasi");

  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      productDescription: products.description,
      productImageUrl: products.imageUrl,
      productMetadata: products.metadata,
      categoryId: products.categoryId,
      variantId: productVariants.id,
      variantName: productVariants.name,
      variantSku: productVariants.sku,
      variantPriceAmount: productVariants.priceAmount,
      categoryIdFull: categories.id,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(
      eq(products.organizationId, t.organizationId),
      eq(products.isActive, true),
      eq(productVariants.isActive, true),
    ));

  // Tampilkan produk aktif secara default untuk self-order (kecuali jika secara eksplisit diset availableForSelfOrder === false)
  const filtered = (rows as Array<MenuRow & { productMetadata: Record<string, unknown> | null }>).filter(
    (r) => r.productMetadata?.availableForSelfOrder !== false
  );

  const categoriesMap = new Map<string, SelfOrderMenuCategory>();
  const productsMap = new Map<string, SelfOrderMenuItem>();

  for (const row of filtered) {
    const catId = row.categoryIdFull ?? "uncategorized";
    if (!categoriesMap.has(catId)) {
      categoriesMap.set(catId, {
        id: catId,
        name: row.categoryName ?? "Lainnya",
        slug: row.categorySlug ?? "lainnya",
        products: [],
      });
    }
    if (!productsMap.has(row.productId)) {
      const imageUrl = row.productImageUrl ? transformImageUrl(row.productImageUrl, { width: 300, quality: 80 }) : null;
      productsMap.set(row.productId, {
        id: row.productId,
        name: row.productName,
        description: row.productDescription,
        imageUrl,
        categoryId: row.categoryId,
        variants: [],
      });
      categoriesMap.get(catId)!.products.push(productsMap.get(row.productId)!);
    }
    productsMap.get(row.productId)!.variants.push({
      id: row.variantId,
      name: row.variantName,
      sku: row.variantSku,
      priceAmount: row.variantPriceAmount,
      available: true,
    });
  }

  return {
    organization: { id: t.organizationId, name: t.orgName, defaultCurrency: t.defaultCurrency },
    table: { id: t.tableId, name: t.tableName, area: t.tableArea },
    categories: [...categoriesMap.values()],
  };
}

export type SelfOrderItemInput = {
  variantId: string;
  quantity: number;
  notes?: string;
};

function normalizeCustomerPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) return `+62${digits.slice(1)}`;
  if (digits.startsWith("62")) return `+${digits}`;
  return `+${digits}`;
}

async function resolveSelfOrderCustomer(organizationId: string, name?: string, phone?: string) {
  if (!phone?.trim()) return undefined;
  const normalizedPhone = normalizeCustomerPhone(phone);
  if (normalizedPhone.length < 10) throw new AppError("VALIDATION_ERROR", "Nomor WhatsApp tidak valid");

  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.organizationId, organizationId), eq(customers.phone, normalizedPhone)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(customers)
    .values({
      organizationId,
      code: `SO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      name: name?.trim() || `Pelanggan ${normalizedPhone.slice(-4)}`,
      phone: normalizedPhone,
      metadata: { source: "self_order" },
    })
    .returning({ id: customers.id });
  return created.id;
}

export async function createSelfOrder(params: {
  token: string;
  items: SelfOrderItemInput[];
  notes?: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: "qris" | "e_wallet";
}): Promise<{ order: { id: string; orderNumber: string; totalAmount: string; status: string }; payment: { provider: "qris_direct"; chargeRequired: true } }> {
  const t = await resolveQrToken(params.token);

  // Default warehouse
  const [warehouse] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(eq(warehouses.organizationId, t.organizationId), eq(warehouses.branchId, t.branchId), eq(warehouses.isActive, true)))
    .limit(1);
  if (!warehouse) throw new AppError("NOT_FOUND", "Gudang cabang belum dikonfigurasi");
  const customerId = await resolveSelfOrderCustomer(t.organizationId, params.customerName, params.customerPhone);

  const checkoutInput: CheckoutInput = {
    branchId: t.branchId,
    warehouseId: warehouse.id,
    cashSessionId: undefined,
    customerId,
    type: "sale",
    status: "pending",
    channel: "self_order",
    tableId: t.tableId,
    notes: params.notes,
    discountAmount: 0n,
    serviceChargeAmount: 0n,
    items: params.items.map((i) => ({
      variantId: i.variantId,
      quantity: BigInt(i.quantity),
      discountAmount: 0n,
      ...(i.notes ? { notes: i.notes } : {}),
    })),
    payments: [
      {
        method: params.paymentMethod,
        amount: 0n,
        provider: "qris_direct",
      },
    ],
  };

  const context: CheckoutContext = {
    organizationId: t.organizationId,
    requestId: crypto.randomUUID(),
    actorUserId: null,
  };

  const result = await checkout(checkoutInput, context);

  // Hanya buat Tiket Dapur jika pesanan sudah dibayar/dikonfirmasi (jangan buat untuk order pending)
  if (result.order.status === "paid" || result.order.status === "confirmed") {
    const [existingTicket] = await db
      .select({ id: kitchenTickets.id })
      .from(kitchenTickets)
      .where(eq(kitchenTickets.orderId, result.order.id))
      .limit(1);

    if (!existingTicket) {
      const orderItems = await db
        .select({ id: salesOrderItems.id, notes: salesOrderItems.notes })
        .from(salesOrderItems)
        .where(eq(salesOrderItems.orderId, result.order.id));

      if (orderItems.length > 0) {
        const ticketId = crypto.randomUUID();
        const ticketNumber = `KT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${ticketId.slice(0, 8).toUpperCase()}`;

        await db.insert(kitchenTickets).values({
          id: ticketId,
          organizationId: t.organizationId,
          branchId: t.branchId,
          orderId: result.order.id,
          number: ticketNumber,
          status: "queued",
          priority: 0,
        });

        await db.insert(kitchenTicketItems).values(
          orderItems.map((item) => ({
            organizationId: t.organizationId,
            ticketId,
            orderItemId: item.id,
            status: "queued" as const,
            notes: item.notes,
          })),
        );
      }
    }
  }

  return {
    order: {
      id: result.order.id,
      orderNumber: result.order.orderNumber,
      totalAmount: result.order.totalAmount?.toString() ?? "0",
      status: result.order.status ?? "pending",
    },
    payment: { provider: "qris_direct", chargeRequired: true },
  };
}

export async function createDirectQrisCharge(orderId: string) {
  const [order] = await db
    .select({
      id: salesOrders.id,
      orderNumber: salesOrders.orderNumber,
      totalAmount: salesOrders.totalAmount,
      organizationId: salesOrders.organizationId,
      branchId: salesOrders.branchId,
      tableId: salesOrders.tableId,
    })
    .from(salesOrders)
    .where(eq(salesOrders.id, orderId))
    .limit(1);
  if (!order) throw new AppError("NOT_FOUND", "Order tidak ditemukan");
  if (!order.totalAmount) throw new AppError("CONFLICT", "Order tidak memiliki total");

  const [org] = await db
    .select({ slug: organizations.slug, name: organizations.name, metadata: organizations.metadata })
    .from(organizations)
    .where(eq(organizations.id, order.organizationId))
    .limit(1);

  // 1. Resolve Branch QRIS or fallback to Organization QRIS
  let branchQris: {
    qrString?: string;
    qrImageUrl?: string;
    accountName?: string;
    instructions?: string;
    amount?: number;
    orderNumber?: string;
  } | null = null;

  let baseQrisPayload = "";
  let baseQrisImageUrl = "";
  let qrisAccountName = "";
  let qrisInstructions = "";
  if (order.branchId) {
    const [branchRow] = await db
      .select({
        id: branches.id,
        name: branches.name,
        metadata: branches.metadata,
      })
      .from(branches)
      .where(eq(branches.id, order.branchId))
      .limit(1);

    const bMeta = (branchRow?.metadata as Record<string, unknown>) || {};
    baseQrisImageUrl = String(bMeta.qrisImageUrl || "");
    baseQrisPayload = String(bMeta.qrisPayload || "");
    qrisAccountName = String(bMeta.qrisAccountName || branchRow?.name || "");
    qrisInstructions = String(bMeta.qrisInstructions || "");

    if ((!baseQrisPayload || !baseQrisPayload.startsWith("000201")) && baseQrisImageUrl) {
      const decoded = decodeQrisFromDataUrl(baseQrisImageUrl);
      if (decoded && decoded.startsWith("000201")) {
        baseQrisPayload = decoded;
      }
    }
  }

  // Fallback to Org metadata if branch has no QRIS
  if (!baseQrisPayload && !baseQrisImageUrl && org) {
    const orgMeta = (org.metadata as Record<string, unknown>) || {};
    baseQrisImageUrl = String(orgMeta.qrisImageUrl || "");
    baseQrisPayload = String(orgMeta.qrisPayload || "");
    qrisAccountName = String(orgMeta.qrisAccountName || org.name || "Kedai-Ku");
    qrisInstructions = String(orgMeta.qrisInstructions || "");
    if ((!baseQrisPayload || !baseQrisPayload.startsWith("000201")) && baseQrisImageUrl) {
      const decoded = decodeQrisFromDataUrl(baseQrisImageUrl);
      if (decoded && decoded.startsWith("000201")) {
        baseQrisPayload = decoded;
      }
    }
  }

  // Generate QRIS with the exact order total. Never fabricate merchant identifiers:
  // a missing merchant payload must be fixed in branch/organization settings.
  const orderAmt = Number(order.totalAmount);
  if (!baseQrisPayload || !baseQrisPayload.startsWith("000201")) {
    throw new AppError("CONFLICT", "Payload QRIS merchant cabang belum dikonfigurasi atau tidak valid");
  }
  const dynamicQris = injectAmountToQris(baseQrisPayload, orderAmt);
  let dynamicQrImg = "";
  try {
    dynamicQrImg = await QRCode.toDataURL(dynamicQris, {
      width: 400,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  } catch {
    throw new AppError("INTERNAL_ERROR", "QRIS dinamis gagal dibuat. Silakan coba kembali");
  }

  branchQris = {
    qrString: dynamicQris,
    qrImageUrl: dynamicQrImg,
    accountName: qrisAccountName || org?.name || "Kedai-Ku",
    instructions: qrisInstructions || "Scan QRIS di atas via m-Banking atau e-Wallet dan selesaikan pembayaran.",
    amount: orderAmt,
    orderNumber: order.orderNumber,
  };

  let invoiceUrl: string | null = null;
  const env = getServerEnv();
  const [platformSettingsRow] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, "general_config"))
    .limit(1);
  const platformConfig = (platformSettingsRow?.value as Record<string, unknown>) || {};
  const serverKey = decryptSecret(platformConfig.midtransServerKey || env.MIDTRANS_SERVER_KEY || "");
  if (serverKey) {
    try {
      const payment = await createMidtransPayment({
        reference: order.orderNumber,
        amount: orderAmt,
        description: `Self Order ${order.orderNumber}`,
        customerName: "Guest Table Customer",
        serverKey,
      });
      invoiceUrl = payment.paymentUrl ?? null;
    } catch {
      // QRIS merchant tetap dapat digunakan jika Snap belum tersedia.
    }
  }

  return {
    invoiceUrl,
    externalId: order.orderNumber,
    branchQris,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

export async function getOrderStatus(orderId: string) {
  const [order] = await db
    .select({
      id: salesOrders.id,
      organizationId: salesOrders.organizationId,
      branchId: salesOrders.branchId,
      orderNumber: salesOrders.orderNumber,
      status: salesOrders.status,
      totalAmount: salesOrders.totalAmount,
      tableId: salesOrders.tableId,
      occurredAt: salesOrders.occurredAt,
      completedAt: salesOrders.completedAt,
    })
    .from(salesOrders)
    .where(eq(salesOrders.id, orderId))
    .limit(1);
  if (!order) throw new AppError("NOT_FOUND", "Order tidak ditemukan");

  const [ticket] = await db
    .select({
      id: kitchenTickets.id,
      status: kitchenTickets.status,
      startedAt: kitchenTickets.startedAt,
      readyAt: kitchenTickets.readyAt,
      servedAt: kitchenTickets.servedAt,
    })
    .from(kitchenTickets)
    .where(eq(kitchenTickets.orderId, orderId))
    .limit(1);

  const payments = await db
    .select({ method: salesPayments.method, status: salesPayments.status, amount: salesPayments.amount })
    .from(salesPayments)
    .where(eq(salesPayments.orderId, orderId));

  const items = await db
    .select({
      id: salesOrderItems.id,
      itemName: salesOrderItems.itemName,
      quantity: salesOrderItems.quantity,
      totalAmount: salesOrderItems.totalAmount,
      notes: salesOrderItems.notes,
    })
    .from(salesOrderItems)
    .where(eq(salesOrderItems.orderId, orderId));

  return {
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: order.totalAmount?.toString() ?? "0",
      occurredAt: order.occurredAt.toISOString(),
      completedAt: order.completedAt?.toISOString() ?? null,
    },
    kitchenTicket: ticket
      ? {
          status: ticket.status,
          startedAt: ticket.startedAt?.toISOString() ?? null,
          readyAt: ticket.readyAt?.toISOString() ?? null,
          servedAt: ticket.servedAt?.toISOString() ?? null,
        }
      : null,
    payments: payments.map((p) => ({ method: p.method, status: p.status, amount: p.amount?.toString() ?? "0" })),
    items: items.map((i) => ({
      id: i.id,
      name: i.itemName,
      quantity: i.quantity?.toString() ?? "0",
      totalAmount: i.totalAmount?.toString() ?? "0",
      notes: i.notes,
    })),
  };
}

export async function getTableBillSplit(tableId: string) {
  const orders = await db
    .select({
      id: salesOrders.id,
      orderNumber: salesOrders.orderNumber,
      parentOrderId: salesOrders.parentOrderId,
      status: salesOrders.status,
      totalAmount: salesOrders.totalAmount,
      occurredAt: salesOrders.occurredAt,
    })
    .from(salesOrders)
    .where(and(eq(salesOrders.tableId, tableId), inArray(salesOrders.status, ["pending", "confirmed", "paid"])))
    .orderBy(salesOrders.occurredAt);

  return {
    tableId,
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      parentOrderId: o.parentOrderId,
      status: o.status,
      totalAmount: o.totalAmount?.toString() ?? "0",
      occurredAt: o.occurredAt.toISOString(),
    })),
  };
}

export async function reorder(params: {
  token: string;
  parentOrderId: string;
  items: SelfOrderItemInput[];
  notes?: string;
  paymentMethod: "qris" | "e_wallet";
}) {
  const t = await resolveQrToken(params.token);

  // Parent order harus milik meja yang sama & sudah paid
  const [parent] = await db
    .select({ id: salesOrders.id, status: salesOrders.status, tableId: salesOrders.tableId })
    .from(salesOrders)
    .where(and(eq(salesOrders.id, params.parentOrderId), eq(salesOrders.organizationId, t.organizationId)))
    .limit(1);
  if (!parent) throw new AppError("NOT_FOUND", "Order induk tidak ditemukan");
  if (parent.status !== "paid") throw new AppError("CONFLICT", "Order induk belum lunas");
  if (parent.tableId && parent.tableId !== t.tableId) throw new AppError("FORBIDDEN", "Order bukan milik meja token ini");

  // Buat order baru dengan parentOrderId untuk billing terpisah
  const base = await createSelfOrder({ token: params.token, items: params.items, notes: params.notes, paymentMethod: params.paymentMethod });
  await db.update(salesOrders).set({ parentOrderId: params.parentOrderId, updatedAt: new Date() }).where(eq(salesOrders.orderNumber, base.order.orderNumber));
  return base;
}
