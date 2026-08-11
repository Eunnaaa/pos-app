import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { getStorageSignedUrl } from "@/lib/integrations";
import { parseJson } from "@/lib/server";

const schema = z.object({
  bucket: z.string().min(1).max(100),
  path: z.string().min(1).max(1_000),
  expiresIn: z.number().int().min(60).max(86_400).default(3600),
});

export const POST = apiHandler(async (request) => {
  await requireApiContext(request, "settings:manage");
  const input = await parseJson(request, schema);
  const result = await getStorageSignedUrl(input.bucket, input.path, input.expiresIn);
  return dataResponse(result);
});