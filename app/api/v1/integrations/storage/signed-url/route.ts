import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { getStorageSignedUrl } from "@/lib/integrations";
import { parseJson } from "@/lib/server";

const schema = z.object({
  bucket: z.enum(["private-files"]),
  path: z.string().min(1).max(1_000).refine(
    (path) => !path.startsWith("/") && path.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
    "Invalid storage path",
  ),
  expiresIn: z.number().int().min(60).max(86_400).default(3600),
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "settings:manage");
  const input = await parseJson(request, schema);
  const tenantPath = `${context.organizationId}/${input.path}`;
  const result = await getStorageSignedUrl(input.bucket, tenantPath, input.expiresIn);
  return dataResponse(result);
});
