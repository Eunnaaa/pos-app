"use client"

import { useState } from "react"
import { Bell, Bot, Check, CheckCheck, Loader2, Mail, MessageSquare, RefreshCw, Send, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useResource } from "@/hooks/use-resource"
import { showSuccess } from "@/lib/toast-handler"

type NotificationRecord = {
  id: string
  channel?: string
  template?: string
  recipient?: string
  subject?: string
  body?: string
  status?: string
  scheduled_at?: string | null
  created_at?: string
}

const statusBadge: Record<string, string> = {
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  read: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  queued: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  failed: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
}

export function NotificationsTab() {
  const notifications = useResource<NotificationRecord>("notifications", "limit=50")
  const [waAuto, setWaAuto] = useState(true)
  const [lowStockAlert, setLowStockAlert] = useState(true)
  const [shiftClosingAlert, setShiftClosingAlert] = useState(true)
  const [fraudAlert, setFraudAlert] = useState(true)

  const data = Array.isArray(notifications.data) ? notifications.data : []

  return (
    <div className="space-y-6">
      {/* Notification Channels Overview */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <MessageSquare className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold">WhatsApp Gateway</CardTitle>
                  <p className="text-[11px] text-muted-foreground">Fonnte API Service</p>
                </div>
              </div>
              <Badge className="bg-emerald-600 text-[10px]">Terhubung</Badge>
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0">
            Kirim struk digital transaksi &amp; notifikasi instan langsung ke nomor WhatsApp pelanggan.
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  <Mail className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold">Email Transaksional</CardTitle>
                  <p className="text-[11px] text-muted-foreground">SMTP &amp; Webhook</p>
                </div>
              </div>
              <Badge className="bg-emerald-600 text-[10px]">Aktif</Badge>
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0">
            Pengiriman invoice PDF resmi, laporan mingguan, dan reset password aman.
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                  <Bot className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold">Telegram Bot Alert</CardTitle>
                  <p className="text-[11px] text-muted-foreground">Kedai-Ku Alert Bot</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px]">Siap Digunakan</Badge>
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0">
            Peringatan instan untuk owner saat ada stok menipis atau selisih kas kasir.
          </CardContent>
        </Card>
      </div>

      {/* Notification Preferences */}
      <Card className="rounded-2xl">
        <CardHeader className="border-b">
          <CardTitle className="text-base font-bold">Preferensi &amp; Trigger Notifikasi Otomatis</CardTitle>
          <CardDescription className="text-xs">
            Pilih peristiwa bisnis yang memicu pengiriman notifikasi otomatis ke pelanggan atau owner.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y p-0">
          <div className="flex items-center justify-between p-4">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">Struk Belanja Otomatis WhatsApp</p>
              <p className="text-xs text-muted-foreground">
                Kirim link struk digital dan ucapan terima kasih setiap kali kasir menyelesaikan transaksi.
              </p>
            </div>
            <Switch
              checked={waAuto}
              onCheckedChange={(c) => {
                setWaAuto(c)
                showSuccess(`Struk otomatis WhatsApp ${c ? "diaktifkan" : "dinonaktifkan"}`)
              }}
            />
          </div>

          <div className="flex items-center justify-between p-4">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">Peringatan Stok Menipis (*Low-Stock Alert*)</p>
              <p className="text-xs text-muted-foreground">
                Beri tahu manager dan warehouse jika jumlah sisa stok berada di bawah reorder point.
              </p>
            </div>
            <Switch
              checked={lowStockAlert}
              onCheckedChange={(c) => {
                setLowStockAlert(c)
                showSuccess(`Peringatan stok menipis ${c ? "diaktifkan" : "dinonaktifkan"}`)
              }}
            />
          </div>

          <div className="flex items-center justify-between p-4">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">Ringkasan Tutup Kasir Shift (*Shift Closing*)</p>
              <p className="text-xs text-muted-foreground">
                Kirim laporan ringkasan omzet, pembayaran non-tunai, dan selisih kas saat kasir menutup sesi.
              </p>
            </div>
            <Switch
              checked={shiftClosingAlert}
              onCheckedChange={(c) => {
                setShiftClosingAlert(c)
                showSuccess(`Notifikasi tutup kasir ${c ? "diaktifkan" : "dinonaktifkan"}`)
              }}
            />
          </div>

          <div className="flex items-center justify-between p-4">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">Peringatan Anomali &amp; AI Fraud Alert</p>
              <p className="text-xs text-muted-foreground">
                Peringatan keamanan jika terdeteksi void transaksi abnormal atau percobaan diskon mencurigakan.
              </p>
            </div>
            <Switch
              checked={fraudAlert}
              onCheckedChange={(c) => {
                setFraudAlert(c)
                showSuccess(`Deteksi anomali AI ${c ? "diaktifkan" : "dinonaktifkan"}`)
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notification Logs Table */}
      <Card className="rounded-2xl">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold">Log Riwayat Pengiriman Notifikasi</CardTitle>
              <CardDescription className="text-xs">
                Aktivitas pesan WhatsApp, Email, dan notifikasi sistem yang telah diproses.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs rounded-xl h-8 gap-1.5"
              onClick={() => void notifications.refresh(0)}
            >
              <RefreshCw className="size-3.5" /> Refresh Log
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Saluran</TableHead>
                <TableHead>Penerima</TableHead>
                <TableHead>Subjek / Template</TableHead>
                <TableHead>Waktu</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.loading && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Loader2 className="mx-auto animate-spin text-emerald-600" />
                  </TableCell>
                </TableRow>
              )}
              {!notifications.loading && data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground">
                    Belum ada log notifikasi keluar.
                  </TableCell>
                </TableRow>
              )}
              {data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                      {item.channel || "in_app"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-xs">
                    {item.recipient || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.subject || item.template || "Pemberitahuan Sistem"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.created_at ? new Date(item.created_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge className={`text-[10px] font-semibold ${statusBadge[item.status || "delivered"] || statusBadge.delivered}`}>
                      {item.status || "Terkirim"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
