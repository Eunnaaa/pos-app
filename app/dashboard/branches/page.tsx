import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { BranchesPage } from "@/components/kasir/branches-page";

export default async function DashboardBranchesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return <BranchesPage />;
}