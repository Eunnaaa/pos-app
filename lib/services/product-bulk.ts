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
