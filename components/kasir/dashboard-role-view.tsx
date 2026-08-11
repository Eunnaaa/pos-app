"use client"

import { DashboardOverview } from "@/components/kasir/dashboard-overview"
import { CashierDashboardOverview } from "@/components/kasir/cashier-dashboard-overview"
import { useOrganization } from "@/components/kasir/organization-provider"

export function DashboardRoleView() {
  const { organization, loading } = useOrganization()
  if (loading) return null
  return organization?.role === "cashier" ? <CashierDashboardOverview /> : <DashboardOverview />
}
