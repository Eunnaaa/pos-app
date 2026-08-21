"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Bell, Building2, CreditCard, Landmark, MapPin, Store, User } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useOrganization } from "@/components/kasir/organization-provider"
import { AccountTab } from "./settings/account-tab"
import { BusinessTab } from "./settings/business-tab"
import { BranchesTab } from "./settings/branches-tab"
import { BusinessesTab } from "./settings/businesses-tab"
import { BillingTab } from "./settings/billing-tab"
import { NotificationsTab } from "./settings/notifications-tab"

export function SettingsPage() {
  const t = useTranslations("Settings")
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const [activeTab, setActiveTab] = useState("account")
  const { organization } = useOrganization()

  useEffect(() => {
    if (tabParam && ["account", "business", "branches", "businesses", "billing", "notifications"].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  if (!organization) return null

  const isOwner = organization.role === "owner"
  const branchCount = organization.branches.length
  const warehouseCount = organization.branches.reduce((sum, branch) => sum + branch.warehouses.length, 0)

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950"><Store className="size-5 text-emerald-600" /></div><p className="mt-4 text-sm text-muted-foreground">{t("businessNameLabel")}</p><p className="mt-1 truncate text-lg font-bold">{organization.name}</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950"><Landmark className="size-5 text-blue-600" /></div><p className="mt-4 text-sm text-muted-foreground">{t("slugLabel")}</p><p className="mt-1 truncate text-lg font-bold">{organization.slug}</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950"><MapPin className="size-5 text-violet-600" /></div><p className="mt-4 text-sm text-muted-foreground">{t("branchCount")}</p><p className="mt-1 text-lg font-bold">{branchCount}</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950"><Building2 className="size-5 text-amber-600" /></div><p className="mt-4 text-sm text-muted-foreground">{t("warehouseCount")}</p><p className="mt-1 text-lg font-bold">{warehouseCount}</p></CardContent></Card>
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="h-10 w-full sm:w-fit justify-start overflow-x-auto">
          <TabsTrigger value="account"><User className="size-4" /> {t("tabAccount")}</TabsTrigger>
          {isOwner && <TabsTrigger value="business"><Store className="size-4" /> {t("tabBusiness")}</TabsTrigger>}
          {isOwner && <TabsTrigger value="branches"><Landmark className="size-4" /> {t("tabBranches")}</TabsTrigger>}
          <TabsTrigger value="businesses"><Building2 className="size-4" /> {t("tabBusinesses")}</TabsTrigger>
          <TabsTrigger value="billing"><CreditCard className="size-4" /> {t("tabBilling")}</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="size-4" /> {t("tabNotifications")}</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-6">
          <AccountTab />
        </TabsContent>
        {isOwner && (
          <TabsContent value="business" className="mt-6">
            <BusinessTab />
          </TabsContent>
        )}
        {isOwner && (
          <TabsContent value="branches" className="mt-6">
            <BranchesTab />
          </TabsContent>
        )}
        <TabsContent value="businesses" className="mt-6">
          <BusinessesTab />
        </TabsContent>
        <TabsContent value="billing" className="mt-6">
          <BillingTab />
        </TabsContent>
        <TabsContent value="notifications" className="mt-6">
          <NotificationsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}