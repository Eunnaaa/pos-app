import { sql } from "drizzle-orm";
import { db } from "@/db";

export interface SalesReport {
  period: { start: string; end: string };
  summary: {
    totalSales: string;
    totalProfit: string;
    totalOrders: number;
    averageOrderValue: string;
    uniqueCustomers: number;
  };
  byPaymentMethod: Array<{ method: string; amount: string; count: number }>;
  byProduct: Array<{ name: string; quantity: string; sales: string; profit: string }>;
  byCustomer: Array<{ name: string; orders: number; total: string; points: string }>;
  hourly: Array<{ hour: string; sales: string; orders: number }>;
}

export interface InventoryReport {
  period: { start: string; end: string };
  summary: {
    totalSKUs: number;
    totalValue: string;
    totalQuantity: string;
    lowStockItems: number;
    outOfStockItems: number;
  };
  byCategory: Array<{ name: string; quantity: string; value: string; items: number }>;
  movements: Array<{ type: string; quantity: string; value: string; count: number }>;
  turnover: Array<{ name: string; turnover_rate: string; days_in_stock: number }>;
}

export interface PurchaseReport {
  period: { start: string; end: string };
  summary: {
    totalOrders: number;
    totalAmount: string;
    totalReceivedAmount: string;
    pendingAmount: string;
    uniqueSuppliers: number;
  };
  bySupplier: Array<{ name: string; orders: number; amount: string; avg_days: number }>;
  byStatus: Array<{ status: string; count: number; amount: string }>;
  receivingTimeline: Array<{ date: string; quantity: string; orders: number }>;
}

export interface FinanceReport {
  period: { start: string; end: string };
  summary: {
    income: string;
    expenses: string;
    profit: string;
    profitMargin: string;
    cashBalance: string;
  };
  byAccount: Array<{ name: string; debit: string; credit: string; balance: string }>;
  incomeBreakdown: Array<{ category: string; amount: string; percentage: string }>;
  expenseBreakdown: Array<{ category: string; amount: string; percentage: string }>;
  dailyFlow: Array<{ date: string; income: string; expenses: string; balance: string }>;
}

export interface CustomerReport {
  period: { start: string; end: string };
  summary: {
    totalCustomers: number;
    newCustomers: number;
    activeCustomers: number;
    totalSpent: string;
    averageSpent: string;
    averageLoyaltyPoints: string;
  };
  bySegment: Array<{ segment: string; count: number; spent: string; frequency: number }>;
  byLifetime: Array<{ range: string; count: number; spent: string; avg_frequency: number }>;
  topCustomers: Array<{ name: string; spent: string; orders: number; points: string }>;
}

export async function salesReport(
  organizationId: string,
  branchId: string | null,
  startDate: Date,
  endDate: Date
): Promise<SalesReport> {
  const [summary, byPayment, byProduct, byCustomer, hourly] = await Promise.all([
    db.execute(sql`
      SELECT 
        COALESCE(SUM(total_amount), 0)::text as total_sales,
        COALESCE(SUM(total_amount - cost_amount), 0)::text as total_profit,
        COUNT(*)::int as total_orders,
        COALESCE(AVG(total_amount), 0)::text as avg_order_value,
        COUNT(DISTINCT customer_id)::int as unique_customers
      FROM sales_orders
      WHERE organization_id = ${organizationId}
        ${branchId ? sql`AND branch_id = ${branchId}` : sql``}
        AND status IN ('paid', 'partially_refunded', 'refunded')
        AND occurred_at >= ${startDate}
        AND occurred_at < ${endDate}
    `),
    db.execute(sql`
      SELECT 
        method,
        SUM(amount)::text as amount,
        COUNT(*)::int as count
      FROM sales_payments
      WHERE organization_id = ${organizationId}
        ${branchId ? sql`AND branch_id = ${branchId}` : sql``}
        AND created_at >= ${startDate}
        AND created_at < ${endDate}
      GROUP BY method
      ORDER BY SUM(amount) DESC
    `),
    db.execute(sql`
      SELECT 
        item_name as name,
        SUM(quantity)::text as quantity,
        SUM(total_amount)::text as sales,
        SUM(COALESCE(cost_amount, 0))::text as profit
      FROM sales_order_items
      WHERE organization_id = ${organizationId}
        ${branchId ? sql`AND branch_id = ${branchId}` : sql``}
        AND created_at >= ${startDate}
        AND created_at < ${endDate}
      GROUP BY item_name
      ORDER BY SUM(quantity) DESC
      LIMIT 20
    `),
    db.execute(sql`
      SELECT 
        COALESCE(c.name, 'Pelanggan Umum') as name,
        COUNT(*)::int as orders,
        SUM(so.total_amount)::text as total,
        COALESCE(SUM(la.points_earned), 0)::text as points
      FROM sales_orders so
      LEFT JOIN customers c ON c.id = so.customer_id
      LEFT JOIN loyalty_transactions la ON la.order_id = so.id AND la.type = 'earn'
      WHERE so.organization_id = ${organizationId}
        ${branchId ? sql`AND so.branch_id = ${branchId}` : sql``}
        AND so.occurred_at >= ${startDate}
        AND so.occurred_at < ${endDate}
        AND so.status IN ('paid', 'partially_refunded', 'refunded')
      GROUP BY c.id, c.name
      ORDER BY SUM(so.total_amount) DESC
      LIMIT 20
    `),
    db.execute(sql`
      SELECT 
        TO_CHAR(DATE_TRUNC('hour', occurred_at), 'YYYY-MM-DD HH24:00') as hour,
        SUM(total_amount)::text as sales,
        COUNT(*)::int as orders
      FROM sales_orders
      WHERE organization_id = ${organizationId}
        ${branchId ? sql`AND branch_id = ${branchId}` : sql``}
        AND status IN ('paid', 'partially_refunded', 'refunded')
        AND occurred_at >= ${startDate}
        AND occurred_at < ${endDate}
      GROUP BY DATE_TRUNC('hour', occurred_at)
      ORDER BY DATE_TRUNC('hour', occurred_at)
    `),
  ]);

  const summaryRow = summary.rows[0] as Record<string, unknown> | undefined;
  return {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    summary: {
      totalSales: (summaryRow?.total_sales as string) || "0",
      totalProfit: (summaryRow?.total_profit as string) || "0",
      totalOrders: (summaryRow?.total_orders as number) || 0,
      averageOrderValue: (summaryRow?.avg_order_value as string) || "0",
      uniqueCustomers: (summaryRow?.unique_customers as number) || 0,
    },
    byPaymentMethod: byPayment.rows as Array<{ method: string; amount: string; count: number }>,
    byProduct: byProduct.rows as Array<{ name: string; quantity: string; sales: string; profit: string }>,
    byCustomer: byCustomer.rows as Array<{ name: string; orders: number; total: string; points: string }>,
    hourly: hourly.rows as Array<{ hour: string; sales: string; orders: number }>,
  };
}

export async function inventoryReport(
  organizationId: string,
  branchId: string | null,
  startDate: Date,
  endDate: Date
): Promise<InventoryReport> {
  const [summary, byCategory, movements, turnover] = await Promise.all([
    db.execute(sql`
      SELECT 
        COUNT(DISTINCT variant_id)::int as total_skus,
        COALESCE(SUM(available * unit_cost), 0)::text as total_value,
        COALESCE(SUM(available), 0)::text as total_quantity,
        COUNT(CASE WHEN available <= reorder_point THEN 1 END)::int as low_stock,
        COUNT(CASE WHEN available = 0 THEN 1 END)::int as out_of_stock
      FROM stock_balances
      WHERE organization_id = ${organizationId}
        ${branchId ? sql`AND warehouse_id IN (SELECT id FROM warehouses WHERE branch_id = ${branchId})` : sql``}
    `),
    db.execute(sql`
      SELECT 
        c.name,
        COALESCE(SUM(sb.available), 0)::text as quantity,
        COALESCE(SUM(sb.available * sb.unit_cost), 0)::text as value,
        COUNT(DISTINCT sb.variant_id)::int as items
      FROM stock_balances sb
      JOIN product_variants pv ON pv.id = sb.variant_id
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE sb.organization_id = ${organizationId}
        ${branchId ? sql`AND sb.warehouse_id IN (SELECT id FROM warehouses WHERE branch_id = ${branchId})` : sql``}
      GROUP BY c.id, c.name
      ORDER BY SUM(sb.available * sb.unit_cost) DESC
    `),
    db.execute(sql`
      SELECT 
        movement_type as type,
        COALESCE(SUM(quantity), 0)::text as quantity,
        COALESCE(SUM(quantity * unit_cost), 0)::text as value,
        COUNT(*)::int as count
      FROM stock_movements
      WHERE organization_id = ${organizationId}
        ${branchId ? sql`AND warehouse_id IN (SELECT id FROM warehouses WHERE branch_id = ${branchId})` : sql``}
        AND created_at >= ${startDate}
        AND created_at < ${endDate}
      GROUP BY movement_type
      ORDER BY SUM(quantity) DESC
    `),
    db.execute(sql`
      SELECT 
        p.name,
        CASE 
          WHEN avg_quantity = 0 THEN '0'
          ELSE (365 * sb.available / NULLIF(avg_quantity, 0))::text
        END as turnover_rate,
        CASE 
          WHEN avg_quantity = 0 THEN 365
          ELSE (sb.available / NULLIF(avg_quantity, 0))::int
        END as days_in_stock
      FROM stock_balances sb
      JOIN product_variants pv ON pv.id = sb.variant_id
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN LATERAL (
        SELECT AVG(ABS(quantity)) as avg_quantity
        FROM stock_movements
        WHERE variant_id = sb.variant_id
          AND created_at >= ${new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000)}
          AND created_at < ${endDate}
      ) sm ON TRUE
      WHERE sb.organization_id = ${organizationId}
        ${branchId ? sql`AND sb.warehouse_id IN (SELECT id FROM warehouses WHERE branch_id = ${branchId})` : sql``}
      ORDER BY turnover_rate DESC NULLS LAST
      LIMIT 20
    `),
  ]);

  const summaryRow = summary.rows[0] as Record<string, unknown> | undefined;
  return {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    summary: {
      totalSKUs: (summaryRow?.total_skus as number) || 0,
      totalValue: (summaryRow?.total_value as string) || "0",
      totalQuantity: (summaryRow?.total_quantity as string) || "0",
      lowStockItems: (summaryRow?.low_stock as number) || 0,
      outOfStockItems: (summaryRow?.out_of_stock as number) || 0,
    },
    byCategory: byCategory.rows as Array<{ name: string; quantity: string; value: string; items: number }>,
    movements: movements.rows as Array<{ type: string; quantity: string; value: string; count: number }>,
    turnover: turnover.rows as Array<{ name: string; turnover_rate: string; days_in_stock: number }>,
  };
}

export async function purchaseReport(
  organizationId: string,
  branchId: string | null,
  startDate: Date,
  endDate: Date
): Promise<PurchaseReport> {
  const [summary, bySupplier, byStatus, timeline] = await Promise.all([
    db.execute(sql`
      SELECT 
        COUNT(*)::int as total_orders,
        COALESCE(SUM(total_amount), 0)::text as total_amount,
        COALESCE(SUM(CASE WHEN status = 'received' THEN total_amount ELSE 0 END), 0)::text as received_amount,
        COALESCE(SUM(CASE WHEN status IN ('draft', 'open') THEN total_amount ELSE 0 END), 0)::text as pending_amount,
        COUNT(DISTINCT supplier_id)::int as unique_suppliers
      FROM purchase_orders
      WHERE organization_id = ${organizationId}
        ${branchId ? sql`AND branch_id = ${branchId}` : sql``}
        AND created_at >= ${startDate}
        AND created_at < ${endDate}
    `),
    db.execute(sql`
      SELECT 
        s.name,
        COUNT(po.id)::int as orders,
        COALESCE(SUM(po.total_amount), 0)::text as amount,
        COALESCE(AVG(EXTRACT(DAY FROM (po.received_at - po.created_at))), 0)::int as avg_days
      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.organization_id = ${organizationId}
        ${branchId ? sql`AND po.branch_id = ${branchId}` : sql``}
        AND po.created_at >= ${startDate}
        AND po.created_at < ${endDate}
      GROUP BY s.id, s.name
      ORDER BY COUNT(po.id) DESC
    `),
    db.execute(sql`
      SELECT 
        status,
        COUNT(*)::int as count,
        COALESCE(SUM(total_amount), 0)::text as amount
      FROM purchase_orders
      WHERE organization_id = ${organizationId}
        ${branchId ? sql`AND branch_id = ${branchId}` : sql``}
        AND created_at >= ${startDate}
        AND created_at < ${endDate}
      GROUP BY status
      ORDER BY COUNT(*) DESC
    `),
    db.execute(sql`
      SELECT 
        TO_CHAR(DATE_TRUNC('day', received_at), 'YYYY-MM-DD') as date,
        COALESCE(SUM(total_quantity), 0)::text as quantity,
        COUNT(*)::int as orders
      FROM purchase_orders
      WHERE organization_id = ${organizationId}
        ${branchId ? sql`AND branch_id = ${branchId}` : sql``}
        AND status = 'received'
        AND received_at >= ${startDate}
        AND received_at < ${endDate}
      GROUP BY DATE_TRUNC('day', received_at)
      ORDER BY DATE_TRUNC('day', received_at)
    `),
  ]);

  const summaryRow = summary.rows[0] as Record<string, unknown> | undefined;
  return {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    summary: {
      totalOrders: (summaryRow?.total_orders as number) || 0,
      totalAmount: (summaryRow?.total_amount as string) || "0",
      totalReceivedAmount: (summaryRow?.received_amount as string) || "0",
      pendingAmount: (summaryRow?.pending_amount as string) || "0",
      uniqueSuppliers: (summaryRow?.unique_suppliers as number) || 0,
    },
    bySupplier: bySupplier.rows as Array<{ name: string; orders: number; amount: string; avg_days: number }>,
    byStatus: byStatus.rows as Array<{ status: string; count: number; amount: string }>,
    receivingTimeline: timeline.rows as Array<{ date: string; quantity: string; orders: number }>,
  };
}

export async function financeReport(
  organizationId: string,
  branchId: string | null,
  startDate: Date,
  endDate: Date
): Promise<FinanceReport> {
  const [summary, byAccount, incomeBreakdown, expenseBreakdown, dailyFlow] = await Promise.all([
    db.execute(sql`
      SELECT 
        COALESCE(SUM(CASE WHEN debit_account_id IN (SELECT id FROM financial_accounts WHERE type IN ('income', 'revenue')) THEN credit ELSE 0 END), 0)::text as income,
        COALESCE(SUM(CASE WHEN debit_account_id IN (SELECT id FROM financial_accounts WHERE type = 'expense') THEN debit ELSE 0 END), 0)::text as expenses,
        COALESCE(SUM(credit) - SUM(debit), 0)::text as profit,
        COALESCE((SUM(credit) - SUM(debit)) * 100 / NULLIF(SUM(credit), 0), 0)::text as profit_margin,
        COALESCE(SUM(CASE WHEN debit_account_id IN (SELECT id FROM financial_accounts WHERE type = 'cash') THEN credit - debit ELSE 0 END), 0)::text as cash_balance
      FROM financial_transactions
      WHERE organization_id = ${organizationId}
        ${branchId ? sql`AND branch_id = ${branchId}` : sql``}
        AND created_at >= ${startDate}
        AND created_at < ${endDate}
    `),
    db.execute(sql`
      SELECT 
        fa.name,
        COALESCE(SUM(ft.debit), 0)::text as debit,
        COALESCE(SUM(ft.credit), 0)::text as credit,
        COALESCE(SUM(ft.credit - ft.debit), 0)::text as balance
      FROM financial_transactions ft
      JOIN financial_accounts fa ON fa.id IN (ft.debit_account_id, ft.credit_account_id)
      WHERE ft.organization_id = ${organizationId}
        ${branchId ? sql`AND ft.branch_id = ${branchId}` : sql``}
        AND ft.created_at >= ${startDate}
        AND ft.created_at < ${endDate}
      GROUP BY fa.id, fa.name
      ORDER BY SUM(ft.credit - ft.debit) DESC
    `),
    db.execute(sql`
      SELECT 
        fa.name as category,
        COALESCE(SUM(ft.credit), 0)::text as amount,
        COALESCE(ROUND(SUM(ft.credit) * 100.0 / NULLIF(SUM(SUM(ft.credit)) OVER (), 0), 2), 0)::text as percentage
      FROM financial_transactions ft
      JOIN financial_accounts fa ON fa.id = ft.credit_account_id AND fa.type IN ('income', 'revenue')
      WHERE ft.organization_id = ${organizationId}
        ${branchId ? sql`AND ft.branch_id = ${branchId}` : sql``}
        AND ft.created_at >= ${startDate}
        AND ft.created_at < ${endDate}
      GROUP BY fa.id, fa.name
      ORDER BY SUM(ft.credit) DESC
    `),
    db.execute(sql`
      SELECT 
        fa.name as category,
        COALESCE(SUM(ft.debit), 0)::text as amount,
        COALESCE(ROUND(SUM(ft.debit) * 100.0 / NULLIF(SUM(SUM(ft.debit)) OVER (), 0), 2), 0)::text as percentage
      FROM financial_transactions ft
      JOIN financial_accounts fa ON fa.id = ft.debit_account_id AND fa.type = 'expense'
      WHERE ft.organization_id = ${organizationId}
        ${branchId ? sql`AND ft.branch_id = ${branchId}` : sql``}
        AND ft.created_at >= ${startDate}
        AND ft.created_at < ${endDate}
      GROUP BY fa.id, fa.name
      ORDER BY SUM(ft.debit) DESC
    `),
    db.execute(sql`
      SELECT 
        TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') as date,
        COALESCE(SUM(CASE WHEN debit_account_id IN (SELECT id FROM financial_accounts WHERE type IN ('income', 'revenue')) THEN credit ELSE 0 END), 0)::text as income,
        COALESCE(SUM(CASE WHEN debit_account_id IN (SELECT id FROM financial_accounts WHERE type = 'expense') THEN debit ELSE 0 END), 0)::text as expenses,
        COALESCE(SUM(credit - debit), 0)::text as balance
      FROM financial_transactions
      WHERE organization_id = ${organizationId}
        ${branchId ? sql`AND branch_id = ${branchId}` : sql``}
        AND created_at >= ${startDate}
        AND created_at < ${endDate}
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY DATE_TRUNC('day', created_at)
    `),
  ]);

  const summaryRow = summary.rows[0] as Record<string, unknown> | undefined;
  return {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    summary: {
      income: (summaryRow?.income as string) || "0",
      expenses: (summaryRow?.expenses as string) || "0",
      profit: (summaryRow?.profit as string) || "0",
      profitMargin: (summaryRow?.profit_margin as string) || "0",
      cashBalance: (summaryRow?.cash_balance as string) || "0",
    },
    byAccount: byAccount.rows as Array<{ name: string; debit: string; credit: string; balance: string }>,
    incomeBreakdown: incomeBreakdown.rows as Array<{ category: string; amount: string; percentage: string }>,
    expenseBreakdown: expenseBreakdown.rows as Array<{ category: string; amount: string; percentage: string }>,
    dailyFlow: dailyFlow.rows as Array<{ date: string; income: string; expenses: string; balance: string }>,
  };
}

export async function customerReport(
  organizationId: string,
  branchId: string | null,
  startDate: Date,
  endDate: Date
): Promise<CustomerReport> {
  const [summary, bySegment, byLifetime, topCustomers] = await Promise.all([
    db.execute(sql`
      SELECT 
        COUNT(DISTINCT c.id)::int as total_customers,
        COUNT(DISTINCT CASE WHEN c.created_at >= ${startDate} THEN c.id END)::int as new_customers,
        COUNT(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM sales_orders so 
          WHERE so.customer_id = c.id 
          AND so.created_at >= ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
        ) THEN c.id END)::int as active_customers,
        COALESCE(SUM(CASE WHEN so.status IN ('paid', 'partially_refunded', 'refunded') THEN so.total_amount ELSE 0 END), 0)::text as total_spent,
        COALESCE(AVG(CASE WHEN so.status IN ('paid', 'partially_refunded', 'refunded') THEN so.total_amount ELSE 0 END), 0)::text as avg_spent,
        COALESCE(AVG(la.points_balance), 0)::text as avg_points
      FROM customers c
      LEFT JOIN sales_orders so ON so.customer_id = c.id AND so.created_at >= ${startDate} AND so.created_at < ${endDate}
      LEFT JOIN loyalty_accounts la ON la.customer_id = c.id
      WHERE c.organization_id = ${organizationId}
        ${branchId ? sql`AND c.branch_id = ${branchId}` : sql``}
    `),
    db.execute(sql`
      SELECT 
        CASE 
          WHEN SUM(so.total_amount) IS NULL THEN 'Tidak Aktif'
          WHEN SUM(so.total_amount) < 500000 THEN 'Bronze'
          WHEN SUM(so.total_amount) < 2000000 THEN 'Silver'
          ELSE 'Gold'
        END as segment,
        COUNT(DISTINCT c.id)::int as count,
        COALESCE(SUM(so.total_amount), 0)::text as spent,
        COALESCE(AVG(COUNT(DISTINCT so.id)), 0)::int as frequency
      FROM customers c
      LEFT JOIN sales_orders so ON so.customer_id = c.id 
        AND so.status IN ('paid', 'partially_refunded', 'refunded')
        AND so.created_at >= ${startDate}
        AND so.created_at < ${endDate}
      WHERE c.organization_id = ${organizationId}
        ${branchId ? sql`AND c.branch_id = ${branchId}` : sql``}
      GROUP BY segment
      ORDER BY COUNT(*) DESC
    `),
    db.execute(sql`
      SELECT 
        CASE 
          WHEN SUM(so.total_amount) IS NULL OR SUM(so.total_amount) = 0 THEN 'Rp 0'
          WHEN SUM(so.total_amount) < 500000 THEN 'Rp 0 - Rp 500K'
          WHEN SUM(so.total_amount) < 2000000 THEN 'Rp 500K - Rp 2M'
          WHEN SUM(so.total_amount) < 10000000 THEN 'Rp 2M - Rp 10M'
          ELSE 'Rp 10M+'
        END as range,
        COUNT(DISTINCT c.id)::int as count,
        COALESCE(SUM(so.total_amount), 0)::text as spent,
        COALESCE(AVG(COUNT(DISTINCT so.id)), 0)::int as avg_frequency
      FROM customers c
      LEFT JOIN sales_orders so ON so.customer_id = c.id 
        AND so.status IN ('paid', 'partially_refunded', 'refunded')
        AND so.created_at >= ${startDate}
        AND so.created_at < ${endDate}
      WHERE c.organization_id = ${organizationId}
        ${branchId ? sql`AND c.branch_id = ${branchId}` : sql``}
      GROUP BY range
      ORDER BY count DESC
    `),
    db.execute(sql`
      SELECT 
        c.name,
        COALESCE(SUM(so.total_amount), 0)::text as spent,
        COUNT(so.id)::int as orders,
        COALESCE(SUM(la.points_balance), 0)::text as points
      FROM customers c
      LEFT JOIN sales_orders so ON so.customer_id = c.id 
        AND so.status IN ('paid', 'partially_refunded', 'refunded')
        AND so.created_at >= ${startDate}
        AND so.created_at < ${endDate}
      LEFT JOIN loyalty_accounts la ON la.customer_id = c.id
      WHERE c.organization_id = ${organizationId}
        ${branchId ? sql`AND c.branch_id = ${branchId}` : sql``}
      GROUP BY c.id, c.name
      ORDER BY SUM(so.total_amount) DESC NULLS LAST
      LIMIT 20
    `),
  ]);

  const summaryRow = summary.rows[0] as Record<string, unknown> | undefined;
  return {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    summary: {
      totalCustomers: (summaryRow?.total_customers as number) || 0,
      newCustomers: (summaryRow?.new_customers as number) || 0,
      activeCustomers: (summaryRow?.active_customers as number) || 0,
      totalSpent: (summaryRow?.total_spent as string) || "0",
      averageSpent: (summaryRow?.avg_spent as string) || "0",
      averageLoyaltyPoints: (summaryRow?.avg_points as string) || "0",
    },
    bySegment: bySegment.rows as Array<{ segment: string; count: number; spent: string; frequency: number }>,
    byLifetime: byLifetime.rows as Array<{ range: string; count: number; spent: string; avg_frequency: number }>,
    topCustomers: topCustomers.rows as Array<{ name: string; spent: string; orders: number; points: string }>,
  };
}
