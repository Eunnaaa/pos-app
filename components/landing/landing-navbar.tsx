"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { LogIn, Menu, Store, UserPlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageToggle } from "@/components/language-toggle"

export function LandingNavbar() {
  const t = useTranslations("Landing")
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/90 backdrop-blur-md transition-all">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20 group-hover:scale-105 transition-transform">
            <Store className="size-4.5" />
          </span>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight leading-none" suppressHydrationWarning>
              Kedai-Ku
            </span>
            <span className="text-[10px] text-muted-foreground font-medium tracking-wide">
              Smart POS
            </span>
          </div>
        </Link>

        {/* Desktop Actions Toolbar */}
        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
          <div className="h-4 w-px bg-border/60 mx-1" />
          <Button variant="ghost" size="sm" className="font-medium" asChild>
            <Link href="/sign-in">{t("signIn")}</Link>
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm" asChild>
            <Link href="/sign-up">{t("getStarted")}</Link>
          </Button>
        </div>

        {/* Mobile Hamburger Button Trigger */}
        <div className="flex items-center gap-1.5 md:hidden">
          <ThemeToggle />
          <LanguageToggle />
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-sm active:scale-95 touch-manipulation cursor-pointer hover:bg-muted transition-all"
            aria-label="Toggle Menu"
            aria-expanded={open}
          >
            {open ? <X className="size-5 text-foreground" /> : <Menu className="size-5 text-foreground" />}
          </button>
        </div>
      </nav>

      {/* Mobile Dropdown Menu with Instant Response */}
      {open && (
        <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-xl px-4 py-5 shadow-xl animate-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-3">
            <Button
              variant="outline"
              size="lg"
              className="w-full justify-center gap-2 h-12 text-base font-semibold"
              asChild
            >
              <Link href="/sign-in" onClick={() => setOpen(false)}>
                <LogIn className="size-4" />
                <span>{t("signIn")}</span>
              </Link>
            </Button>
            <Button
              size="lg"
              className="w-full justify-center gap-2 h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
              asChild
            >
              <Link href="/sign-up" onClick={() => setOpen(false)}>
                <UserPlus className="size-4" />
                <span>{t("getStarted")}</span>
              </Link>
            </Button>
            <p className="text-[11px] text-center text-muted-foreground pt-1">
              © 2026 Kedai-Ku · Cloud POS Indonesia
            </p>
          </div>
        </div>
      )}
    </header>
  )
}
