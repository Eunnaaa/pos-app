import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { CashierManagement } from "@/components/kasir/cashier-management";

export default async function CashiersPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return <CashierManagement />;
}
