"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
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

type OrganizationContextValue = {
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

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [organizations, setOrganizations] = useState<UserOrganization[]>([])
  const [organizationId, setOrganizationId] = useState<string>()
  const [branchId, setBranchId] = useState<string>()
  const [warehouseId, setWarehouseId] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [noOrganization, setNoOrganization] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/v1/me/organizations", { credentials: "include", cache: "no-store" })
      if (response.status === 401) { router.replace("/sign-in"); return }
      if (!response.ok) throw new Error("Gagal mengambil organisasi")
      const payload = await response.json() as ApiEnvelope<UserOrganization[]>
      if (!payload.data.length) {
        // User tersi tapi belum punya organisasi. Jangan render children (mereka
        // memanggil API tenant dengan org id yang basi dan menghasilkan 403 berulang).
        // Biarkan redirect ke onboarding jalan.
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
      const selectedBranch = storedBranchId ? selected.branches.find((item) => item.id === storedBranchId) : undefined
      const storedWarehouseId = selectedBranch ? localStorage.getItem(ACTIVE_WAREHOUSE_KEY) : undefined
      const selectedWarehouse = selectedBranch?.warehouses.find((item) => item.id === storedWarehouseId)
        ?? selectedBranch?.warehouses.find((item) => item.isDefault)
        ?? selectedBranch?.warehouses[0]
      persistActiveContext({ organizationId: selected.id, branchId: selectedBranch?.id, warehouseId: selectedWarehouse?.id })
      setOrganizationId(selected.id); setBranchId(selectedBranch?.id); setWarehouseId(selectedWarehouse?.id)
    } finally { setLoading(false) }
  }, [router])

  useEffect(() => { void refresh() }, [refresh])

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
    window.dispatchEvent(new Event("kasir-ku-context-change"))
  }

  function selectBranch(id: string) {
    const selected = organization?.branches.find((item) => item.id === id)
    if (!organization || !selected) return
    const nextWarehouse = selected.warehouses.find((item) => item.isDefault) ?? selected.warehouses[0]
    persistActiveContext({ organizationId: organization.id, branchId: selected.id, warehouseId: nextWarehouse?.id })
    setBranchId(selected.id); setWarehouseId(nextWarehouse?.id)
    window.dispatchEvent(new Event("kasir-ku-context-change"))
  }

  function selectAllBranches() {
    if (!organization) return
    persistActiveContext({ organizationId: organization.id })
    setBranchId(undefined); setWarehouseId(undefined)
    window.dispatchEvent(new Event("kasir-ku-context-change"))
  }

  const value = { organizations, organization, branch, warehouse, loading, refresh, selectOrganization, selectBranch, selectAllBranches }

  if (loading || noOrganization) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="size-7 animate-spin text-emerald-600" /></div>
  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
}

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (!context) throw new Error("useOrganization must be used inside OrganizationProvider")
  return context
}
