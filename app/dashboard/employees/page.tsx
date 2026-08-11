import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { EmployeesCashierPage } from "@/components/kasir/employees-page"

export default async function EmployeesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")
  return <EmployeesCashierPage />
}