import { AppError } from "./errors";

export type BranchAccessContext = {
  role: string;
  branchIds: string[];
};

/** Empty branchIds means organization-wide access. A non-empty list is a hard
 * allowlist and requires every branch-scoped request to name an allowed branch. */
export function assertBranchAccess(context: BranchAccessContext, branchId?: string | null): void {
  if (context.role === "owner" || context.branchIds.length === 0) return;
  if (!branchId || !context.branchIds.includes(branchId)) {
    throw new AppError("FORBIDDEN", "No access to this branch");
  }
}
