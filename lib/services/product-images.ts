import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { productImages, products } from "@/db/schema";
import { AppError } from "@/lib/server";

export interface ProductImage {
  id: string;
  productId: string;
  imageUrl: string;
  altText?: string;
  isPrimary: boolean;
  displayOrder: number;
  createdAt: string;
}

export async function uploadProductImage(
  organizationId: string,
  productId: string,
  imageUrl: string,
  altText?: string,
): Promise<ProductImage> {
  // Verify product exists
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.organizationId, organizationId)))
    .limit(1);

  if (!product) {
    throw new AppError("NOT_FOUND", "Product not found");
  }

  // Check if this should be primary (first image)
  const existingImages = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(eq(productImages.productId, productId));

  const isPrimary = existingImages.length === 0;
  const displayOrder = existingImages.length;

  const [result] = await db
    .insert(productImages)
    .values({
      organizationId,
      productId,
      imageUrl,
      altText,
      isPrimary,
      displayOrder,
    })
    .returning();

  if (!result) throw new AppError("INTERNAL_ERROR", "Failed to upload image");

  return {
    id: result.id,
    productId: result.productId,
    imageUrl: result.imageUrl,
    altText: result.altText || undefined,
    isPrimary: result.isPrimary,
    displayOrder: result.displayOrder,
    createdAt: result.createdAt.toISOString(),
  };
}

export async function listProductImages(productId: string): Promise<ProductImage[]> {
  const results = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy((t) => t.displayOrder);

  return results.map((r) => ({
    id: r.id,
    productId: r.productId,
    imageUrl: r.imageUrl,
    altText: r.altText || undefined,
    isPrimary: r.isPrimary,
    displayOrder: r.displayOrder,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getPrimaryProductImage(productId: string): Promise<ProductImage | null> {
  const [result] = await db
    .select()
    .from(productImages)
    .where(and(eq(productImages.productId, productId), eq(productImages.isPrimary, true)))
    .limit(1);

  if (!result) return null;

  return {
    id: result.id,
    productId: result.productId,
    imageUrl: result.imageUrl,
    altText: result.altText || undefined,
    isPrimary: result.isPrimary,
    displayOrder: result.displayOrder,
    createdAt: result.createdAt.toISOString(),
  };
}

export async function deleteProductImage(
  organizationId: string,
  imageId: string,
): Promise<void> {
  const [image] = await db
    .select()
    .from(productImages)
    .where(and(eq(productImages.id, imageId), eq(productImages.organizationId, organizationId)))
    .limit(1);

  if (!image) {
    throw new AppError("NOT_FOUND", "Image not found");
  }

  // If deleting primary image, make the next one primary
  if (image.isPrimary) {
    const [nextImage] = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, image.productId))
      .orderBy((t) => t.displayOrder)
      .limit(1);

    if (nextImage && nextImage.id !== imageId) {
      await db
        .update(productImages)
        .set({ isPrimary: true })
        .where(eq(productImages.id, nextImage.id));
    }
  }

  await db.delete(productImages).where(eq(productImages.id, imageId));
}

export async function setPrimaryImage(
  organizationId: string,
  productId: string,
  imageId: string,
): Promise<void> {
  // Verify image belongs to product
  const [image] = await db
    .select()
    .from(productImages)
    .where(
      and(
        eq(productImages.id, imageId),
        eq(productImages.productId, productId),
        eq(productImages.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!image) {
    throw new AppError("NOT_FOUND", "Image not found");
  }

  // Remove primary from all other images
  const { ne } = await import("drizzle-orm");
  await db
    .update(productImages)
    .set({ isPrimary: false })
    .where(and(eq(productImages.productId, productId), ne(productImages.id, imageId)));

  // Set this image as primary
  await db.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, imageId));
}
