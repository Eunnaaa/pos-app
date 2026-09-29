import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";

const enabled = process.env.E2E_MUTATION_ALLOWED === "true";

async function postData<T>(request: APIRequestContext, path: string, data: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await request.post(path, { data, headers });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return (await response.json() as { data: T }).data;
}

async function patchData<T>(request: APIRequestContext, path: string, data: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await request.patch(path, { data, headers });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return (await response.json() as { data: T }).data;
}

test("owner can purchase, sell, refund, and settle stock and cash within one tenant", async ({ request, baseURL }) => {
  const localHost = baseURL && ["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname);
  test.skip(!enabled || !localHost, "Mutating journey runs only against an isolated local database");

  const suffix = crypto.randomUUID().slice(0, 12);
  const origin = new URL(baseURL!).origin;
  const signUp = await request.post("/api/auth/sign-up/email", {
    data: { name: "E2E Owner", email: `e2e-${suffix}@example.com`, password: "E2e-test-password-2026!" },
    headers: { origin },
  });
  expect(signUp.ok(), await signUp.text()).toBeTruthy();

  const onboarded = await postData<{
    organization: { id: string };
    branch: { id: string };
    warehouse: { id: string };
  }>(request, "/api/v1/onboarding", {
    businessName: `E2E Kedai ${suffix}`,
    slug: `e2e-kedai-${suffix}`,
    branchName: "Cabang Uji",
  });
  const { organization, branch, warehouse } = onboarded;
  const scope = { "x-organization-id": organization.id, "x-branch-id": branch.id };
  const mutation = (key: string) => ({ ...scope, "idempotency-key": `e2e-${suffix}-${key}` });

  const product = await postData<{ id: string }>(request, "/api/v1/resources/products", {
    name: "Kopi Uji", slug: `kopi-uji-${suffix}`, trackStock: true, isActive: true,
  }, mutation("product"));
  const variant = await postData<{ id: string }>(request, "/api/v1/resources/variants", {
    productId: product.id, name: "Regular", sku: `E2E-${suffix}`, priceAmount: "15000", costAmount: "7000", isDefault: true, isActive: true,
  }, mutation("variant"));

  await postData(request, "/api/v1/inventory/adjustments", {
    branchId: branch.id, warehouseId: warehouse.id, variantId: variant.id, quantity: "5", reason: "Stok awal pengujian",
  }, mutation("opening-stock"));
  const supplier = await postData<{ id: string }>(request, "/api/v1/resources/suppliers", {
    code: `E2E-${suffix}`, name: "Pemasok Uji", isActive: true,
  }, mutation("supplier"));
  const purchase = await postData<{ order: { id: string }; items: Array<{ id: string }> }>(
    request, "/api/v1/purchases/orders", {
      branchId: branch.id, warehouseId: warehouse.id, supplierId: supplier.id,
      items: [{ variantId: variant.id, quantity: "4", unitCostAmount: "7000" }],
    }, mutation("purchase-order"),
  );
  const unsafePurchaseMutation = await request.patch(`/api/v1/resources/purchase-orders/${purchase.order.id}`, {
    data: { status: "received" }, headers: mutation("unsafe-purchase-mutation"),
  });
  expect(unsafePurchaseMutation.status(), await unsafePurchaseMutation.text()).toBe(403);
  const otherWarehouse = await postData<{ id: string }>(request, "/api/v1/resources/warehouses", {
    branchId: branch.id, code: `ALT-${suffix}`, name: "Gudang Alternatif", isActive: true,
  }, mutation("other-warehouse"));
  const receiptBody = {
    purchaseOrderId: purchase.order.id, warehouseId: warehouse.id,
    items: [{ purchaseOrderItemId: purchase.items[0].id, variantId: variant.id, acceptedQuantity: "1", unitCostAmount: "7000" }],
  };
  const wrongWarehouse = await request.post("/api/v1/purchases/receipts", {
    data: { ...receiptBody, warehouseId: otherWarehouse.id }, headers: mutation("wrong-warehouse"),
  });
  expect(wrongWarehouse.status(), await wrongWarehouse.text()).toBe(422);

  const draftPurchase = await postData<{ order: { id: string }; items: Array<{ id: string }> }>(
    request, "/api/v1/purchases/orders", {
      warehouseId: warehouse.id, supplierId: supplier.id, branchId: branch.id, status: "draft",
      items: [{ variantId: variant.id, quantity: "1", unitCostAmount: "7000" }],
    }, mutation("draft-purchase"),
  );
  const draftReceipt = await request.post("/api/v1/purchases/receipts", {
    data: {
      purchaseOrderId: draftPurchase.order.id, warehouseId: warehouse.id,
      items: [{ purchaseOrderItemId: draftPurchase.items[0].id, variantId: variant.id, acceptedQuantity: "1", unitCostAmount: "7000" }],
    },
    headers: mutation("draft-receipt"),
  });
  expect(draftReceipt.status(), await draftReceipt.text()).toBe(409);

  const concurrentReceiptBody = {
    ...receiptBody,
    items: [{ ...receiptBody.items[0], acceptedQuantity: "3" }],
  };
  const concurrentReceipts = await Promise.all([
    request.post("/api/v1/purchases/receipts", { data: concurrentReceiptBody, headers: mutation("concurrent-receipt-a") }),
    request.post("/api/v1/purchases/receipts", { data: concurrentReceiptBody, headers: mutation("concurrent-receipt-b") }),
  ]);
  expect(concurrentReceipts.map((response) => response.status()).sort()).toEqual([201, 422]);

  const receipt = await postData<{ id: string }>(request, "/api/v1/purchases/receipts", receiptBody, mutation("goods-receipt"));
  expect(receipt.id).toBeTruthy();

  const shift = await postData<{ id: string }>(request, "/api/v1/finance/cash-sessions", {
    branchId: branch.id, openingAmount: "100000",
  }, mutation("open-shift"));

  const checkout = {
    branchId: branch.id,
    warehouseId: warehouse.id,
    cashSessionId: shift.id,
    status: "paid",
    channel: "pos",
    offlineReference: `e2e-sale-${suffix}`,
    items: [{ variantId: variant.id, quantity: "2" }],
    discountAmount: "10000",
    payments: [{ method: "cash", amount: "20000" }],
  };
  const quote = await postData<{ totalAmount: string }>(request, "/api/v1/pos/quote", checkout, scope);
  expect(quote.totalAmount).toBe("20000");

  const first = await postData<{
    order: { id: string; status: string; totalAmount: string };
    items: Array<{ id: string }>;
    payments: Array<{ id: string }>;
  }>(
    request, "/api/v1/pos/checkout", checkout, mutation("checkout"),
  );
  const replay = await postData<{ order: { id: string } }>(
    request, "/api/v1/pos/checkout", checkout, mutation("checkout"),
  );
  expect(first.order.status).toBe("paid");
  expect(first.order.totalAmount).toBe("20000");
  expect(replay.order.id).toBe(first.order.id);

  const balancesResponse = await request.get("/api/v1/resources/stock-balances", { headers: scope });
  expect(balancesResponse.ok(), await balancesResponse.text()).toBeTruthy();
  const balances = (await balancesResponse.json() as { data: Array<{ variant_id: string; on_hand: string }> }).data;
  expect(balances.find((row) => row.variant_id === variant.id)?.on_hand).toBe("7");

  const wrongPayment = await request.post("/api/v1/sales/returns", {
    data: {
      orderId: first.order.id, paymentId: crypto.randomUUID(), reason: "Pembayaran tidak terkait dengan pesanan",
      items: [{ orderItemId: first.items[0].id, quantity: "1", restock: true }],
    }, headers: mutation("wrong-payment"),
  });
  expect(wrongPayment.status(), await wrongPayment.text()).toBe(404);

  const returned = await postData<{ return: { id: string; totalAmount: string }; refund: { amount: string } }>(
    request, "/api/v1/sales/returns", {
      orderId: first.order.id, paymentId: first.payments[0].id, reason: "Satu produk dikembalikan dalam pengujian",
      items: [{ orderItemId: first.items[0].id, quantity: "1", restock: true }],
    }, mutation("partial-return"),
  );
  expect(returned.return.totalAmount).toBe("10000");
  expect(returned.refund.amount).toBe("10000");

  const returnedBalancesResponse = await request.get("/api/v1/resources/stock-balances", { headers: scope });
  expect(returnedBalancesResponse.ok(), await returnedBalancesResponse.text()).toBeTruthy();
  const returnedBalances = (await returnedBalancesResponse.json() as { data: Array<{ variant_id: string; on_hand: string }> }).data;
  expect(returnedBalances.find((row) => row.variant_id === variant.id)?.on_hand).toBe("8");

  const reportQuery = new URLSearchParams({
    startDate: new Date(Date.now() - 86_400_000).toISOString(),
    endDate: new Date(Date.now() + 86_400_000).toISOString(),
  });
  const reportResponse = await request.get(`/api/v1/reports/sales?${reportQuery}`, { headers: scope });
  expect(reportResponse.ok(), await reportResponse.text()).toBeTruthy();
  const report = (await reportResponse.json() as { data: { summary: { totalOrders: number; totalSales: string } } }).data;
  expect(report.summary.totalOrders).toBe(1);
  expect(report.summary.totalSales).toBe("10000");

  const remainingReturn = {
    orderId: first.order.id, paymentId: first.payments[0].id, reason: "Sisa produk dikembalikan bersamaan",
    items: [{ orderItemId: first.items[0].id, quantity: "1", restock: true }],
  };
  const concurrentReturns = await Promise.all([
    request.post("/api/v1/sales/returns", { data: remainingReturn, headers: mutation("concurrent-return-a") }),
    request.post("/api/v1/sales/returns", { data: remainingReturn, headers: mutation("concurrent-return-b") }),
  ]);
  expect(concurrentReturns.map((response) => response.status()).sort()).toEqual([201, 409]);

  const finalBalancesResponse = await request.get("/api/v1/resources/stock-balances", { headers: scope });
  expect(finalBalancesResponse.ok(), await finalBalancesResponse.text()).toBeTruthy();
  const finalBalances = (await finalBalancesResponse.json() as { data: Array<{ variant_id: string; on_hand: string }> }).data;
  expect(finalBalances.find((row) => row.variant_id === variant.id)?.on_hand).toBe("9");

  const finalReportResponse = await request.get(`/api/v1/reports/sales?${reportQuery}`, { headers: scope });
  expect(finalReportResponse.ok(), await finalReportResponse.text()).toBeTruthy();
  const finalReport = (await finalReportResponse.json() as { data: { summary: { totalOrders: number; totalSales: string } } }).data;
  expect(finalReport.summary.totalOrders).toBe(1);
  expect(finalReport.summary.totalSales).toBe("0");

  const expense = await postData<{ id: string }>(request, "/api/v1/resources/expenses", {
    branchId: branch.id,
    expenseNumber: `EXP-${suffix}`,
    category: "Operasional",
    description: "Pengeluaran pengujian ledger",
    amount: "12500",
    status: "draft",
    expenseDate: new Date().toISOString().slice(0, 10),
  }, mutation("expense-create"));
  await patchData(request, `/api/v1/resources/expenses/${expense.id}`, {
    status: "approved",
  }, mutation("expense-approve"));
  await patchData(request, `/api/v1/resources/expenses/${expense.id}`, {
    status: "paid",
  }, mutation("expense-paid"));

  const expenseMutation = await request.patch(`/api/v1/resources/expenses/${expense.id}`, {
    data: { amount: "25000" }, headers: mutation("expense-change-booked"),
  });
  expect(expenseMutation.status(), await expenseMutation.text()).toBe(409);
  const expenseDelete = await request.delete(`/api/v1/resources/expenses/${expense.id}`, {
    headers: mutation("expense-delete-booked"),
  });
  expect(expenseDelete.status(), await expenseDelete.text()).toBe(409);

  const financeResponse = await request.get(`/api/v1/reports/finance?${reportQuery}`, { headers: scope });
  expect(financeResponse.ok(), await financeResponse.text()).toBeTruthy();
  const finance = (await financeResponse.json() as {
    data: { summary: { expenses: string }; byAccount: Array<{ name: string; debit: string }> };
  }).data;
  expect(finance.summary.expenses).toBe("12500");
  expect(finance.byAccount.find((row) => row.name === "Beban Operasional")?.debit).toBe("12500");

  const previewResponse = await request.get(`/api/v1/finance/cash-sessions/${shift.id}/preview`, { headers: scope });
  expect(previewResponse.ok(), await previewResponse.text()).toBeTruthy();
  const preview = (await previewResponse.json() as { data: { expectedCash: string } }).data;
  expect(preview.expectedCash).toBe("100000");

  const closed = await postData<{ status: string; varianceAmount: string }>(
    request, `/api/v1/finance/cash-sessions/${shift.id}/close`,
    { tenderActuals: { cash: "100000" } }, mutation("close-shift"),
  );
  expect(closed.status).toBe("closed");
  expect(closed.varianceAmount).toBe("0");

  const otherTenant = await playwrightRequest.newContext({ baseURL: origin });
  try {
    const otherSignUp = await otherTenant.post("/api/auth/sign-up/email", {
      data: { name: "E2E Other Owner", email: `e2e-other-${suffix}@example.com`, password: "E2e-test-password-2026!" },
      headers: { origin },
    });
    expect(otherSignUp.ok(), await otherSignUp.text()).toBeTruthy();
    const forbidden = await otherTenant.get("/api/v1/resources/products", { headers: scope });
    expect(forbidden.status(), await forbidden.text()).toBe(403);
  } finally {
    await otherTenant.dispose();
  }
});
