"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp } from "lucide-react"

const SALES_TARGET = 4_250_000
const ORDERS_TARGET = 47
const CUSTOMERS_TARGET = 23
const PROFIT_TARGET = 1_820_000

const CHART_RAW_DATA = [
  { dayKey: "dayMon", value: 1_850_000 },
  { dayKey: "dayTue", value: 2_420_000 },
  { dayKey: "dayWed", value: 1_980_000 },
  { dayKey: "dayThu", value: 2_870_000 },
  { dayKey: "dayFri", value: 2_560_000 },
  { dayKey: "daySat", value: 3_640_000 },
  { dayKey: "daySun", value: 3_310_000 },
] as const

const CHART_W = 700
const CHART_H = 150
const TOTAL_H = 180
const BAR_W = 44
const SLOT_W = CHART_W / CHART_RAW_DATA.length

const rupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`

function formatShort(value: number, millionSuffix: string, thousandSuffix: string) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")}${millionSuffix}`
  if (value >= 1_000) return `${Math.round(value / 1_000)}${thousandSuffix}`
  return String(value)
}

function useCountUp(target: number, duration = 1400): number {
  const [value, setValue] = useState(target)
  const frameRef = useRef<number | undefined>(undefined)
  const startRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    setValue(0)
    startRef.current = undefined
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
    const animate = (timestamp: number) => {
      if (startRef.current === undefined) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      setValue(Math.round(easeOut(progress) * target))
      if (progress < 1) frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [target, duration])

  return value
}

function AnimatedRupiah({ target, className }: { target: number; className?: string }) {
  const value = useCountUp(target)
  return <span className={className}>{rupiah(value)}</span>
}

function AnimatedNumber({ target, className }: { target: number; className?: string }) {
  const value = useCountUp(target)
  return <span className={className}>{value.toLocaleString("id-ID")}</span>
}

function AnimatedChart() {
  const t = useTranslations("Landing")
  const [progress, setProgress] = useState(1)
  const [hovered, setHovered] = useState<number | null>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const [pathLen, setPathLen] = useState(0)

  useEffect(() => {
    setProgress(0)
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
    let start: number | undefined
    let frame: number
    const animate = (ts: number) => {
      if (start === undefined) start = ts
      const p = Math.min((ts - start) / 1600, 1)
      setProgress(easeOut(p))
      if (p < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (pathRef.current) setPathLen(pathRef.current.getTotalLength())
  }, [])

  const maxVal = Math.max(...CHART_RAW_DATA.map((d) => d.value))
  const millionUnit = t("unitMillion")
  const thousandUnit = t("unitThousand")

  const bars = CHART_RAW_DATA.map((d, i) => {
    const x = i * SLOT_W + (SLOT_W - BAR_W) / 2
    const h = (d.value / maxVal) * CHART_H * progress
    const y = CHART_H - h
    const cx = x + BAR_W / 2
    return {
      day: t(d.dayKey),
      x,
      y,
      h,
      cx,
      value: Math.round(d.value * progress),
      raw: d.value,
    }
  })

  const linePath = bars.map((b, i) => `${i === 0 ? "M" : "L"} ${b.cx} ${b.y}`).join(" ")
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((g) => CHART_H * (1 - g))
  const tooltipX = hovered !== null ? Math.max(42, Math.min(CHART_W - 42, bars[hovered].cx)) : 0

  return (
    <svg viewBox={`0 0 ${CHART_W} ${TOTAL_H}`} className="w-full" role="img" aria-label={t("demoChartAria")}>
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        <linearGradient id="barGradHover" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {gridLines.map((y, i) => (
        <line key={i} x1={0} y1={y} x2={CHART_W} y2={y} stroke="currentColor" strokeWidth={0.5} className="text-muted-foreground/15" strokeDasharray="2 4" />
      ))}

      {/* Area under the line */}
      {progress > 0.05 && (
        <path
          d={`${linePath} L ${bars[bars.length - 1].cx} ${CHART_H} L ${bars[0].cx} ${CHART_H} Z`}
          fill="url(#areaGrad)"
          style={{ opacity: progress }}
        />
      )}

      {/* Bars */}
      {bars.map((b, i) => (
        <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} className="cursor-pointer">
          <rect x={b.x} width={BAR_W} y={CHART_H} height={0} fill="transparent" />
          <rect
            x={b.x}
            y={b.y}
            width={BAR_W}
            height={b.h}
            rx={5}
            fill={hovered === i ? "url(#barGradHover)" : "url(#barGrad)"}
            className="transition-all duration-150"
          />
          {/* Value label on top of bar */}
          {progress > 0.5 && b.h > 12 && (
            <text x={b.cx} y={b.y - 6} textAnchor="middle" className="fill-foreground text-[10px] font-semibold transition-opacity duration-300" style={{ opacity: progress > 0.6 ? 1 : 0 }}>
              {formatShort(b.value, millionUnit, thousandUnit)}
            </text>
          )}
          {/* Day label */}
          <text x={b.cx} y={TOTAL_H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {b.day}
          </text>
        </g>
      ))}

      {/* Trend line */}
      <path
        ref={pathRef}
        d={linePath}
        fill="none"
        stroke="url(#lineGrad)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLen || 1}
        strokeDashoffset={(pathLen || 1) * (1 - progress)}
      />

      {/* Dots on line points */}
      {bars.map((b, i) => (
        <circle
          key={i}
          cx={b.cx}
          cy={b.y}
          r={hovered === i ? 5 : 3.5}
          fill="white"
          stroke="#059669"
          strokeWidth={2}
          className="transition-all duration-150"
          style={{ opacity: progress > 0.4 ? 1 : 0 }}
        />
      ))}

      {/* Hover tooltip */}
      {hovered !== null && progress > 0.5 && (
        <g style={{ pointerEvents: "none" }}>
          <rect x={tooltipX - 45} y={bars[hovered].y - 34} width={90} height={22} rx={4} fill="#059669" />
          <text x={tooltipX} y={bars[hovered].y - 19} textAnchor="middle" className="fill-white text-[10px] font-semibold">
            {rupiah(bars[hovered].raw)}
          </text>
        </g>
      )}
    </svg>
  )
}

export function DemoCard() {
  const t = useTranslations("Landing")

  return (
    <Card className="overflow-hidden border-emerald-100 bg-card/90 shadow-2xl shadow-emerald-950/10 backdrop-blur dark:border-emerald-950">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <span className="size-2.5 rounded-full bg-red-400" />
        <span className="size-2.5 rounded-full bg-amber-400" />
        <span className="size-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 text-xs text-muted-foreground">app.kasir-ku.id/dashboard</span>
      </div>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t("demoSalesToday")}</p>
            <p className="mt-1 text-3xl font-bold text-emerald-600">
              <AnimatedRupiah target={SALES_TARGET} />
            </p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <TrendingUp className="size-3" /> +18%
          </span>
        </div>
        <div className="mt-5">
          <AnimatedChart />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-muted/70 p-3">
            <p className="font-bold">
              <AnimatedNumber target={ORDERS_TARGET} />
            </p>
            <p className="text-xs text-muted-foreground">{t("demoOrders")}</p>
          </div>
          <div className="rounded-xl bg-muted/70 p-3">
            <p className="font-bold">
              <AnimatedNumber target={CUSTOMERS_TARGET} />
            </p>
            <p className="text-xs text-muted-foreground">{t("demoCustomers")}</p>
          </div>
          <div className="rounded-xl bg-muted/70 p-3">
            <p className="font-bold text-emerald-600">
              <AnimatedRupiah target={PROFIT_TARGET} />
            </p>
            <p className="text-xs text-muted-foreground">{t("demoProfit")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
