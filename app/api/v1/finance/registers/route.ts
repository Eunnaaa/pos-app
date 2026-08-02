import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cashRegisters } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  
  // Cek apakah ada cash register
  const registers = await db.select().from(cashRegisters).where(and(
    eq(cashRegisters.organizationId, context.organizationId),
    eq(cashRegisters.isActive, true),
    ...(context.branchId ? [eq(cashRegisters.branchId, context.branchId)] : [])
  ));
  
  // Jika tidak ada register dan ada branchId, buat default register
  if (registers.length === 0 && context.branchId) {
    try {
      const [newRegister] = await db.insert(cashRegisters).values({
        organizationId: context.organizationId,
        branchId: context.branchId,
        name: "Mesin Kasir Default",
        code: "DEFAULT",
        isActive: true,
      }).returning();
      
      return dataResponse([newRegister]);
    } catch (error) {
      // Jika error (misalnya unique constraint), return registers yang ada
      return dataResponse(registers);
    }
  }
  
  return dataResponse(registers);
});
