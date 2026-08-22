import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SettingsPage } from "@/components/kasir/settings-page";

export const dynamic = "force-dynamic";

export default async function SettingsPageWrapper() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return <SettingsPage />;
}