"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { signOut } from "@/lib/auth-client"
import { useRouter } from "@/i18n/navigation"
import { showError, showSuccess } from "@/lib/toast-handler"
import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageCircle,
  MoreVertical,
  Server,
  Settings,
  ShieldAlert,
  TicketPercent,
  User as UserIcon,
} from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { isSuperAdminEmail } from "@/lib/super-admin"

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const t = useTranslations("NavUser")
  const [isSigningOut, setIsSigningOut] = useState(false)
  const isSuperAdmin = isSuperAdminEmail(user.email)

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await signOut()
      localStorage.removeItem("kedai-ku-organization-id")
      localStorage.removeItem("kedai-ku-branch-id")
      localStorage.removeItem("kedai-ku-warehouse-id")
      sessionStorage.removeItem("kedai-ku-impersonating")
      showSuccess("Berhasil keluar")
      router.replace("/sign-in")
    } catch (error) {
      console.error("Sign out error:", error)
      showError("Gagal keluar")
    } finally {
      setIsSigningOut(false)
    }
  }

  const userInitials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase()
    : user.email ? user.email[0].toUpperCase() : "SA"

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg font-bold">{userInitials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              </div>
              <MoreVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1.5 py-2 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg font-bold">{userInitials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-bold">{user.name}</span>
                  <span className="text-muted-foreground truncate text-xs font-mono">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {isSuperAdmin ? (
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="flex items-center gap-2.5 cursor-pointer text-xs"
                  onSelect={() => router.push("/dashboard/admin?tab=overview")}
                >
                  <LayoutDashboard className="size-4 text-emerald-600" />
                  <span>Platform Overview</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2.5 cursor-pointer text-xs"
                  onSelect={() => router.push("/dashboard/admin?tab=settings")}
                >
                  <Settings className="size-4 text-emerald-600" />
                  <span>Pengaturan Platform</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2.5 cursor-pointer text-xs"
                  onSelect={() => router.push("/dashboard/admin?tab=invoices")}
                >
                  <CreditCard className="size-4 text-blue-600" />
                  <span>Midtrans Invoices</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2.5 cursor-pointer text-xs"
                  onSelect={() => router.push("/dashboard/admin?tab=broadcast")}
                >
                  <Megaphone className="size-4 text-amber-600" />
                  <span>Broadcast Pengumuman</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2.5 cursor-pointer text-xs"
                  onSelect={() => router.push("/dashboard/admin?tab=promos")}
                >
                  <TicketPercent className="size-4 text-violet-600" />
                  <span>Kupon Promo Diskon</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2.5 cursor-pointer text-xs"
                  onSelect={() => router.push("/dashboard/admin?tab=audit")}
                >
                  <ShieldAlert className="size-4 text-red-600" />
                  <span>Audit Log Keamanan</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2.5 cursor-pointer text-xs"
                  onSelect={() => router.push("/dashboard/admin?tab=health")}
                >
                  <Server className="size-4 text-purple-600" />
                  <span>Server & Database</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2.5 cursor-pointer text-xs text-emerald-700 dark:text-emerald-400 font-medium"
                  onSelect={() => {
                    window.open(
                      "https://wa.me/6285353111025?text=Halo%20Developer%20%26%20Support%20Kedai-Ku%2C%20saya%20butuh%20bantuan%20terkait%20aplikasi.",
                      "_blank",
                      "noopener,noreferrer"
                    );
                  }}
                >
                  <MessageCircle className="size-4 text-emerald-600" />
                  <span>WhatsApp Developer</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            ) : (
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="flex items-center gap-2.5 cursor-pointer text-xs"
                  onSelect={() => router.push("/dashboard/settings?tab=account")}
                >
                  <UserIcon className="size-4" />
                  <span>{t("account")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2.5 cursor-pointer text-xs"
                  onSelect={() => router.push("/dashboard/settings?tab=billing")}
                >
                  <CreditCard className="size-4" />
                  <span>{t("billing")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2.5 cursor-pointer text-xs"
                  onSelect={() => router.push("/dashboard/settings?tab=notifications")}
                >
                  <Megaphone className="size-4" />
                  <span>{t("notifications")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2.5 cursor-pointer text-xs text-emerald-700 dark:text-emerald-400 font-medium"
                  onSelect={() => {
                    window.open(
                      "https://wa.me/6285353111025?text=Halo%20Developer%20%26%20Support%20Kedai-Ku%2C%20saya%20butuh%20bantuan%20terkait%20aplikasi.",
                      "_blank",
                      "noopener,noreferrer"
                    );
                  }}
                >
                  <MessageCircle className="size-4 text-emerald-600" />
                  <span>WhatsApp Support</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut} className="text-xs cursor-pointer text-red-600 focus:text-red-600">
              <LogOut className="size-4 mr-1.5" />
              {isSigningOut ? t("signingOut") : t("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
