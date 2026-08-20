import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface DefaultCategory {
  name: string;
  slug: string;
  sortOrder: number;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Makanan", slug: "makanan", sortOrder: 1 },
  { name: "Minuman", slug: "minuman", sortOrder: 2 },
  { name: "Snack", slug: "snack", sortOrder: 3 },
  { name: "Dessert", slug: "dessert", sortOrder: 4 },
  { name: "Add-on", slug: "add-on", sortOrder: 5 },
];

export async function ensureDefaultCategories(organizationId: string): Promise<void> {
  const existing = await db
    .select({ slug: categories.slug })
    .from(categories)
    .where(eq(categories.organizationId, organizationId));

  const existingSlugs = new Set(existing.map((c) => c.slug));
  const toInsert = DEFAULT_CATEGORIES.filter((c) => !existingSlugs.has(c.slug));

  if (toInsert.length === 0) return;

  await db.transaction(async (tx) => {
    for (const cat of toInsert) {
      await tx.insert(categories).values({
        organizationId,
        name: cat.name,
        slug: cat.slug,
        sortOrder: cat.sortOrder,
        isActive: true,
      });
    }
  });
}

export async function getCategories(organizationId: string) {
  return db
    .select({ id: categories.id, name: categories.name, slug: categories.slug, sortOrder: categories.sortOrder })
    .from(categories)
    .where(eq(categories.organizationId, organizationId))
    .orderBy(categories.sortOrder);
}