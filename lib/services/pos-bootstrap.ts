import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { cacheGet, cacheSet } from "@/lib/redis";
import { transformImageUrl } from "@/lib/integrations/storage";

export type PosBootstrapProduct = {
  id: string; // variant id
  productId: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  trackStock: boolean;
  sku: string;
  barcode: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
};

export type PosBootstrapCustomer = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
};

export type PosBootstrapTable = {
  id: string;
  name: string;
  capacity: number;
  status: string;
};

export type PosBootstrapPayload = {
  products: PosBootstrapProduct[];
  categories: string[];
  customers: PosBootstrapCustomer[];
  tables: PosBootstrapTable[];
};

export async function getPosBootstrapData(
  organizationId: string,
  branchId: string,
  warehouseId?: string | null,
  options: { bypassCache?: boolean } = {},
): Promise<PosBootstrapPayload> {
  const cacheKey = `tenant:${organizationId}:branch:${branchId}:warehouse:${warehouseId || "none"}:pos-bootstrap`;

  if (!options.bypassCache) {
    const cached = await cacheGet<PosBootstrapPayload>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const warehouseClause = warehouseId
    ? sql`and sb.warehouse_id = ${warehouseId} and sb.organization_id = ${organizationId}`
    : sql`and 1 = 0`;

  const [productsResult, categoriesResult, customersResult, tablesResult] = await Promise.all([
    db.execute(sql`
      select 
        pv.id as id,
        p.id as product_id,
        case 
          when pv.name = 'Default' then p.name 
          else p.name || ' - ' || pv.name 
        end as name,
        coalesce(c.name, 'Lainnya') as category,
        pv.price_amount as price,
        coalesce(sb.available, 0) as stock,
        p.track_stock as track_stock,
        pv.sku as sku,
        pv.barcode as barcode,
        p.image_url as image_url
      from product_variants pv
      inner join products p on p.id = pv.product_id and p.is_active = true and p.organization_id = ${organizationId}
      left join categories c on c.id = p.category_id and c.is_active = true and c.organization_id = ${organizationId}
      left join stock_balances sb on sb.variant_id = pv.id ${warehouseClause}
      where pv.organization_id = ${organizationId} and pv.is_active = true
      order by p.name asc, pv.name asc
    `),
    db.execute(sql`
      select name
      from categories
      where organization_id = ${organizationId} and is_active = true
      order by sort_order asc, name asc
    `),
    db.execute(sql`
      select id, name, code, phone
      from customers
      where organization_id = ${organizationId} and is_active = true
      order by name asc
      limit 500
    `),
    db.execute(sql`
      select id, name, capacity, status
      from dining_tables
      where organization_id = ${organizationId} and branch_id = ${branchId} and is_active = true
      order by name asc
    `),
  ]);

  const rawProducts = productsResult.rows as unknown as Array<{
    id: string;
    product_id: string;
    name: string;
    category: string;
    price: string | number | bigint;
    stock: string | number | bigint;
    track_stock: boolean;
    sku: string;
    barcode: string | null;
    image_url: string | null;
  }>;

  const products: PosBootstrapProduct[] = rawProducts.map((row) => {
    const rawUrl = row.image_url?.trim() || null;
    let thumbnailUrl = rawUrl;
    if (rawUrl) {
      try {
        thumbnailUrl = transformImageUrl(rawUrl, { width: 240, quality: 75 });
      } catch {
        thumbnailUrl = rawUrl;
      }
    }

    return {
      id: row.id,
      productId: row.product_id,
      name: row.name,
      category: row.category,
      price: Number(row.price),
      stock: Number(row.stock),
      trackStock: Boolean(row.track_stock),
      sku: row.sku,
      barcode: row.barcode,
      imageUrl: rawUrl,
      thumbnailUrl,
    };
  });

  const categorySet = new Set<string>();
  categorySet.add("Semua");
  for (const catRow of categoriesResult.rows as unknown as Array<{ name: string }>) {
    if (catRow.name) categorySet.add(catRow.name);
  }
  for (const prod of products) {
    if (prod.category) categorySet.add(prod.category);
  }

  const customers = (customersResult.rows as unknown as Array<{ id: string; name: string; code: string; phone: string | null }>).map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    phone: c.phone ?? null,
  }));

  const tables = (tablesResult.rows as unknown as Array<{ id: string; name: string; capacity: number; status: string }>).map((t) => ({
    id: t.id,
    name: t.name,
    capacity: Number(t.capacity),
    status: t.status,
  }));

  const payload: PosBootstrapPayload = {
    products,
    categories: Array.from(categorySet),
    customers,
    tables,
  };

  void cacheSet(cacheKey, payload, 30);

  return payload;
}
