import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth, getAuthFromHeaders } from "@/lib/auth";
import { BranchesPage } from "@/components/kasir/branches-page";

export default async function DashboardBranchesPage() {
  const reqHeaders = await headers();
  const session = await getAuthFromHeaders(reqHeaders).api.getSession({ headers: reqHeaders });
  if (!session) redirect("/sign-in");
  return <BranchesPage />;
}