import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { generateAndStoreInsights, listStoredInsights } from "@/lib/services/ai-insights";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "reports:read");
  const insights = await listStoredInsights({ organizationId: context.organizationId, branchId: context.branchId });
  return dataResponse(insights);
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "reports:read");
  const results = await generateAndStoreInsights({ organizationId: context.organizationId, branchId: context.branchId });
  return dataResponse(results, { status: 201 });
});
