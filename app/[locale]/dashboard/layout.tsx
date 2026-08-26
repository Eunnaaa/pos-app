import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { isSuperAdminEmail } from "@/lib/super-admin"

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { OrganizationProvider } from "@/components/kasir/organization-provider"
import { SiteHeader } from "@/components/site-header"

import "@/app/[locale]/dashboard/theme.css"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()])
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session) redirect("/sign-in")
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"
  const isSuperAdmin = isSuperAdminEmail(session.user.email)

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
        } as React.CSSProperties
      }
    >
      <OrganizationProvider isSuperAdmin={isSuperAdmin}>
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader />
          <div className="flex flex-1 flex-col">{children}</div>
        </SidebarInset>
      </OrganizationProvider>
    </SidebarProvider>
  )
}