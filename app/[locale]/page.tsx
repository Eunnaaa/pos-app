import { notFound } from "next/navigation"
import { hasLocale } from "next-intl"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { routing } from "@/i18n/routing"
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
  Star,
  Store,
  UsersRound,
  WifiOff,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
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

const reviews = [
  {
    nameKey: "review1Name",
    businessKey: "review1Business",
    quoteKey: "review1Quote",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80",
    initials: "RA",
  },
  {
    nameKey: "review2Name",
    businessKey: "review2Business",
    quoteKey: "review2Quote",
    image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=160&auto=format&fit=crop&q=80",
    initials: "DS",
  },
  {
    nameKey: "review3Name",
    businessKey: "review3Business",
    quoteKey: "review3Quote",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&auto=format&fit=crop&q=80",
    initials: "BP",
  },
] as const

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations({ locale, namespace: "Landing" })
  const trustItems = [t("trust1"), t("trust2"), t("trust3")] as const

  return (
    <main className="min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-x-0 top-0 -z-10 h-[680px] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_38%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.10),transparent_32%)]" />
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
            <Store className="size-5" />
          </span>
          <span className="text-xl font-bold tracking-tight">Kedai-Ku</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
          <Button variant="ghost" asChild>
            <Link href="/sign-in">{t("signIn")}</Link>
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" asChild>
            <Link href="/sign-up">{t("getStarted")}</Link>
          </Button>
        </div>
      </nav>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            <Cloud className="size-4" /> {t("badge")}
          </div>
          <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">
            {t("heroTitle1")} <span className="text-emerald-600">{t("heroTitle2")}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">{t("heroDesc")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="h-12 bg-emerald-600 px-7 text-base hover:bg-emerald-700" asChild>
              <Link href="/sign-up">
                {t("ctaTry")} <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-7 text-base" asChild>
              <Link href="/dashboard">{t("ctaDemo")}</Link>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {trustItems.map((item) => (
              <span key={item} className="flex items-center gap-1.5">
                <Check className="size-4 text-emerald-600" />
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-8 -z-10 rounded-full bg-emerald-500/10 blur-3xl" />
          <DemoCard />
        </div>
      </section>

      {/* Features Section */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-600">{t("sectionLabel")}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("sectionTitle")}</h2>
            <p className="mt-4 text-muted-foreground">{t("sectionDesc")}</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map(([Icon, titleKey, descKey]) => (
              <Card key={titleKey} className="border-border/70 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <CardContent className="p-6">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold">{t(titleKey)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(descKey)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Owner Reviews / Testimonials Section */}
      <section className="py-20 bg-background border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-600">
              {t("reviewsLabel")}
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              {t("reviewsTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground">
              {t("reviewsDesc")}
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {reviews.map((r, i) => (
              <Card key={i} className="flex flex-col justify-between border-border/80 bg-card p-6 shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-200">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 bg-amber-500/15 px-3 py-1 rounded-full border border-amber-500/30">
                      <div className="flex items-center gap-0.5">
                        <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
                          <defs>
                            <linearGradient id="starFourFifths" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="80%" stopColor="#f59e0b" />
                              <stop offset="80%" stopColor="#ffffff" />
                              <stop offset="100%" stopColor="#ffffff" />
                            </linearGradient>
                          </defs>
                        </svg>
                        {[...Array(4)].map((_, idx) => (
                          <Star
                            key={idx}
                            className="size-4"
                            fill="#f59e0b"
                            color="#f59e0b"
                            strokeWidth={1.5}
                          />
                        ))}
                        <Star
                          className="size-4"
                          fill="url(#starFourFifths)"
                          color="#f59e0b"
                          strokeWidth={1.5}
                        />
                      </div>
                      <span className="text-xs font-black text-amber-700 dark:text-amber-300">4.9</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-semibold border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/70">
                      ✓ Verified Owner
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground italic">
                    &ldquo;{t(r.quoteKey)}&rdquo;
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t flex items-center gap-3.5">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-full border-2 border-emerald-500/30 shadow-xs bg-muted">
                    <img
                      src={r.image}
                      alt={t(r.nameKey)}
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{t(r.nameKey)}</p>
                    <p className="text-xs text-muted-foreground truncate">{t(r.businessKey)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6">
        <ShieldCheck className="mx-auto size-10 text-emerald-600" />
        <h2 className="mt-5 text-3xl font-bold">{t("ctaTitle")}</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{t("ctaDesc")}</p>
        <Button size="lg" className="mt-7 bg-emerald-600 hover:bg-emerald-700" asChild>
          <Link href="/sign-up">
            {t("ctaCreate")} <ArrowRight />
          </Link>
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <span>{t("footerRights")}</span>
          <div className="flex items-center gap-4">
            <Link href="/help" className="hover:text-foreground hover:underline">
              {t("help")}
            </Link>
            <Link href="/terms" className="hover:text-foreground hover:underline">
              {t("terms")}
            </Link>
            <Link href="/privacy" className="hover:text-foreground hover:underline">
              {t("privacy")}
            </Link>
            <span>{t("footerTagline")}</span>
          </div>
        </div>
      </footer>
    </main>
  )
}