"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import {
  ACTIVE_BRANCH_KEY,
  ACTIVE_ORGANIZATION_KEY,
  ACTIVE_WAREHOUSE_KEY,
  persistActiveContext,
  setInitialOrganization,
  type ApiEnvelope,
  type UserOrganization,
} from "@/lib/client"
import { useRouter } from "@/i18n/navigation"
import { showError } from "@/lib/toast-handler"

type OrganizationContextValue = {
  isSuperAdmin: boolean
  organizations: UserOrganization[]
  organization?: UserOrganization
  branch?: UserOrganization["branches"][number]
  warehouse?: UserOrganization["branches"][number]["warehouses"][number]
  loading: boolean
  refresh: () => Promise<void>
  selectOrganization: (id: string) => void
  selectBranch: (id: string) => void
  selectAllBranches: () => void
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null)

const defaultSuperAdminValue: OrganizationContextValue = {
  isSuperAdmin: true,
  organizations: [],
  organization: undefined,
  branch: undefined,
  warehouse: undefined,
  loading: false,
  refresh: async () => {},
  selectOrganization: () => {},
  selectBranch: () => {},
  selectAllBranches: () => {},
}

export function OrganizationProvider({
  children,
  isSuperAdmin = false,
}: {
  children: React.ReactNode
  isSuperAdmin?: boolean
}) {
  const t = useTranslations("OrganizationProvider")
  const router = useRouter()
  const checkSuperAdmin = isSuperAdmin

  const [organizations, setOrganizations] = useState<UserOrganization[]>([])
  const [organizationId, setOrganizationId] = useState<string>()
  const [branchId, setBranchId] = useState<string>()
  const [warehouseId, setWarehouseId] = useState<string>()
  const [loading, setLoading] = useState(!checkSuperAdmin)
  const [noOrganization, setNoOrganization] = useState(false)

  const refresh = useCallback(async () => {
    if (checkSuperAdmin) return

    setLoading(true)
    try {
      const response = await fetch("/api/v1/me/organizations", { credentials: "include", cache: "no-store" })
      if (response.status === 401) { router.replace("/sign-in"); return }
      if (!response.ok) throw new Error(t("fetchFailed"))
      const payload = await response.json() as ApiEnvelope<UserOrganization[]> & { meta?: { isSuperAdmin?: boolean } }

      if (payload.meta?.isSuperAdmin) {
        setNoOrganization(false)
        setLoading(false)
        return
      }

      if (!payload.data.length) {
        setNoOrganization(true)
        router.replace("/onboarding")
        setLoading(false)
        return
      }
      setNoOrganization(false)
      setOrganizations(payload.data)
      const storedOrganizationId = localStorage.getItem(ACTIVE_ORGANIZATION_KEY)
      const selected = payload.data.find((item) => item.id === storedOrganizationId) ?? payload.data[0]
      const storedBranchId = localStorage.getItem(ACTIVE_BRANCH_KEY)
      const selectedBranch = (storedBranchId ? selected.branches.find((item) => item.id === storedBranchId) : undefined) ?? selected.branches[0]
      const storedWarehouseId = localStorage.getItem(ACTIVE_WAREHOUSE_KEY)
      const selectedWarehouse = selectedBranch?.warehouses.find((item) => item.id === storedWarehouseId)
        ?? selectedBranch?.warehouses.find((item) => item.isDefault)
        ?? selectedBranch?.warehouses[0]
      persistActiveContext({ organizationId: selected.id, branchId: selectedBranch?.id, warehouseId: selectedWarehouse?.id })
      setOrganizationId(selected.id); setBranchId(selectedBranch?.id); setWarehouseId(selectedWarehouse?.id)
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : t("fetchFailed"))
    } finally { setLoading(false) }
  }, [checkSuperAdmin, router, t])

  useEffect(() => {
    if (!checkSuperAdmin) {
      void refresh()
    }
  }, [checkSuperAdmin, refresh])

  const organization = organizations.find((item) => item.id === organizationId)
  const branch = organization?.branches.find((item) => item.id === branchId)
  const warehouse = branch?.warehouses.find((item) => item.id === warehouseId)

  function selectOrganization(id: string) {
    const selected = organizations.find((item) => item.id === id)
    if (!selected) return
    setInitialOrganization(selected)
    const nextBranch = selected.branches[0]
    const nextWarehouse = nextBranch?.warehouses.find((item) => item.isDefault) ?? nextBranch?.warehouses[0]
    setOrganizationId(selected.id); setBranchId(nextBranch?.id); setWarehouseId(nextWarehouse?.id)
    window.dispatchEvent(new Event("kedai-ku-context-change"))
  }

  function selectBranch(id: string) {
    const selected = organization?.branches.find((item) => item.id === id)
    if (!organization || !selected) return
    const nextWarehouse = selected.warehouses.find((item) => item.isDefault) ?? selected.warehouses[0]
    persistActiveContext({ organizationId: organization.id, branchId: selected.id, warehouseId: nextWarehouse?.id })
    setBranchId(selected.id); setWarehouseId(nextWarehouse?.id)
    window.dispatchEvent(new Event("kedai-ku-context-change"))
  }

  function selectAllBranches() {
    if (!organization?.canAccessAllBranches) return
    persistActiveContext({ organizationId: organization.id })
    setBranchId(undefined); setWarehouseId(undefined)
    window.dispatchEvent(new Event("kedai-ku-context-change"))
  }

  if (checkSuperAdmin) {
    return <OrganizationContext.Provider value={defaultSuperAdminValue}>{children}</OrganizationContext.Provider>
  }

  const value = { isSuperAdmin: false, organizations, organization, branch, warehouse, loading, refresh, selectOrganization, selectBranch, selectAllBranches }

  if (loading || noOrganization) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="size-7 animate-spin text-emerald-600" /></div>
  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
}

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (!context) throw new Error("useOrganization must be used inside OrganizationProvider")
  return context
}
