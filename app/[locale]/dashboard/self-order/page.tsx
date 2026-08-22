import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SelfOrderPage } from "@/components/kasir/self-order-page";

export const dynamic = "force-dynamic";

export default async function DashboardSelfOrderPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return <SelfOrderPage />;
}
