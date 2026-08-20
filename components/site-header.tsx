"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { Building2, ChevronsUpDown, Wifi } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { NotificationBell } from "@/components/notification-bell"
import { useOrganization } from "@/components/kasir/organization-provider"
import { LanguageToggle } from "@/components/language-toggle"
import { showSuccess } from "@/lib/toast-handler"

const titles: Record<string, string> = {
  dashboard: "Dashboard",
  pos: "Kasir / POS",
  sales: "Transaksi Penjualan",
  products: "Manajemen Produk",
  inventory: "Inventory & Stok",
  purchases: "Pembelian",
  suppliers: "Supplier",
  customers: "Customer CRM",
  loyalty: "Loyalty & Membership",
  promotions: "Promosi",
  kitchen: "Kitchen Display",
  reservations: "Reservasi",
  finance: "Keuangan",
  employees: "Karyawan",
  branches: "Cabang & Gudang",
  reports: "Laporan Bisnis",
  ai: "AI Insights",
  settings: "Pengaturan",
}

export function SiteHeader() {
  const pathname = usePathname()
  const t = useTranslations("Header")
  const { organization, branch, selectBranch, selectAllBranches } = useOrganization()
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])
  const segment = pathname.split("/").filter(Boolean).at(-1) || "dashboard"
  const title = titles[segment] || "Kasir-Ku"

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex w-full items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">{new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date())}</p>
        </div>
        <Badge variant="outline" className={`hidden gap-1.5 md:flex ${online ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"}`}>
          <Wifi className="size-3" /> {online ? t("online") : t("offline")}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="hidden min-w-40 justify-between md:flex">
              <Building2 className="mr-1.5 size-4 text-muted-foreground" />
              <span className="truncate">{branch?.name || t("allBranches")}</span>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{organization?.name || t("selectBranch")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => selectAllBranches()}>
              <Building2 className="mr-2 size-4 text-muted-foreground" />
              {t("allBranches")}{!branch ? " ✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {organization?.branches.map((item) => (
              <DropdownMenuItem key={item.id} onClick={() => { selectBranch(item.id); showSuccess("Cabang diganti") }}>
                {item.name}{item.id === branch?.id ? " ✓" : ""}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <LanguageToggle />
        <NotificationBell />
        <ThemeToggle />
      </div>
    </header>
  )
}
