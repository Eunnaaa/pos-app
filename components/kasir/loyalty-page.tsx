"use client"

import { useCallback, useEffect, useState } from "react"
import { Award, Gift, Loader2, Pencil, Plus, Send, Sparkles, Star, Trash2 } from "lucide-react"
import { useOrganization } from "@/components/kasir/organization-provider"
import { useResource } from "@/hooks/use-resource"
import { apiFetch } from "@/lib/client"
import { showError, showSuccess } from "@/lib/toast-handler"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const rupiah = (value: string | number) => `Rp ${Number(value).toLocaleString("id-ID")}`

type LoyaltyAccount = {
  id: string
  customer_id: string
  customer_name: string
  customer_code: string
  customer_phone: string | null
  total_spend: string
  membership_level: string | null
  points_balance: string
  lifetime_points: string
  created_at: string
}

type LoyaltySummary = {
  total_members: number
  total_points: string
  total_lifetime_points: string
}

type LoyaltyTransaction = {
  id: string
  type: string
  points: string
  description: string | null
  reference_type: string | null
  created_at: string
  customer_name: string
  customer_code: string
}

type MembershipLevel = { id: string; name: string; minimum_spend_amount: string; point_multiplier: number; benefits: string[] | null }

const emptyLevel = { name: "", minimumSpendAmount: "", pointMultiplier: "1" }

export function LoyaltyPage() {
  const { branch, organization } = useOrganization()
  const [accounts, setAccounts] = useState<LoyaltyAccount[]>([])
  const [summary, setSummary] = useState<LoyaltySummary | null>(null)
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([])
  const [loading, setLoading] = useState(true)

  const levels = useResource<MembershipLevel>("membership-levels", "limit=100")

  const [levelOpen, setLevelOpen] = useState(false)
  const [editingLevel, setEditingLevel] = useState<MembershipLevel | undefined>()
  const [levelForm, setLevelForm] = useState({ ...emptyLevel })
  const [savingLevel, setSavingLevel] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [accountsRes, transactionsRes] = await Promise.all([
        apiFetch<{ accounts: LoyaltyAccount[]; summary: LoyaltySummary }>("/api/v1/loyalty/accounts"),
        apiFetch<LoyaltyTransaction[]>("/api/v1/loyalty/transactions"),
      ])
      setAccounts(Array.isArray(accountsRes.data?.accounts) ? accountsRes.data.accounts : [])
      setSummary(accountsRes.data?.summary ?? { total_members: 0, total_points: "0", total_lifetime_points: "0" })
      setTransactions(Array.isArray(transactionsRes.data) ? transactionsRes.data : [])
    } catch {
      setAccounts([])
      setSummary({ total_members: 0, total_points: "0", total_lifetime_points: "0" })
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const handleContextChange = () => void load()
    window.addEventListener("kedai-ku-context-change", handleContextChange)
    return () => window.removeEventListener("kedai-ku-context-change", handleContextChange)
  }, [load])

  function showCreateLevel() {
    setEditingLevel(undefined)
    setLevelForm({ ...emptyLevel })
    setLevelOpen(true)
  }

  function showEditLevel(row: MembershipLevel) {
    setEditingLevel(row)
    setLevelForm({
      name: row.name,
      minimumSpendAmount: row.minimum_spend_amount || "",
      pointMultiplier: String(row.point_multiplier ?? 1),
    })
    setLevelOpen(true)
  }

  async function saveLevel(event: React.FormEvent) {
    event.preventDefault()
    setSavingLevel(true)
    try {
      const input = {
        name: levelForm.name.trim(),
        minimumSpendAmount: levelForm.minimumSpendAmount ? String(levelForm.minimumSpendAmount) : "0",
        pointMultiplier: Number(levelForm.pointMultiplier) || 1,
      }
      if (editingLevel) await levels.update(editingLevel.id, input)
      else await levels.create(input)
      showSuccess("Membership level tersimpan")
      setLevelOpen(false)
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menyimpan")
    } finally {
      setSavingLevel(false)
    }
  }

  async function removeLevel(row: MembershipLevel) {
    if (!confirm(`Hapus membership level "${row.name}"?`)) return
    try {
      await levels.remove(row.id)
      showSuccess("Membership level dihapus")
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menghapus")
    }
  }

  const typeColor: Record<string, string> = {
    earn: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    redeem: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    expire: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    adjust: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    cashback: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
    referral: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Award className="size-5" />
          </span>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Loyalty &amp; Membership</h2>
            <p className="text-sm text-muted-foreground">Kelola membership level, poin pelanggan, dan riwayat transaksi loyalty.</p>
          </div>
        </div>
        <Badge variant="secondary" className="gap-1.5 py-1.5 pl-3 pr-3.5 text-sm">
          <Star className="size-3.5 text-muted-foreground" />
          {branch?.name || "Semua Cabang"}
        </Badge>
      </div>

      {loading && !summary ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-emerald-600" />
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Member</p>
                    <p className="mt-2 text-2xl font-bold">{summary?.total_members ?? 0}</p>
                  </div>
                  <div className="flex size-12 items-center justify-center rounded-lg bg-emerald-100">
                    <Sparkles className="size-6 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Poin Beredar</p>
                    <p className="mt-2 text-2xl font-bold">{Number(summary?.total_points ?? 0).toLocaleString("id-ID")}</p>
                  </div>
                  <div className="flex size-12 items-center justify-center rounded-lg bg-amber-100">
                    <Star className="size-6 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Poin Sepanjang Masa</p>
                    <p className="mt-2 text-2xl font-bold">{Number(summary?.total_lifetime_points ?? 0).toLocaleString("id-ID")}</p>
                  </div>
                  <div className="flex size-12 items-center justify-center rounded-lg bg-violet-100">
                    <Award className="size-6 text-violet-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Gift className="size-4 text-emerald-600" /> Membership Levels</CardTitle>
                  <CardDescription>Tingkat membership berdasarkan akumulasi spending pelanggan.</CardDescription>
                </div>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={showCreateLevel}>
                  <Plus className="size-4" /> Tambah Level
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Level</TableHead>
                    <TableHead className="text-right">Min. Spend</TableHead>
                    <TableHead className="text-right">Multiplier</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {levels.loading && (
                    <TableRow><TableCell colSpan={4} className="h-20 text-center"><Loader2 className="mx-auto animate-spin text-emerald-600" /></TableCell></TableRow>
                  )}
                  {!levels.loading && levels.data.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">Belum ada membership level.</TableCell></TableRow>
                  )}
                  {levels.data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{rupiah(row.minimum_spend_amount)}</TableCell>
                      <TableCell className="text-right">{row.point_multiplier}x</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => showEditLevel(row)}><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void removeLevel(row)}><Trash2 className="size-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2"><Star className="size-4 text-amber-600" /> Akun Loyalty Pelanggan</CardTitle>
                <CardDescription>Saldo poin dan akumulasi spending per pelanggan.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pelanggan</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead className="text-right">Poin</TableHead>
                      <TableHead className="text-right">Total Spend</TableHead>
                      <TableHead className="text-center w-14">WA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">Belum ada akun loyalty. Poin terbentuk otomatis saat checkout.</TableCell></TableRow>
                    )}
                    {accounts.map((account) => {
                      const cleanPhone = (account.customer_phone || "").replace(/[^0-9]/g, "").replace(/^0/, "62")
                      const storeName = organization?.name || "Kedai-Ku"
                      const pointMsg = `*INFO POIN LOYALTY ${storeName.toUpperCase()}* 🌟\n\nHalo Kak *${account.customer_name}*,\nSaat ini Kakak memiliki saldo *${Number(account.points_balance).toLocaleString("id-ID")} Poin Loyalty* (Level: *${account.membership_level || "Member"}*)!\n\nTukarkan poin Kakak saat transaksi di kasir untuk mendapatkan potongan harga & reward spesial. Terima kasih telah menjadi pelanggan setia kami! 😊`
                      const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(pointMsg)}` : ""

                      return (
                        <TableRow key={account.id}>
                          <TableCell>
                            <p className="font-medium">{account.customer_name}</p>
                            <p className="text-xs text-muted-foreground">{account.customer_code}{account.customer_phone ? ` • ${account.customer_phone}` : ""}</p>
                          </TableCell>
                          <TableCell>{account.membership_level ? <Badge variant="outline">{account.membership_level}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-right font-semibold text-amber-600">{Number(account.points_balance).toLocaleString("id-ID")}</TableCell>
                          <TableCell className="text-right">{rupiah(account.total_spend)}</TableCell>
                          <TableCell className="text-center">
                            {cleanPhone ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                onClick={() => window.open(waUrl, "_blank")}
                                title="Kirim info poin via WhatsApp"
                              >
                                <Send className="size-3.5" />
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-emerald-600" /> Riwayat Transaksi Loyalty</CardTitle>
                <CardDescription>Aktivitas earn/redeem poin terbaru.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pelanggan</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead className="text-right">Poin</TableHead>
                      <TableHead>Waktu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">Belum ada transaksi loyalty.</TableCell></TableRow>
                    )}
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <p className="font-medium">{tx.customer_name}</p>
                          <p className="text-xs text-muted-foreground">{tx.description || tx.reference_type || "—"}</p>
                        </TableCell>
                        <TableCell><Badge variant="outline" className={typeColor[tx.type]}>{tx.type}</Badge></TableCell>
                        <TableCell className={`text-right font-semibold ${tx.type === "earn" || tx.type === "cashback" || tx.type === "referral" ? "text-emerald-600" : "text-amber-600"}`}>
                          {tx.type === "earn" || tx.type === "cashback" || tx.type === "referral" ? "+" : ""}{Number(tx.points).toLocaleString("id-ID")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Dialog open={levelOpen} onOpenChange={setLevelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLevel ? "Edit" : "Tambah"} Membership Level</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveLevel} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="level-name">Nama level</Label>
              <Input id="level-name" value={levelForm.name} onChange={(e) => setLevelForm({ ...levelForm, name: e.target.value })} placeholder="Silver, Gold, Platinum" required minLength={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="level-min">Minimum spend (Rp)</Label>
              <Input id="level-min" type="number" min={0} value={levelForm.minimumSpendAmount} onChange={(e) => setLevelForm({ ...levelForm, minimumSpendAmount: e.target.value })} placeholder="500000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="level-multiplier">Pengali poin</Label>
              <Input id="level-multiplier" type="number" min={1} step={1} value={levelForm.pointMultiplier} onChange={(e) => setLevelForm({ ...levelForm, pointMultiplier: e.target.value })} placeholder="1" />
              <p className="text-xs text-muted-foreground">Pengali poin menggandakan poin yang diperoleh. 2x = poin ganda.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLevelOpen(false)}>Batal</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={savingLevel}>
                {savingLevel ? <><Loader2 className="size-4 animate-spin" /> Menyimpan...</> : "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
