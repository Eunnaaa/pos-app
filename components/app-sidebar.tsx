"use client"

import { useTranslations } from "next-intl"
import { useSession } from "@/lib/auth-client"
import { useOrganization } from "@/components/kasir/organization-provider"
import {
  Boxes,
  BrainCircuit,
  Building2,
  CalendarDays,
  ChefHat,
  ContactRound,
  Crown,
  FileBarChart,
  Landmark,
  LayoutDashboard,
  Megaphone,
  PackageSearch,
  Percent,
  QrCode,
  ReceiptText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Store,
  TicketPercent,
  Truck,
  UserRoundCog,
  UsersRound,
  Warehouse,
  type LucideIcon,
} from "lucide-react"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Link, usePathname } from "@/i18n/navigation"
import { useSearchParams } from "next/navigation"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations("Sidebar")
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get("tab") || "overview"
  const { data: session } = useSession()
  const { organization, isSuperAdmin } = useOrganization()
  const isOwner = !organization || organization.role === "owner"
  const allowed = new Set(isOwner ? ["all"] : ["dashboard:read", "pos:write", "sales:read", "sales:write", "customers:read", "customers:write", "inventory:read", "selfOrder:manage"])
  const itemPermission: Record<string, string> = {
    "/dashboard": "dashboard:read",
    "/dashboard/pos": "pos:write",
    "/dashboard/sales": "sales:read",
    "/dashboard/kitchen": "sales:read",
    "/dashboard/reservations": "sales:read",
    "/dashboard/self-order": "sales:read",
    "/dashboard/products": "inventory:read",
    "/dashboard/inventory": "inventory:read",
    "/dashboard/purchases": "purchases:read",
    "/dashboard/suppliers": "suppliers:read",
    "/dashboard/customers": "customers:read",
    "/dashboard/loyalty": "customers:read",
    "/dashboard/promotions": "sales:read",
    "/dashboard/finance": "finance:read",
    "/dashboard/employees": "employees:manage",
    "/dashboard/branches": "branches:manage",
    "/dashboard/reports": "reports:read",
    "/dashboard/ai": "dashboard:read",
    "/dashboard/cashiers": "users:manage",
    "/dashboard/subscription": "dashboard:read",
    "/dashboard/admin": "settings:manage",
    "/dashboard/settings": "settings:manage",
  }

  const groups: { label: string; items: [string, string, LucideIcon][] }[] = [
    {
      label: t("groupOperational"),
      items: [
        [t("dashboard"), "/dashboard", LayoutDashboard],
        [t("kasir"), "/dashboard/pos", ShoppingCart],
        [t("transaksi"), "/dashboard/sales", ReceiptText],
        [t("kitchen"), "/dashboard/kitchen", ChefHat],
        [t("reservasi"), "/dashboard/reservations", CalendarDays],
        [t("selfOrder"), "/dashboard/self-order", QrCode],
      ],
    },
    {
      label: t("groupProducts"),
      items: [
        [t("produk"), "/dashboard/products", PackageSearch],
        [t("inventory"), "/dashboard/inventory", Boxes],
        [t("pembelian"), "/dashboard/purchases", Truck],
        [t("supplier"), "/dashboard/suppliers", Warehouse],
      ],
    },
    {
      label: t("groupCustomers"),
      items: [
        [t("customerCrm"), "/dashboard/customers", ContactRound],
        [t("loyalty"), "/dashboard/loyalty", UsersRound],
        [t("promosi"), "/dashboard/promotions", Percent],
      ],
    },
    {
      label: t("groupManagement"),
      items: [
        [t("keuangan"), "/dashboard/finance", Landmark],
        [t("karyawan"), "/dashboard/employees", UserRoundCog],
        [t("cabang"), "/dashboard/branches", Building2],
        [t("laporan"), "/dashboard/reports", FileBarChart],
        [t("aiInsights"), "/dashboard/ai", BrainCircuit],
        [t("cashier"), "/dashboard/cashiers", UsersRound],
        [t("langganan"), "/dashboard/subscription", Crown],
        [t("masterAdmin"), "/dashboard/admin", ShieldCheck],
        [t("pengaturan"), "/dashboard/settings", Settings],
      ],
    },
  ]

  const superAdminGroups: { label: string; items: [string, string, LucideIcon][] }[] = [
    {
      label: "Platform Master Control",
      items: [
        ["Platform Overview", "/dashboard/admin?tab=overview", LayoutDashboard],
        ["Tenant & Merchant", "/dashboard/admin?tab=tenants", Building2],
        ["Midtrans Invoices", "/dashboard/admin?tab=invoices", ReceiptText],
        ["Broadcast Pengumuman", "/dashboard/admin?tab=broadcast", Megaphone],
        ["Kupon Promo & Diskon", "/dashboard/admin?tab=promos", TicketPercent],
        ["Audit Log Keamanan", "/dashboard/admin?tab=audit", ShieldAlert],
        ["Server & Database", "/dashboard/admin?tab=health", ShieldCheck],
        ["Pengaturan Platform", "/dashboard/admin?tab=settings", Settings],
      ],
    },
  ]

  const visibleGroups = isSuperAdmin
    ? superAdminGroups
    : groups
        .map((group) => ({
          ...group,
          items: group.items.filter(([, href]) => {
            if (href === "/dashboard/admin") {
              return false
            }
            return allowed.has("all") || allowed.has(itemPermission[href] || "")
          }),
        }))
        .filter((group) => group.items.length)

  const userData = session?.user
    ? {
        name: isSuperAdmin ? "Platform Super Admin" : session.user.name || t("user"),
        email: session.user.email,
        avatar: session.user.image || "",
      }
    : { name: t("user"), email: "", avatar: "" }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="border-b border-sidebar-border/70">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" className="h-14 data-[slot=sidebar-menu-button]:!p-2">
              <Link href={isSuperAdmin ? "/dashboard/admin?tab=overview" : "/dashboard"}>
                <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                  {isSuperAdmin ? <ShieldCheck className="size-5" /> : <Store className="size-5" />}
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-base font-bold tracking-tight">
                    {isSuperAdmin ? "Kedai-Ku Master" : t("appName")}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {isSuperAdmin ? "Super Admin Portal" : t("appTagline")}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(([title, href, Icon]) => {
                  const active = isSuperAdmin
                    ? href.includes(`tab=${currentTab}`) || (href.endsWith("tab=overview") && currentTab === "overview")
                    : href === "/dashboard"
                      ? pathname === href
                      : pathname.startsWith(href)

                  return (
                    <SidebarMenuItem key={`${title}-${href}`}>
                      <SidebarMenuButton asChild tooltip={title} isActive={active}>
                        <Link href={href}>
                          <Icon />
                          <span>{title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/70">
        <NavUser user={userData} />
      </SidebarFooter>
    </Sidebar>
  )
}
