import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth, getAuthFromHeaders } from "@/lib/auth";
import { SettingsPage } from "@/components/kasir/settings-page";

export const dynamic = "force-dynamic";

export default async function SettingsPageWrapper() {
  const reqHeaders = await headers();
  const session = await getAuthFromHeaders(reqHeaders).api.getSession({ headers: reqHeaders });
  if (!session) redirect("/sign-in");
  return <SettingsPage />;
}