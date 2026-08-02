import { notFound } from "next/navigation"
import { ModulePage } from "@/components/kasir/module-page"

const modules = new Set([
  "products", "inventory", "sales", "purchases", "suppliers", "customers", "loyalty",
  "promotions", "kitchen", "reservations", "employees", "branches", "reports", "ai", "settings",
])

export default async function DashboardModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params
  if (!modules.has(module)) notFound()
  return <ModulePage module={module} />
}
