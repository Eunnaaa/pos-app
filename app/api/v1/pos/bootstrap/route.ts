import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { assertBranchAccess } from "@/lib/server";
import { getPosBootstrapData } from "@/lib/services/pos-bootstrap";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  const { searchParams } = new URL(request.url);

  const branchId = searchParams.get("branchId") || context.branchId;
  const warehouseId = searchParams.get("warehouseId");
  const bypassCache = searchParams.get("fresh") === "true" || request.headers.get("cache-control")?.includes("no-cache");

  if (!branchId) {
    return dataResponse({
      products: [],
      categories: ["Semua"],
      customers: [],
      tables: [],
    });
  }

  assertBranchAccess(context.tenant, branchId);

  const data = await getPosBootstrapData(context.organizationId, branchId, warehouseId, { bypassCache });

  return dataResponse(data);
});
