import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth, getAuthFromHeaders } from "@/lib/auth";
import { CashierManagement } from "@/components/kasir/cashier-management";

export default async function CashiersPage() {
  const reqHeaders = await headers();
  const session = await getAuthFromHeaders(reqHeaders).api.getSession({ headers: reqHeaders });
  if (!session) redirect("/sign-in");
  return <CashierManagement />;
}
