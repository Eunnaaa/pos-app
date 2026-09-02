import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { isSuperAdminUser } from "@/lib/super-admin"

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (isSuperAdminUser(session?.user)) {
    redirect("/dashboard/admin")
  }
  return <>{children}</>
}
