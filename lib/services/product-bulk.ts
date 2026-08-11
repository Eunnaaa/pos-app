import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { products, productVariants } from "@/db/schema";
import { AppError } from "@/lib/server";

export interface BulkUpdatePayload {
  productIds: string[];
  updates: {
    name?: string;
    categoryId?: string;
    brandId?: string;
    isActive?: boolean;
  };
}

export interface BulkPriceUpdatePayload {
  variantIds: string[];
  priceUpdate: {
    type: "fixed" | "percentage";
    value: string; // amount or percentage as string
  };
}

export interface BulkDeletePayload {
  productIds: string[];
}

export async function bulkUpdateProducts(
  organizationId: string,
  payload: BulkUpdatePayload,
): Promise<{ updated: number }> {
  if (!payload.productIds || payload.productIds.length === 0) {
    throw new AppError("VALIDATION_ERROR", "No products selected");
  }

  if (!payload.updates || Object.keys(payload.updates).length === 0) {
    throw new AppError("VALIDATION_ERROR", "No fields to update");
  }

  // Verify all products belong to organization
  const productsToUpdate = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(eq(products.organizationId, organizationId), inArray(products.id, payload.productIds)),
    );

  if (productsToUpdate.length !== payload.productIds.length) {
    throw new AppError("VALIDATION_ERROR", "Some products not found or not accessible");
  }

  const result = await db
    .update(products)
    .set(payload.updates)
    .where(and(eq(products.organizationId, organizationId), inArray(products.id, payload.productIds)));

  return { updated: result.rowCount || 0 };
}

export async function bulkUpdateVariantPrices(
  organizationId: string,
  payload: BulkPriceUpdatePayload,
): Promise<{ updated: number }> {
  if (!payload.variantIds || payload.variantIds.length === 0) {
    throw new AppError("VALIDATION_ERROR", "No variants selected");
  }

  // Verify all variants belong to organization
  const variantsToUpdate = await db
    .select({ id: productVariants.id, priceAmount: productVariants.priceAmount })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        inArray(productVariants.id, payload.variantIds),
      ),
    );

  if (variantsToUpdate.length !== payload.variantIds.length) {
    throw new AppError("VALIDATION_ERROR", "Some variants not found or not accessible");
  }

  // Calculate new prices
  const updateValue =
    payload.priceUpdate.type === "fixed"
      ? BigInt(payload.priceUpdate.value)
      : null;

  if (payload.priceUpdate.type === "percentage") {
    // Update each variant individually with percentage calculation
    for (const variant of variantsToUpdate) {
      const currentPrice = BigInt(variant.priceAmount || "0");
      const percentage = BigInt(payload.priceUpdate.value);
      const newPrice = currentPrice + (currentPrice * percentage) / 100n;

      await db
        .update(productVariants)
        .set({ priceAmount: newPrice })
        .where(eq(productVariants.id, variant.id));
    }
  } else if (updateValue !== null) {
    // Fixed amount
    await db
      .update(productVariants)
      .set({ priceAmount: updateValue })
      .where(
        and(
          eq(productVariants.organizationId, organizationId),
          inArray(productVariants.id, payload.variantIds),
        ),
      );
  }

  return { updated: variantsToUpdate.length };
}

export async function bulkDeleteProducts(
  organizationId: string,
  payload: BulkDeletePayload,
): Promise<{ deleted: number }> {
  if (!payload.productIds || payload.productIds.length === 0) {
    throw new AppError("VALIDATION_ERROR", "No products selected");
  }

  // Verify all products belong to organization
  const productsToDelete = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(eq(products.organizationId, organizationId), inArray(products.id, payload.productIds)),
    );

  if (productsToDelete.length !== payload.productIds.length) {
    throw new AppError("VALIDATION_ERROR", "Some products not found or not accessible");
  }

  const result = await db
    .delete(products)
    .where(and(eq(products.organizationId, organizationId), inArray(products.id, payload.productIds)));

  return { deleted: result.rowCount || 0 };
}

export async function duplicateProduct(
  organizationId: string,
  productId: string,
  newName: string,
): Promise<{ productId: string }> {
  // Get original product
  const [original] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.organizationId, organizationId)))
    .limit(1);

  if (!original) {
    throw new AppError("NOT_FOUND", "Product not found");
  }

  // Create new product
  const [newProduct] = await db
    .insert(products)
    .values({
      organizationId,
      categoryId: original.categoryId,
      brandId: original.brandId,
      unitId: original.unitId,
      taxRateId: original.taxRateId,
      type: original.type,
      name: newName,
      slug: newName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-"),
      sku: `${original.sku}-copy-${Date.now()}`,
      description: original.description,
      trackStock: original.trackStock,
      trackSerials: original.trackSerials,
      trackExpiry: original.trackExpiry,
      allowNegativeStock: original.allowNegativeStock,
      isActive: original.isActive,
    })
    .returning();

  if (!newProduct) {
    throw new AppError("INTERNAL_ERROR", "Failed to duplicate product");
  }

  // Duplicate variants
  const originalVariants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, productId));

  for (const variant of originalVariants) {
    await db.insert(productVariants).values({
      organizationId,
      productId: newProduct.id,
      name: variant.name,
      sku: `${variant.sku}-copy-${Date.now()}`,
      barcode: null,
      costAmount: variant.costAmount,
      priceAmount: variant.priceAmount,
      compareAtAmount: variant.compareAtAmount,
      attributes: variant.attributes,
      weightGrams: variant.weightGrams,
      isDefault: variant.isDefault,
      isActive: variant.isActive,
    });
  }

  return { productId: newProduct.id };
}

export async function exportProductsAsJSON(
  organizationId: string,
  productIds?: string[],
): Promise<string> {
  const results = await db
    .select()
    .from(products)
    .where(
      productIds && productIds.length > 0
        ? and(eq(products.organizationId, organizationId), inArray(products.id, productIds))
        : eq(products.organizationId, organizationId),
    );

  return JSON.stringify(results, null, 2);
}

export async function exportProductsAsCSV(
  organizationId: string,
  productIds?: string[],
): Promise<string> {
  const rows = await db
    .select({
      name: products.name,
      sku: products.sku,
      type: products.type,
      trackStock: products.trackStock,
      isActive: products.isActive,
      variantSku: productVariants.sku,
      barcode: productVariants.barcode,
      costAmount: productVariants.costAmount,
      priceAmount: productVariants.priceAmount,
    })
    .from(products)
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .where(
      productIds && productIds.length > 0
        ? and(eq(products.organizationId, organizationId), inArray(products.id, productIds))
        : eq(products.organizationId, organizationId),
    );

  const header = "name,sku,barcode,price,cost,description,track_stock,is_active";
  const lines = rows.map((row) => {
    const cost = row.costAmount?.toString() || "0";
    const price = row.priceAmount?.toString() || "0";
    const barcode = row.barcode || "";
    const trackStock = row.trackStock ? "true" : "false";
    const isActive = row.isActive ? "true" : "false";
    const name = `"${(row.name || "").replaceAll('"', '""')}"`;
    const sku = `"${(row.variantSku || row.sku || "").replaceAll('"', '""')}"`;
    return [name, sku, barcode, price, cost, "", trackStock, isActive].join(",");
  });
  return [header, ...lines].join("\n");
}

export type ImportResult = { created: number; errors: string[] };

export async function importProductsFromCSV(
  organizationId: string,
  csvText: string,
): Promise<ImportResult> {
  const lines = csvText.trim().split("\n").filter(Boolean);
  if (lines.length < 2) throw new AppError("VALIDATION_ERROR", "CSV harus memiliki header dan minimal 1 baris data");

  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const nameIdx = header.indexOf("name");
  const skuIdx = header.indexOf("sku");
  const barcodeIdx = header.indexOf("barcode");
  const priceIdx = header.indexOf("price");
  const costIdx = header.indexOf("cost");
  const trackIdx = header.indexOf("track_stock");
  const activeIdx = header.indexOf("is_active");

  if (nameIdx === -1 || skuIdx === -1 || priceIdx === -1) {
    throw new AppError("VALIDATION_ERROR", "CSV harus memiliki kolom: name, sku, price (minimal)");
  }

  const errors: string[] = [];
  let created = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    try {
      const name = cells[nameIdx]?.trim();
      const sku = cells[skuIdx]?.trim();
      const price = BigInt(cells[priceIdx]?.trim() || "0");
      if (!name || !sku) throw new Error(`Baris ${i + 1}: name dan sku wajib diisi`);
      const cost = costIdx >= 0 ? BigInt(cells[costIdx]?.trim() || "0") : 0n;
      const barcode = barcodeIdx >= 0 ? cells[barcodeIdx]?.trim() || null : null;
      const trackStock = trackIdx >= 0 ? cells[trackIdx]?.trim().toLowerCase() === "true" : true;
      const isActive = activeIdx >= 0 ? cells[activeIdx]?.trim().toLowerCase() !== "false" : true;
      const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const productId = crypto.randomUUID();

      const [product] = await db.insert(products).values({
        id: productId,
        organizationId,
        name,
        slug: `${slug}-${productId.slice(0, 8)}`,
        sku,
        type: "standard",
        trackStock,
        isActive,
      }).returning();

      if (!product) throw new Error(`Baris ${i + 1}: gagal membuat produk`);

      await db.insert(productVariants).values({
        organizationId,
        productId,
        name: "Default",
        sku,
        barcode,
        costAmount: cost,
        priceAmount: price,
        isDefault: true,
        isActive,
      });

      created++;
    } catch (error) {
      errors.push(`Baris ${i + 1}: ${error instanceof Error ? error.message : "gagal"}`);
    }
  }

  return { created, errors };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current); current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
