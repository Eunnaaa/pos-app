import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { AppError } from "@/lib/server";
import { financeReport } from "@/lib/services/reporting";

const querySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "finance:read");
  const url = new URL(request.url);
  const query = querySchema.parse(Object.fromEntries(url.searchParams));

  const endDate = query.endDate ? new Date(query.endDate) : new Date();
  const startDate = query.startDate
    ? new Date(query.startDate)
    : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (startDate >= endDate) throw new AppError("VALIDATION_ERROR", "startDate must be before endDate");

  try {
    const report = await financeReport(context.organizationId, context.branchId || null, startDate, endDate);
    return dataResponse(report);
  } catch (error) {
    const details: unknown[] = [];
    for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
      if (current instanceof Error) details.push({ name: current.name, message: current.message, cause: current.cause });
      else details.push(current);
      current = current instanceof Error ? current.cause : undefined;
    }
    console.error("finance report query failed", details);
    throw error;
  }
});
