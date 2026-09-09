"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "@/i18n/navigation"
import { DashboardOverview } from "@/components/kasir/dashboard-overview"
import { CashierDashboardOverview } from "@/components/kasir/cashier-dashboard-overview"
import { useOrganization } from "@/components/kasir/organization-provider"

const SuperAdminDashboard = dynamic(
  () => import("@/components/admin/super-admin-dashboard").then((mod) => mod.SuperAdminDashboard),
  { ssr: false }
)

export function DashboardRoleView() {
  const router = useRouter()
  const { organization, loading, isSuperAdmin } = useOrganization()
  const [impersonating, setImpersonating] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      setImpersonating(Boolean(sessionStorage.getItem("kedai-ku-impersonating")))
    }
  }, [])

  useEffect(() => {
    if (isSuperAdmin && !impersonating && typeof window !== "undefined") {
      const isImp = Boolean(sessionStorage.getItem("kedai-ku-impersonating"))
      if (!isImp) {
        router.replace("/dashboard/admin")
      }
    }
  }, [isSuperAdmin, impersonating, router])

  if (isSuperAdmin && !impersonating) {
    return <SuperAdminDashboard />
  }

  if (loading) return null
  return organization?.role === "cashier" ? <CashierDashboardOverview /> : <DashboardOverview />
}
