import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { assertBranchAccess } from "@/lib/server";
import { salesReport } from "@/lib/services/reporting";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  branchId: z.string().optional(),
});

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "sales:read");
  const url = new URL(request.url);
  const query = querySchema.parse(Object.fromEntries(url.searchParams));

  const targetBranchId =
    query.branchId === "all"
      ? null
      : (query.branchId || context.branchId || null);

  assertBranchAccess(context.tenant, targetBranchId);

  const endDate = query.endDate ? new Date(query.endDate) : new Date();
  const startDate = query.startDate
    ? new Date(query.startDate)
    : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (startDate >= endDate) return new Response(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "startDate must be before endDate" } }), { status: 422, headers: { "content-type": "application/json" } });

  const report = await salesReport(context.organizationId, targetBranchId, startDate, endDate);
  return dataResponse(report);
});
