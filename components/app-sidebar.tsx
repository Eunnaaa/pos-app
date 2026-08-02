"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "@/lib/auth-client"
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
  ReceiptText,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  UserRoundCog,
  UsersRound,
  Warehouse,
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

const groups = [
  {
    label: "Operasional",
    items: [
      ["Dashboard", "/dashboard", LayoutDashboard],
      ["Kasir / POS", "/dashboard/pos", ShoppingCart],
      ["Transaksi", "/dashboard/sales", ReceiptText],
      ["Kitchen Display", "/dashboard/kitchen", ChefHat],
      ["Reservasi", "/dashboard/reservations", CalendarDays],
    ],
  },
  {
    label: "Produk & Stok",
    items: [
      ["Produk", "/dashboard/products", PackageSearch],
      ["Inventory", "/dashboard/inventory", Boxes],
      ["Pembelian", "/dashboard/purchases", Truck],
      ["Supplier", "/dashboard/suppliers", Warehouse],
    ],
  },
  {
    label: "Pelanggan",
    items: [
      ["Customer CRM", "/dashboard/customers", ContactRound],
      ["Loyalty", "/dashboard/loyalty", UsersRound],
      ["Promosi", "/dashboard/promotions", Percent],
    ],
  },
  {
    label: "Manajemen",
    items: [
      ["Keuangan", "/dashboard/finance", Landmark],
      ["Karyawan", "/dashboard/employees", UserRoundCog],
      ["Cabang", "/dashboard/branches", Building2],
      ["Laporan", "/dashboard/reports", FileBarChart],
      ["AI Insights", "/dashboard/ai", BrainCircuit],
      ["Pengaturan", "/dashboard/settings", Settings],
    ],
  },
] as const

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const userData = session?.user
    ? { name: session.user.name || "Pengguna", email: session.user.email, avatar: session.user.image || "" }
    : { name: "Pengguna", email: "", avatar: "" }

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
                  <span className="truncate text-base font-bold tracking-tight">Kasir-Ku</span>
                  <span className="truncate text-xs text-muted-foreground">Smart Point of Sale</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
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
