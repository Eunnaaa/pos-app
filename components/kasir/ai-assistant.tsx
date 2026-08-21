"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, BarChart3, BrainCircuit, Eraser, Loader2, Send, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ClientApiError, apiFetch } from "@/lib/client"
import { showError } from "@/lib/toast-handler"

const STORAGE_KEY = "kedai-ku-ai-chat"

const suggestions = [
  "Analisis penjualan bulan ini",
  "Produk mana paling menguntungkan?",
  "Bagaimana kondisi stok dan yang perlu direstock?",
  "Bandingkan pendapatan vs pengeluaran bulan ini",
  "Berikan rekomendasi bisnis dari data terkini",
]

type Message = { role: "user" | "assistant"; content: string; source?: string; animate?: boolean }

function FormattedText({ content }: { content: string }) {
  const lines = content.split("\n")
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} className="h-2" />
        const isBullet = /^[•\-\*]\s/.test(trimmed)
        const isNumbered = /^\d+\.\s/.test(trimmed)
        const text = isBullet ? trimmed.replace(/^[•\-\*]\s/, "") : isNumbered ? trimmed.replace(/^\d+\.\s/, "") : trimmed
        const parts = text.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith("**") && part.endsWith("**")
            ? <strong key={j} className="font-semibold text-emerald-200">{part.slice(2, -2)}</strong>
            : <span key={j}>{part}</span>
        )
        return (
          <div key={i} className={`text-sm leading-relaxed ${isBullet || isNumbered ? "pl-4" : ""}`}>
            {isNumbered && <span className="text-emerald-300">{trimmed.match(/^\d+\./)?.[0]} </span>}
            {isBullet && <span className="text-emerald-300">• </span>}
            {parts}
          </div>
        )
      })}
    </div>
  )
}

function SourceBadge({ source }: { source: string }) {
  if (source === "ai") return <Badge className="bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/20 gap-1"><Sparkles className="size-3" /> AI</Badge>
  if (source === "deterministic-fallback") return <Badge className="bg-amber-500/20 text-amber-200 hover:bg-amber-500/20 gap-1"><AlertTriangle className="size-3" /> Fallback</Badge>
  return <Badge className="bg-blue-500/20 text-blue-200 hover:bg-blue-500/20 gap-1"><BarChart3 className="size-3" /> Data</Badge>
}

// D1: Typing animation — reveals text word by word
function useTypingEffect(text: string, enabled: boolean, speed = 12) {
  const [displayed, setDisplayed] = useState(enabled ? "" : text)
  const done = useRef(false)
  useEffect(() => {
    if (!enabled || done.current) { setDisplayed(text); return }
    done.current = true
    const words = text.split(" ")
    let i = 0
    const interval = setInterval(() => {
      if (i < words.length) { setDisplayed(words.slice(0, i + 1).join(" ")); i++ }
      else clearInterval(interval)
    }, speed)
    return () => clearInterval(interval)
  }, [text, enabled, speed])
  return displayed
}

function AssistantMessage({ content, source, animate }: { content: string; source?: string; animate?: boolean }) {
  const displayed = useTypingEffect(content, animate ?? false)
  const isTyping = animate && displayed.length < content.length
  return (
    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300"><Sparkles className="size-4" /> AI Insight</span>
        {source && <SourceBadge source={source} />}
      </div>
      <FormattedText content={displayed} />
      {isTyping && <span className="ml-0.5 inline-block size-3 animate-pulse rounded-full bg-emerald-400 align-middle" />}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
      <span className="text-sm font-semibold text-emerald-300">AI sedang berpikir</span>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 rounded-full bg-emerald-300" style={{ animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }} />
        ))}
      </div>
    </div>
  )
}

export function AiAssistant() {
  const [question, setQuestion] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  // D2: Load conversation from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setMessages(JSON.parse(stored))
    } catch { /* ignore parse errors */ }
  }, [])

  // D2: Save conversation to localStorage on change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)) } catch { /* ignore quota errors */ }
  }, [messages])

  async function ask(value = question) {
    if (!value.trim()) return
    setQuestion(value)
    setLoading(true)
    try {
      const response = await apiFetch<{ answer: string; source: string }>(
        "/api/v1/ai/assistant",
        { method: "POST", body: JSON.stringify({ question: value, history: messages.slice(-10) }) }
      )
      setMessages((current) => [
        ...current,
        { role: "user", content: value },
        { role: "assistant", content: response.data.answer, source: response.data.source, animate: true },
      ])
      setQuestion("")
    } catch (error) {
      // D4: Error-specific messaging
      if (error instanceof ClientApiError) {
        if (error.code === "RATE_LIMITED") showError("AI sedang sibuk. Coba lagi dalam sebentar.")
        else if (error.status === 400) showError("AI provider belum dikonfigurasi. Menampilkan data analitik.")
        else showError(error.message)
      } else {
        showError("Tidak dapat terhubung. Periksa koneksi internet Anda.")
      }
    } finally {
      setLoading(false)
    }
  }

  function clearChat() {
    if (!confirm("Hapus semua percakapan?")) return
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-950 to-slate-950 text-white shadow-xl dark:border-emerald-900">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <Badge className="mb-3 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/20"><Sparkles className="size-3" /> Kedai-Ku AI</Badge>
            <CardTitle className="text-2xl">Tanyakan apa saja tentang bisnis Anda</CardTitle>
            <CardDescription className="mt-2 text-emerald-100/60">
              Tanya penjualan, profit, stok, pelanggan, pembelian, keuangan. Sebutkan periode: hari ini, minggu lalu, 30 hari terakhir, bulan ini.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" className="text-white/60 hover:text-white" onClick={clearChat}>
                <Eraser className="size-4" /> Hapus
              </Button>
            )}
            <BrainCircuit className="hidden size-12 text-emerald-400 sm:block" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void ask()}
            placeholder="Contoh: Berapa penjualan minggu lalu vs minggu ini?"
            className="h-12 border-white/15 bg-white/10 text-white placeholder:text-white/40"
          />
          <Button className="h-12 bg-emerald-500 hover:bg-emerald-600" onClick={() => void ask()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((item) => (
            <button
              key={item}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 transition-colors"
              onClick={() => void ask(item)}
              disabled={loading}
            >
              {item}
            </button>
          ))}
        </div>
      </CardContent>

      {messages.length === 0 && !loading && (
        <CardContent className="pt-0">
          <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center">
            <BrainCircuit className="size-10 text-white/20" />
            <p className="text-sm text-white/40">Belum ada percakapan. Pilih saran di atas atau ketik pertanyaan Anda.</p>
          </div>
        </CardContent>
      )}

      {messages.length > 0 && (
        <CardContent className="pt-0">
          <div className="space-y-4">
            {messages.map((message, index) => (
              message.role === "assistant" ? (
                <AssistantMessage key={index} content={message.content} source={message.source} animate={message.animate} />
              ) : (
                <div key={index} className="ml-auto max-w-[80%] rounded-xl bg-primary text-primary-foreground p-4">
                  <p className="text-sm leading-relaxed">{message.content}</p>
                </div>
              )
            ))}
          </div>
        </CardContent>
      )}

      {loading && (
        <CardContent className="pt-0">
          <TypingIndicator />
        </CardContent>
      )}
    </Card>
  )
}
