"use client"

import { useState } from "react"
import { BrainCircuit, Loader2, Send, Sparkles, TrendingUp } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ModulePage } from "./module-page"
import { apiFetch } from "@/lib/client"

const suggestions = ["Berapa penjualan minggu ini?", "Produk apa yang berpotensi habis?", "Bagaimana tren profit bulan ini?"]

export function AiAssistant() {
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [loading, setLoading] = useState(false)

  async function ask(value = question) {
    if (!value.trim()) return
    setQuestion(value); setLoading(true)
    try {
      const response = await apiFetch<{ answer: string }>("/api/v1/ai/assistant", { method: "POST", body: JSON.stringify({ question: value }) })
      setAnswer(response.data.answer)
    } catch (error) { toast.error(error instanceof Error ? error.message : "AI tidak tersedia") }
    finally { setLoading(false) }
  }

  return <div>
    <div className="p-4 pb-0 md:p-6 md:pb-0"><Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-950 to-slate-950 text-white shadow-xl dark:border-emerald-900"><CardHeader><div className="flex items-start justify-between"><div><Badge className="mb-3 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/20"><Sparkles className="size-3" /> Kasir-Ku AI</Badge><CardTitle className="text-2xl">Tanyakan apa saja tentang bisnis Anda</CardTitle><CardDescription className="mt-2 text-emerald-100/60">AI menganalisis data penjualan, stok, pelanggan, dan keuangan secara aman.</CardDescription></div><BrainCircuit className="hidden size-12 text-emerald-400 sm:block" /></div></CardHeader><CardContent><div className="flex gap-2"><Input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void ask()} placeholder="Contoh: Berapa penjualan minggu ini?" className="h-12 border-white/15 bg-white/10 text-white placeholder:text-white/40" /><Button className="h-12 bg-emerald-500 hover:bg-emerald-600" onClick={() => void ask()} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <Send />}</Button></div><div className="mt-3 flex flex-wrap gap-2">{suggestions.map((item) => <button key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10" onClick={() => void ask(item)}>{item}</button>)}</div>{answer && <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-300"><TrendingUp className="size-4" /> Insight</div><p className="leading-relaxed text-white/85">{answer}</p></div>}</CardContent></Card></div>
    <ModulePage module="ai" />
  </div>
}
