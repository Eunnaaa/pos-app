import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Client, type Pool } from "pg";
import { sql } from "drizzle-orm";

test("online stock reservations serialize the last item, fulfill, and expire", {
  skip: process.env.STOCK_RESERVATION_INTEGRATION !== "true",
}, async () => {
  const { config } = await import("dotenv");
  config({ override: true, quiet: true });
  const baseUrl = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(baseUrl.hostname), "Integration test requires local PostgreSQL");
  const schema = `stock_verify_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const admin = new Client({ connectionString: baseUrl.toString(), ssl: false });
  await admin.connect();
  let pool: Pool | undefined;
  try {
    await admin.query(`create schema ${schema}`);
    await admin.query(`
      create table ${schema}.stock_balances (
        id uuid primary key default gen_random_uuid(), organization_id uuid not null,
        warehouse_id uuid not null, variant_id uuid not null,
        on_hand bigint not null default 0, reserved bigint not null default 0,
        available bigint not null default 0, average_cost_amount bigint not null default 0,
        reorder_point bigint not null default 0, reorder_quantity bigint not null default 0,
        version bigint not null default 0, created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(), unique (warehouse_id, variant_id)
      );
      create table ${schema}.stock_reservations (
        id uuid primary key default gen_random_uuid(), organization_id uuid not null,
        warehouse_id uuid not null, variant_id uuid not null, reference_type text not null,
        reference_id uuid not null, quantity bigint not null, status text not null,
        expires_at timestamptz, created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table ${schema}.stock_movements (
        id uuid primary key default gen_random_uuid(), organization_id uuid not null,
        branch_id uuid, warehouse_id uuid not null, variant_id uuid not null,
        type text not null, quantity bigint not null, before_quantity bigint not null,
        after_quantity bigint not null, unit_cost_amount bigint not null,
        reference_type text, reference_id uuid, reason text, actor_user_id text,
        occurred_at timestamptz not null default now(),
        created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
      create table ${schema}.sales_orders (
        id uuid primary key, organization_id uuid not null, branch_id uuid not null,
        warehouse_id uuid not null, status text not null, channel text not null default 'pos', metadata jsonb not null default '{}',
        created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
    `);

    baseUrl.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = baseUrl.toString();
    const database = await import("@/db");
    pool = database.pool;
    const { reserveOrderStock, releaseOrderReservations, fulfillOrderReservations, expirePendingOnlineOrders } = await import("@/lib/services/stock-reservations");
    const organizationId = randomUUID();
    const branchId = randomUUID();
    const warehouseId = randomUUID();
    const variantId = randomUUID();
    const firstOrder = randomUUID();
    const secondOrder = randomUUID();
    const thirdOrder = randomUUID();
    const fourthOrder = randomUUID();
    const legacyOrder = randomUUID();
    const expiry = new Date(Date.now() + 15 * 60_000);
    await database.db.execute(sql`
      insert into stock_balances (organization_id, warehouse_id, variant_id, on_hand, available)
      values (${organizationId}, ${warehouseId}, ${variantId}, 1, 1)
    `);
    for (const id of [firstOrder, secondOrder, thirdOrder, fourthOrder]) {
      await database.db.execute(sql`
        insert into sales_orders (id, organization_id, branch_id, warehouse_id, status, metadata)
        values (${id}, ${organizationId}, ${branchId}, ${warehouseId}, 'pending',
          ${JSON.stringify({ stockReservationVersion: 1, reservationExpiresAt: expiry.toISOString() })}::jsonb)
      `);
    }
    const reserve = (orderId: string, until = expiry) => database.db.transaction((tx) => reserveOrderStock(tx, {
      organizationId, warehouseId, orderId, expiresAt: until,
      items: [{ variantId, quantity: 1n, trackStock: true, allowNegativeStock: false }],
    }));

    const attempts = await Promise.allSettled([reserve(firstOrder), reserve(secondOrder)]);
    assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1,
      attempts.map((attempt) => attempt.status === "rejected" ? String(attempt.reason) : "fulfilled").join(" | "));
    assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);
    const winner = attempts[0].status === "fulfilled" ? firstOrder : secondOrder;
    const loser = winner === firstOrder ? secondOrder : firstOrder;
    const reserved = await database.db.execute(sql`select on_hand, reserved, available from stock_balances`);
    assert.deepEqual(reserved.rows.map((row) => [row.on_hand, row.reserved, row.available]), [["1", "1", "0"]]);

    await database.db.transaction((tx) => fulfillOrderReservations(tx, {
      organizationId, branchId, orderId: winner, actorUserId: null,
      itemCosts: new Map([[variantId, { costAmount: 100n, allowNegativeStock: false, quantity: 1n }]]),
    }));
    const sold = await database.db.execute(sql`select on_hand, reserved, available from stock_balances`);
    assert.deepEqual(sold.rows.map((row) => [row.on_hand, row.reserved, row.available]), [["0", "0", "0"]]);
    const movement = await database.db.execute(sql`select quantity, before_quantity, after_quantity from stock_movements`);
    assert.deepEqual(movement.rows.map((row) => [row.quantity, row.before_quantity, row.after_quantity]), [["-1", "1", "0"]]);

    await database.db.execute(sql`update stock_balances set on_hand = 1, available = 1`);
    await reserve(loser);
    await database.db.transaction((tx) => releaseOrderReservations(tx, organizationId, loser, "released"));
    const released = await database.db.execute(sql`select on_hand, reserved, available from stock_balances`);
    assert.deepEqual(released.rows.map((row) => [row.on_hand, row.reserved, row.available]), [["1", "0", "1"]]);

    const past = new Date(Date.now() - 60_000);
    await database.db.execute(sql`update sales_orders set metadata = ${JSON.stringify({ stockReservationVersion: 1, reservationExpiresAt: past.toISOString() })}::jsonb where id = ${thirdOrder}`);
    await reserve(thirdOrder, past);
    assert.equal(await expirePendingOnlineOrders(), 1);
    const expired = await database.db.execute(sql`select status from sales_orders where id = ${thirdOrder}`);
    assert.equal(expired.rows[0].status, "cancelled");
    const finalBalance = await database.db.execute(sql`select on_hand, reserved, available from stock_balances`);
    assert.deepEqual(finalBalance.rows.map((row) => [row.on_hand, row.reserved, row.available]), [["1", "0", "1"]]);

    // Run the SQL cron function itself in the isolated schema as a second
    // expiry path. This catches deployment-script syntax and release regressions.
    const cronSql = readFileSync(new URL("../supabase/cron-jobs.sql", import.meta.url), "utf8");
    const functionSql = cronSql.match(/create or replace function public\.expire_online_stock_reservations[\s\S]*?^\$\$;/m)?.[0];
    assert.ok(functionSql);
    await admin.query(functionSql.replaceAll("public.", `${schema}.`));
    await database.db.execute(sql`
      insert into sales_orders (id, organization_id, branch_id, warehouse_id, status, channel, metadata, created_at)
      values (${legacyOrder}, ${organizationId}, ${branchId}, ${warehouseId}, 'pending', 'self_order', '{}'::jsonb, now() - interval '20 minutes')
    `);
    await database.db.execute(sql`update sales_orders set metadata = ${JSON.stringify({ stockReservationVersion: 1, reservationExpiresAt: past.toISOString() })}::jsonb where id = ${fourthOrder}`);
    await reserve(fourthOrder, past);
    const cronResult = await database.db.execute(sql.raw(`select ${schema}.expire_online_stock_reservations(100) as expired`));
    assert.equal(cronResult.rows[0].expired, 2);
    const oldOrder = await database.db.execute(sql`select status from sales_orders where id = ${legacyOrder}`);
    assert.equal(oldOrder.rows[0].status, "cancelled");
    const cronBalance = await database.db.execute(sql`select on_hand, reserved, available from stock_balances`);
    assert.deepEqual(cronBalance.rows.map((row) => [row.on_hand, row.reserved, row.available]), [["1", "0", "1"]]);
  } finally {
    if (pool) await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
