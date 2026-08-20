"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  Cloud,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  Store,
  UsersRound,
  WifiOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"
import { DemoCard } from "@/components/landing/demo-card"
import { LanguageToggle } from "@/components/language-toggle"

const features = [
  [ShoppingCart, "featurePos", "featurePosDesc"],
  [PackageCheck, "featureInventory", "featureInventoryDesc"],
  [BarChart3, "featureReports", "featureReportsDesc"],
  [UsersRound, "featureCrm", "featureCrmDesc"],
  [WifiOff, "featureOffline", "featureOfflineDesc"],
  [BrainCircuit, "featureAi", "featureAiDesc"],
] as const

export default function Home() {
  const t = useTranslations("Landing")
  const trustItems = [t("trust1"), t("trust2"), t("trust3")] as const

  return (
    <main className="min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-x-0 top-0 -z-10 h-[680px] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_38%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.10),transparent_32%)]" />
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"><Store className="size-5" /></span><span className="text-xl font-bold tracking-tight">Kasir-Ku</span></Link>
        <div className="flex items-center gap-2"><ThemeToggle /><LanguageToggle /><Button variant="ghost" asChild><Link href="/sign-in">{t("signIn")}</Link></Button><Button className="bg-emerald-600 hover:bg-emerald-700" asChild><Link href="/sign-up">{t("getStarted")}</Link></Button></div>
      </nav>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"><Cloud className="size-4" /> {t("badge")}</div>
          <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">{t("heroTitle1")} <span className="text-emerald-600">{t("heroTitle2")}</span></h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">{t("heroDesc")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button size="lg" className="h-12 bg-emerald-600 px-7 text-base hover:bg-emerald-700" asChild><Link href="/sign-up">{t("ctaTry")} <ArrowRight /></Link></Button><Button size="lg" variant="outline" className="h-12 px-7 text-base" asChild><Link href="/dashboard">{t("ctaDemo")}</Link></Button></div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">{trustItems.map((item) => <span key={item} className="flex items-center gap-1.5"><Check className="size-4 text-emerald-600" />{item}</span>)}</div>
        </div>
        <div className="relative">
          <div className="absolute -inset-8 -z-10 rounded-full bg-emerald-500/10 blur-3xl" />
          <DemoCard />
        </div>
      </section>

      <section className="border-y bg-muted/30"><div className="mx-auto max-w-7xl px-4 py-20 sm:px-6"><div className="mx-auto max-w-2xl text-center"><p className="text-sm font-semibold uppercase tracking-widest text-emerald-600">{t("sectionLabel")}</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("sectionTitle")}</h2><p className="mt-4 text-muted-foreground">{t("sectionDesc")}</p></div><div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map(([Icon, titleKey, descKey]) => <Card key={titleKey} className="border-border/70 shadow-sm transition hover:-translate-y-1 hover:shadow-md"><CardContent className="p-6"><span className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Icon className="size-5" /></span><h3 className="mt-5 text-lg font-bold">{t(titleKey)}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(descKey)}</p></CardContent></Card>)}</div></div></section>

      <section className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6"><ShieldCheck className="mx-auto size-10 text-emerald-600" /><h2 className="mt-5 text-3xl font-bold">{t("ctaTitle")}</h2><p className="mx-auto mt-3 max-w-xl text-muted-foreground">{t("ctaDesc")}</p><Button size="lg" className="mt-7 bg-emerald-600 hover:bg-emerald-700" asChild><Link href="/sign-up">{t("ctaCreate")} <ArrowRight /></Link></Button></section>
      <footer className="border-t"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6"><span>{t("footerRights")}</span><div className="flex items-center gap-4"><Link href="/help" className="hover:text-foreground hover:underline">{t("help")}</Link><Link href="/terms" className="hover:text-foreground hover:underline">{t("terms")}</Link><Link href="/privacy" className="hover:text-foreground hover:underline">{t("privacy")}</Link><span>{t("footerTagline")}</span></div></div></footer>
    </main>
  )
}