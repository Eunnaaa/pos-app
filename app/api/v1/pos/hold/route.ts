import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { holdOrder, listHeldOrders } from "@/lib/services/pos-holds";
import { AppError } from "@/lib/server";

const cartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.string().regex(/^\d+$/),
  notes: z.string().max(500).optional(),
});

const holdOrderSchema = z.object({
  items: z.array(cartItemSchema).min(1),
  customerId: z.string().uuid().optional(),
  orderNotes: z.string().max(2000).optional(),
  discountAmount: z.string().regex(/^\d+$/).optional(),
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  if (!context.branchId) throw new AppError("BAD_REQUEST", "x-branch-id header is required for held orders");
  const body = holdOrderSchema.parse(await request.json());

  const held = await holdOrder(context.organizationId, context.branchId, context.session.user.id, body);
  return dataResponse(held);
});

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  if (!context.branchId) throw new AppError("BAD_REQUEST", "x-branch-id header is required for held orders");

  const held = await listHeldOrders(context.organizationId, context.branchId, context.session.user.id);
  return dataResponse(held);
});
