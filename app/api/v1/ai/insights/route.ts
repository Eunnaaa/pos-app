import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { generateAndStoreInsights, listStoredInsights } from "@/lib/services/ai-insights";
import { assertFeatureEnabled } from "@/lib/services/subscription";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "reports:read");
  await assertFeatureEnabled(context.organizationId, "aiAdvisor", "Fitur AI Insights");
  const insights = await listStoredInsights({ organizationId: context.organizationId, branchId: context.branchId });
  return dataResponse(insights);
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "reports:read");
  await assertFeatureEnabled(context.organizationId, "aiAdvisor", "Fitur AI Insights");
  const results = await generateAndStoreInsights({ organizationId: context.organizationId, branchId: context.branchId });
  return dataResponse(results, { status: 201 });
});
