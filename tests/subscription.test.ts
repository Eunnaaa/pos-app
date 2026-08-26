import assert from "node:assert/strict";
import test from "node:test";
import { PLANS, TRIAL_DURATION_DAYS } from "@/config/plans";

void test("Subscription Plans: Free Tier has strict minimal limits", () => {
  const free = PLANS.free;
  assert.equal(free.id, "free");
  assert.equal(free.priceMonthly, 0);
  assert.equal(free.priceYearly, 0);
  assert.equal(free.limits.maxMonthlyOrders, 100);
  assert.equal(free.limits.maxProducts, 20);
  assert.equal(free.limits.maxBranches, 1);
  assert.equal(free.limits.maxMembers, 1);
  assert.equal(free.limits.maxWarehouses, 1);
  assert.equal(free.limits.historyDays, 3);
});

void test("Subscription Plans: Free Tier locks advanced features", () => {
  const free = PLANS.free;
  assert.equal(free.features.recipeBOM, false);
  assert.equal(free.features.exportReports, false);
  assert.equal(free.features.whatsappRecap, false);
  assert.equal(free.features.aiAdvisor, false);
  assert.equal(free.features.watermarkFreeReceipt, false);
  assert.equal(free.features.multiBranchTransfer, false);
  assert.equal(free.features.promotionsAndDiscounts, false);
  assert.equal(free.features.selfOrderQR, false);
});

void test("Subscription Plans: Pro Tier unlocks unlimited transactions and recipe BOM", () => {
  const pro = PLANS.pro;
  assert.equal(pro.id, "pro");
  assert.equal(pro.priceMonthly, 99000);
  assert.equal(pro.priceYearly, 79000);
  assert.equal(pro.limits.maxMonthlyOrders, Infinity);
  assert.equal(pro.limits.maxProducts, Infinity);
  assert.equal(pro.limits.maxBranches, 1);
  assert.equal(pro.limits.maxMembers, Infinity);
  assert.equal(pro.features.recipeBOM, true);
  assert.equal(pro.features.exportReports, true);
  assert.equal(pro.features.whatsappRecap, true);
  assert.equal(pro.features.aiAdvisor, true);
  assert.equal(pro.features.selfOrderQR, true);
});

void test("Subscription Plans: Business Tier unlocks multi-branch management", () => {
  const business = PLANS.business;
  assert.equal(business.id, "business");
  assert.equal(business.priceMonthly, 249000);
  assert.equal(business.priceYearly, 199000);
  assert.equal(business.limits.maxBranches, 5);
  assert.equal(business.limits.maxWarehouses, 10);
  assert.equal(business.features.multiBranchTransfer, true);
});

void test("Subscription Plans: Trial duration is set to 14 days", () => {
  assert.equal(TRIAL_DURATION_DAYS, 14);
});
