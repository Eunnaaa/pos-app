import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { ensureDefaultCategories } from "@/lib/services/categories";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "inventory:write");
  await ensureDefaultCategories(context.organizationId);
  return dataResponse({ ok: true, message: "Default categories ensured" });
});
