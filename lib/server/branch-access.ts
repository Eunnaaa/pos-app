import { AppError } from "./errors";

export type BranchAccessContext = {
  role: string;
  branchIds: string[];
  /** Organization-wide access is explicit; an empty allowlist is deny-by-default. */
  allBranches?: boolean;
  /** Active branch IDs used to reject deactivated/unknown branches for owners. */
  activeBranchIds?: string[];
};

/** Organization-wide access is explicit; otherwise every branch-scoped request
 * must name an active branch in the member's allowlist. */
export function assertBranchAccess(context: BranchAccessContext, branchId?: string | null): void {
  if (context.role === "owner" || context.allBranches === true) {
    if (!branchId) return;
    if (!context.activeBranchIds || context.activeBranchIds.includes(branchId)) return;
  }
  if (!branchId || !context.branchIds.includes(branchId)) {
    throw new AppError("FORBIDDEN", "No access to this branch");
  }
}
