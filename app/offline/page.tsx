import Link from "next/link";
import { CloudOff, RefreshCw, Store } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><div className="max-w-md text-center"><span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><CloudOff className="size-8" /></span><h1 className="mt-6 text-3xl font-bold">Anda sedang offline</h1><p className="mt-3 text-muted-foreground">Transaksi kasir yang dibuat saat offline akan disimpan di perangkat dan disinkronkan otomatis setelah koneksi kembali.</p><div className="mt-7 flex justify-center gap-2"><Button asChild className="bg-emerald-600 hover:bg-emerald-700"><Link href="/dashboard/pos"><Store /> Buka kasir</Link></Button><Button variant="outline" asChild><Link href="/"><RefreshCw /> Coba lagi</Link></Button></div></div></main>;
}
