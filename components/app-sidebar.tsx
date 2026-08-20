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
  FileBarChart,
  Landmark,
  LayoutDashboard,
  PackageSearch,
  Percent,
  QrCode,
  ReceiptText,
  Settings,
  ShoppingCart,
  Store,
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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations("Sidebar")
  const pathname = usePathname()
  const { data: session } = useSession()
  const { organization } = useOrganization()
  const isOwner = !organization || organization.role === "owner"
  const allowed = new Set(isOwner ? ["all"] : ["dashboard:read", "pos:write", "sales:read", "sales:write", "customers:read", "customers:write", "inventory:read", "selfOrder:manage"])
  const itemPermission: Record<string, string> = {
    "/dashboard": "dashboard:read", "/dashboard/pos": "pos:write", "/dashboard/sales": "sales:read",
    "/dashboard/kitchen": "sales:read", "/dashboard/reservations": "sales:read", "/dashboard/self-order": "sales:read",
    "/dashboard/products": "inventory:read", "/dashboard/inventory": "inventory:read",
    "/dashboard/customers": "customers:read", "/dashboard/cashiers": "users:manage", "/dashboard/reports": "reports:read",
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
        [t("pengaturan"), "/dashboard/settings", Settings],
      ],
    },
  ]

  const visibleGroups = groups.map((group) => ({ ...group, items: group.items.filter(([, href]) => allowed.has("all") || allowed.has(itemPermission[href] || "")) })).filter((group) => group.items.length)
  const userData = session?.user
    ? { name: session.user.name || t("user"), email: session.user.email, avatar: session.user.image || "" }
    : { name: t("user"), email: "", avatar: "" }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="border-b border-sidebar-border/70">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" className="h-14 data-[slot=sidebar-menu-button]:!p-2">
              <Link href="/dashboard">
                <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                  <Store className="size-5" />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-base font-bold tracking-tight">{t("appName")}</span>
                  <span className="truncate text-xs text-muted-foreground">{t("appTagline")}</span>
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
                  const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href)
                  return (
                    <SidebarMenuItem key={href}>
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