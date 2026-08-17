import { z } from "zod";
import { apiHandler, dataResponse } from "@/lib/api";
import { parseSearchParams } from "@/lib/server";
import { requireSelfOrderContext } from "@/lib/server/self-order-context";
import { getMenu } from "@/lib/services/self-order";

const schema = z.object({
  token: z.string().min(1).max(100),
});

export const GET = apiHandler(async (request) => {
  const url = new URL(request.url);
  const { token } = parseSearchParams(url.toString(), schema);
  const context = await requireSelfOrderContext(request);
  void context;
  const menu = await getMenu(token);
  return dataResponse(menu, { status: 200, headers: { "cache-control": "private, max-age=30" } });
});
