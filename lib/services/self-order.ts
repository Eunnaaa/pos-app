import { and, eq, inArray } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import {
  branches,
  categories,
  diningTables,
  organizations,
  platformSettings,
  productVariants,
  products,
  qrOrderTokens,
  salesOrderItems,
  salesOrders,
  salesPayments,
  kitchenTickets,
  kitchenTicketItems,
  warehouses,
} from "@/db/schema";
import { AppError } from "@/lib/server";
import { transformImageUrl } from "@/lib/integrations/storage";
import { checkout, type CheckoutContext, type CheckoutInput } from "./checkout";
import {
  checkMidtransTransactionStatus,
  createMidtransPayment,
  createMidtransQRISCharge,
  createXenditPayment,
  type XenditPaymentMethod,
} from "@/lib/integrations/payments";
import { confirmOrderPayment } from "@/lib/services/order-confirmation";
import { injectAmountToQris } from "@/lib/qris";
import { decodeQrisFromDataUrl } from "@/lib/qris-server";
import { getServerEnv } from "@/config/env";

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

export async function createSelfOrder(params: {
  token: string;
  items: SelfOrderItemInput[];
  notes?: string;
  customerName?: string;
  paymentMethod: "qris" | "e_wallet";
}): Promise<{ order: { id: string; orderNumber: string; totalAmount: string; status: string }; payment: { provider: "xendit" | "midtrans"; chargeRequired: true } }> {
  const t = await resolveQrToken(params.token);

  // Default warehouse
  const [warehouse] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(eq(warehouses.organizationId, t.organizationId), eq(warehouses.branchId, t.branchId), eq(warehouses.isActive, true)))
    .limit(1);
  if (!warehouse) throw new AppError("NOT_FOUND", "Gudang cabang belum dikonfigurasi");

  const env = getServerEnv();

  const checkoutInput: CheckoutInput = {
    branchId: t.branchId,
    warehouseId: warehouse.id,
    cashSessionId: undefined,
    customerId: undefined,
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
        provider: env.MIDTRANS_SERVER_KEY ? "midtrans" : "xendit",
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
    payment: { provider: env.MIDTRANS_SERVER_KEY ? "midtrans" : "xendit", chargeRequired: true },
  };
}

export async function createXenditCharge(orderId: string, options?: { customerName?: string; paymentMethods?: readonly XenditPaymentMethod[] }) {
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

  const [tokenRow] = order.tableId
    ? await db
        .select({ token: qrOrderTokens.token })
        .from(qrOrderTokens)
        .where(and(eq(qrOrderTokens.tableId, order.tableId), eq(qrOrderTokens.isActive, true)))
        .limit(1)
    : [null];
  const orderToken = tokenRow?.token;

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
  let bMeta: Record<string, unknown> = {};

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

    bMeta = (branchRow?.metadata as Record<string, unknown>) || {};
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

  // Fallback to Platform general QRIS if branch and org have no QRIS
  if (!baseQrisPayload && !baseQrisImageUrl) {
    const [platformConfigRow] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, "general_config"))
      .limit(1);
    const pConfig = (platformConfigRow?.value as Record<string, unknown>) || {};
    baseQrisImageUrl = String(pConfig.customQrisImageUrl || "");
    baseQrisPayload = String(pConfig.customQrisPayload || "");
    qrisAccountName = String(pConfig.qrisAccountName || org?.name || "Garzy Store");
    qrisInstructions = String(pConfig.qrisInstructions || "");
    if ((!baseQrisPayload || !baseQrisPayload.startsWith("000201")) && baseQrisImageUrl) {
      const decoded = decodeQrisFromDataUrl(baseQrisImageUrl);
      if (decoded && decoded.startsWith("000201")) {
        baseQrisPayload = decoded;
      }
    }
  }

  // Always generate dynamic branch QRIS with exact order total locked
  const orderAmt = Number(order.totalAmount);
  let rawPayload = baseQrisPayload;
  if (!rawPayload || !rawPayload.startsWith("000201")) {
    const cleanName = (qrisAccountName || org?.name || "Garzy Store").slice(0, 25).toUpperCase();
    const nameLen = cleanName.length.toString().padStart(2, "0");
    rawPayload = `00020101021126510011ID.DANA.WWW0118936009153123456789021012345678905204581253033605802ID59${nameLen}${cleanName}6007JAKARTA6105123406304`;
  }
  const dynamicQris = injectAmountToQris(rawPayload, orderAmt);
  let dynamicQrImg = "";
  try {
    dynamicQrImg = await QRCode.toDataURL(dynamicQris, {
      width: 400,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  } catch {
    dynamicQrImg = baseQrisImageUrl;
  }

  branchQris = {
    qrString: dynamicQris,
    qrImageUrl: dynamicQrImg,
    accountName: qrisAccountName || org?.name || "Garzy Store",
    instructions: qrisInstructions || "Scan QRIS di atas via m-Banking atau e-Wallet dan selesaikan pembayaran.",
    amount: orderAmt,
    orderNumber: order.orderNumber,
  };

  const env = getServerEnv();
  const branchMidtransKey = String(bMeta.midtransServerKey || "").trim();
  const activeMidtransKey = branchMidtransKey || env.MIDTRANS_SERVER_KEY?.trim() || "";

  if (activeMidtransKey) {
    try {
      if (orderAmt >= 1000) {
        const midtransQris = await createMidtransQRISCharge({
          orderId: order.orderNumber,
          amount: orderAmt,
          description: `Self-order ${order.orderNumber}`,
          customerName: options?.customerName || "Customer",
          serverKey: activeMidtransKey,
        });

        if (midtransQris.qrString) {
          branchQris = {
            qrString: midtransQris.qrString,
            qrImageUrl: midtransQris.qrImageUrl || dynamicQrImg,
            accountName: qrisAccountName || org?.name || "Midtrans QRIS",
            instructions: "Scan QRIS di atas via m-Banking atau e-Wallet. Pembayaran otomatis diverifikasi sistem dan diteruskan ke dapur.",
            amount: orderAmt,
            orderNumber: order.orderNumber,
          };
        }
      }

      let snapPaymentUrl: string | null = null;
      if (orderAmt >= 1000) {
        try {
          const snapResult = await createMidtransPayment({
            reference: order.orderNumber,
            amount: orderAmt,
            customerName: options?.customerName || "Guest",
            description: `Self-order ${order.orderNumber}`,
            organizationSlug: org?.slug,
            serverKey: activeMidtransKey,
            successRedirectUrl: env.BETTER_AUTH_URL && orderToken ? `${env.BETTER_AUTH_URL}/order/${orderToken}?order_id=${order.id}` : undefined,
          });
          snapPaymentUrl = snapResult.paymentUrl ?? null;
        } catch {
          // Snap optional
        }
      }

      return {
        invoiceUrl: snapPaymentUrl,
        externalId: order.orderNumber,
        branchQris,
      };
    } catch {
      return {
        invoiceUrl: null,
        externalId: order.orderNumber,
        branchQris,
      };
    }
  }

  const result = await createXenditPayment({
    reference: order.orderNumber,
    amount: Number(order.totalAmount),
    customerName: options?.customerName || "Guest",
    description: `Self-order ${order.orderNumber}`,
    organizationSlug: org?.slug,
    paymentMethods: options?.paymentMethods,
  });

  return {
    invoiceUrl: result.paymentUrl ?? null,
    externalId: result.externalId,
    branchQris,
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

  // If order is pending, check live Midtrans transaction status!
  if (order.status === "pending") {
    let branchServerKey: string | undefined;
    if (order.branchId) {
      const [branchRow] = await db
        .select({ metadata: branches.metadata })
        .from(branches)
        .where(eq(branches.id, order.branchId))
        .limit(1);
      const bMeta = (branchRow?.metadata as Record<string, unknown>) || {};
      if (bMeta.midtransServerKey) branchServerKey = String(bMeta.midtransServerKey).trim();
    }

    const check = await checkMidtransTransactionStatus(order.orderNumber, branchServerKey);
    if (check.status === "settled") {
      await db.transaction(async (tx) => {
        await tx
          .update(salesPayments)
          .set({
            status: "settled",
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(salesPayments.orderId, order.id), inArray(salesPayments.status, ["authorized", "pending"])));

        await confirmOrderPayment(tx, {
          organizationId: order.organizationId,
          orderId: order.id,
          actorUserId: null,
        });
      });

      order.status = "paid";
    }
  }

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
