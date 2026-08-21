import { Link } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { BarChart3, Boxes, Check, ShieldCheck, Store } from "lucide-react"
import { LanguageToggle } from "@/components/language-toggle"

export function AuthLayout({ children, title, description }: { children: React.ReactNode; title: string; description: string }) {
  const t = useTranslations("AuthLayout")
  const features = [
    [BarChart3, t("featureRealTime")],
    [Boxes, t("featureStock")],
    [ShieldCheck, t("featureSecurity")],
    [Check, t("featureSetup")],
  ] as const

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-emerald-950 p-10 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.25),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.18),transparent_35%)]" />
        <Link href="/" className="relative flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500"><Store className="size-5" /></span><span className="text-xl font-bold" suppressHydrationWarning>Kedai-Ku</span></Link>
        <div className="relative my-auto max-w-xl"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">{t("smartPos")}</p><h1 className="mt-5 text-4xl font-black leading-tight">{t("headline")}</h1><p className="mt-5 text-lg leading-relaxed text-emerald-100/70">{t("subheadline")}</p><div className="mt-10 grid gap-4 sm:grid-cols-2">{features.map(([Icon, label]) => { const FeatureIcon = Icon as typeof BarChart3; return <div key={label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"><FeatureIcon className="size-5 text-emerald-300" /><span className="text-sm font-medium">{label}</span></div> })}</div></div>
        <p className="relative text-xs text-emerald-100/50">{t("footer")}</p>
      </section>
      <section className="relative flex items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="absolute right-4 top-4"><LanguageToggle /></div>
        <div className="w-full max-w-md">
          <Link href="/" className="mb-10 flex items-center justify-center gap-2 lg:hidden"><span className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white"><Store className="size-5" /></span><span className="text-xl font-bold" suppressHydrationWarning>Kedai-Ku</span></Link>
          <h2 className="text-3xl font-bold tracking-tight">{title}</h2><p className="mt-2 text-muted-foreground">{description}</p>
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </main>
  )
}