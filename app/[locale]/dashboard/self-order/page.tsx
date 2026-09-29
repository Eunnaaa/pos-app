import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuthFromHeaders } from "@/lib/auth";
import { SelfOrderPage } from "@/components/kasir/self-order-page";

export const dynamic = "force-dynamic";

export default async function DashboardSelfOrderPage() {
  const reqHeaders = await headers();
  const session = await getAuthFromHeaders(reqHeaders).api.getSession({ headers: reqHeaders });
  if (!session) redirect("/sign-in");
  return <SelfOrderPage />;
}
