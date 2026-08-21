"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Bell, Building2, CreditCard, Landmark, MapPin, MessageCircle, Store, User } from "lucide-react"
import { Button } from "@/components/ui/button"
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          asChild
          variant="outline"
          className="gap-2 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950 font-medium text-xs sm:text-sm shadow-2xs"
        >
          <a
            href="https://wa.me/6285353111025?text=Halo%20Developer%20Kedai-Ku%2C%20saya%20membutuhkan%20bantuan%20support%20aplikasi."
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="size-4 text-emerald-600" /> WhatsApp Support
          </a>
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950"><Store className="size-5 text-emerald-600" /></div><p className="mt-4 text-sm text-muted-foreground">{t("businessNameLabel")}</p><p className="mt-1 truncate text-lg font-bold">{organization.name}</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950"><Landmark className="size-5 text-blue-600" /></div><p className="mt-4 text-sm text-muted-foreground">{t("slugLabel")}</p><p className="mt-1 truncate text-lg font-bold">{organization.slug}</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950"><MapPin className="size-5 text-violet-600" /></div><p className="mt-4 text-sm text-muted-foreground">{t("branchCount")}</p><p className="mt-1 text-lg font-bold">{branchCount}</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950"><Building2 className="size-5 text-amber-600" /></div><p className="mt-4 text-sm text-muted-foreground">{t("warehouseCount")}</p><p className="mt-1 text-lg font-bold">{warehouseCount}</p></CardContent></Card>
      </section>

      {/* WhatsApp Developer Support Banner */}
      <Card className="border-emerald-200/80 bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-background p-5 dark:border-emerald-900/60 dark:from-emerald-950/40 dark:via-teal-950/20 shadow-2xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
              <MessageCircle className="size-6" />
            </div>
            <div>
              <p className="font-bold text-foreground">Hubungi Developer &amp; WhatsApp Support</p>
              <p className="text-xs text-muted-foreground">
                Butuh bantuan teknis, custom request, atau integrasi baru? Chat langsung dengan developer di{" "}
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">+62 853-5311-1025</span>.
              </p>
            </div>
          </div>
          <Button asChild className="shrink-0 bg-emerald-600 hover:bg-emerald-700 shadow-sm gap-2">
            <a
              href="https://wa.me/6285353111025?text=Halo%20Developer%20Kedai-Ku%2C%20saya%20membutuhkan%20bantuan%20support%20aplikasi."
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="size-4" /> Hubungi Developer (+62 853-5311-1025)
            </a>
          </Button>
        </div>
      </Card>

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