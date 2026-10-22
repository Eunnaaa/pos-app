"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "@/i18n/navigation"
import { useOrganization } from "@/components/kasir/organization-provider"

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="mt-2 h-4 w-72 rounded bg-muted/60" />
        </div>
        <div className="h-9 w-32 rounded bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border bg-card/60 p-6" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-7">
        <div className="h-80 rounded-xl border bg-card/60 lg:col-span-4" />
        <div className="h-80 rounded-xl border bg-card/60 lg:col-span-3" />
      </div>
    </div>
  )
}

const DashboardOverview = dynamic(
  () => import("@/components/kasir/dashboard-overview").then((mod) => mod.DashboardOverview),
  { ssr: false, loading: () => <DashboardSkeleton /> }
)

const CashierDashboardOverview = dynamic(
  () => import("@/components/kasir/cashier-dashboard-overview").then((mod) => mod.CashierDashboardOverview),
  { ssr: false, loading: () => <DashboardSkeleton /> }
)

const SuperAdminDashboard = dynamic(
  () => import("@/components/admin/super-admin-dashboard").then((mod) => mod.SuperAdminDashboard),
  { ssr: false, loading: () => <DashboardSkeleton /> }
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
