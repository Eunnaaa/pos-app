import { cacheDel } from "./client";
import { RedisKeys } from "./keys";

export * from "./client";
export * from "./keys";

export const dashboardPeriods: readonly number[] = [7, 14, 30, 90];

export function invalidateSalesDashboard(organizationId: string, branchId: string, ...cashierIds: (string | null)[]) {
  return cacheDel(...[branchId, null].flatMap((branch) => [
    ...dashboardPeriods.map((days) => RedisKeys.dashboard(organizationId, branch, days)),
    ...new Set(cashierIds.filter((id): id is string => Boolean(id)).map((id) => RedisKeys.cashierDashboard(organizationId, branch, id))),
  ]));
}
