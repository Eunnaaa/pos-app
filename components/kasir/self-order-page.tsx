"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Loader2, Plus, QrCode, RefreshCw, Search, Trash2, Utensils } from "lucide-react";
import { useOrganization } from "@/components/kasir/organization-provider";
import { apiFetch } from "@/lib/client";
import { showError, showSuccess } from "@/lib/toast-handler";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TableRecord = { id: string; name: string; area?: string; branch_id?: string; is_active: boolean };
type TokenRecord = {
  id: string;
  token?: string;
  slug?: string;
  is_active?: boolean;
  isActive?: boolean;
  table_id?: string;
  tableId?: string;
  table?: { name?: string; area?: string } | null;
};

export function SelfOrderPage() {
  const { organization, branch } = useOrganization();
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [creating, setCreating] = useState(false);
  const [savingTable, setSavingTable] = useState(false);

  // New table form
  const [tableName, setTableName] = useState("");
  const [tableArea, setTableArea] = useState("");
  const [tableCapacity, setTableCapacity] = useState("4");

  const activeTables = tables.filter((t) => t.is_active);

  async function load() {
    setLoading(true);
    try {
      const [tablesRes, tokensRes] = await Promise.all([
        apiFetch<TableRecord[]>("/api/v1/resources/dining-tables?limit=200"),
        apiFetch<TokenRecord[]>("/api/v1/resources/qr-order-tokens?limit=200"),
      ]);
      setTables(tablesRes.data);
      setTokens(tokensRes.data);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal memuat data meja & QR token");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // Pre-select first table when modal opens
  useEffect(() => {
    if (createOpen && activeTables.length > 0) {
      if (!selectedTableId || !activeTables.some((t) => t.id === selectedTableId)) {
        setSelectedTableId(activeTables[0].id);
      }
    }
  }, [createOpen, activeTables, selectedTableId]);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  async function generateQR(value: string): Promise<string> {
    const dataUrl = await QRCode.toDataURL(value, { width: 256, margin: 2 });
    return dataUrl;
  }

  async function handleCreateTable(event: React.FormEvent) {
    event.preventDefault();
    if (!tableName.trim()) {
      showError("Nama meja wajib diisi");
      return;
    }
    setSavingTable(true);
    try {
      const branchId = branch?.id ?? organization?.branches?.[0]?.id;
      const res = await apiFetch<TableRecord>("/api/v1/resources/dining-tables", {
        method: "POST",
        body: JSON.stringify({
          branchId,
          name: tableName.trim(),
          area: tableArea.trim() || "Area Utama",
          capacity: Number(tableCapacity) || 4,
          status: "available",
        }),
      });
      showSuccess(`Meja ${tableName} berhasil ditambahkan!`);
      setTableName("");
      setTableArea("");
      setTableCapacity("4");
      setAddTableOpen(false);
      await load();
      if (res.data?.id) {
        setSelectedTableId(res.data.id);
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menambahkan meja");
    } finally {
      setSavingTable(false);
    }
  }

  async function handleCreateToken(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedTableId) {
      showError("Pilih meja terlebih dahulu");
      return;
    }
    setCreating(true);
    try {
      const table = tables.find((t) => t.id === selectedTableId);
      const existingToken = tokens.find((t) => (t.tableId || t.table_id) === selectedTableId);
      const newToken = crypto.randomUUID().split("-").join("").slice(0, 16);

      if (existingToken) {
        await apiFetch(`/api/v1/resources/qr-order-tokens/${existingToken.id}`, {
          method: "PATCH",
          body: JSON.stringify({ token: newToken, isActive: true }),
        });
        showSuccess(`QR Stiker Meja ${table?.name ?? ""} berhasil diperbarui`);
      } else {
        await apiFetch("/api/v1/resources/qr-order-tokens", {
          method: "POST",
          body: JSON.stringify({
            branchId: table?.branch_id ?? branch?.id,
            tableId: selectedTableId,
            token: newToken,
            isActive: true,
          }),
        });
        showSuccess(`QR Stiker berhasil dibuat untuk Meja ${table?.name ?? ""}`);
      }
      setCreateOpen(false);
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal membuat/memperbarui QR token");
    } finally {
      setCreating(false);
    }
  }

  async function toggleToken(id: string, active: boolean) {
    try {
      await apiFetch(`/api/v1/resources/qr-order-tokens/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !active }),
      });
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal mengubah status token");
    }
  }

  async function rotateToken(id: string) {
    try {
      const newToken = crypto.randomUUID().split("-").join("").slice(0, 16);
      await apiFetch(`/api/v1/resources/qr-order-tokens/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ token: newToken }),
      });
      showSuccess("Token QR diperbarui (QR lama dinonaktifkan)");
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal merotasi token");
    }
  }

  async function rotateAllTokens() {
    if (tokens.length === 0) return;
    if (!confirm(`Rotasi token SELURUH (${tokens.length}) meja sekarang? Seluruh link QR lama akan hangus seketika untuk mencegah penyalahgunaan.`)) return;
    setLoading(true);
    try {
      await Promise.all(
        tokens.map((t) => {
          const newToken = crypto.randomUUID().split("-").join("").slice(0, 16);
          return apiFetch(`/api/v1/resources/qr-order-tokens/${t.id}`, {
            method: "PATCH",
            body: JSON.stringify({ token: newToken }),
          });
        })
      );
      showSuccess("Seluruh token QR meja berhasil dirotasi dengan aman!");
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal merotasi beberapa token QR");
    } finally {
      setLoading(false);
    }
  }

  async function deleteToken(id: string) {
    if (!confirm("Hapus token QR ini? Stiker cetak fisik tidak akan dapat digunakan lagi.")) return;
    try {
      await apiFetch(`/api/v1/resources/qr-order-tokens/${id}`, { method: "DELETE" });
      showSuccess("Token QR berhasil dihapus");
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menghapus token QR");
    }
  }

  async function deleteAllTokens() {
    if (tokens.length === 0) return;
    if (!confirm(`Hapus SELURUH (${tokens.length}) token QR yang ada? Seluruh stiker cetak fisik lama tidak akan dapat digunakan lagi.`)) return;
    setLoading(true);
    try {
      await Promise.all(tokens.map((t) => apiFetch(`/api/v1/resources/qr-order-tokens/${t.id}`, { method: "DELETE" })));
      showSuccess("Seluruh token QR berhasil dihapus!");
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menghapus beberapa token QR");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const filteredTokens = tokens.filter((tok) => {
    const tableId = tok.tableId || tok.table_id;
    const table = tables.find((t) => t.id === tableId);
    const q = search.toLowerCase();
    return (
      (table?.name ?? "").toLowerCase().includes(q) ||
      (table?.area ?? "").toLowerCase().includes(q) ||
      (tok.token ?? tok.slug ?? "").toLowerCase().includes(q)
    );
  });

  const isOwner = !organization || organization.role === "owner";

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header & Action Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
            <QrCode className="size-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">
              Table &amp; QR Self-Order
            </h1>
            <p className="text-xs text-muted-foreground line-clamp-2 sm:line-clamp-none">
              {isOwner
                ? "Kelola meja operasional, buat baru, rotasi, atau hapus kode QR stiker sesuai kebutuhan."
                : "Lihat daftar meja operasional dan QR stiker aktif yang dapat digunakan untuk melayani pelanggan."}
            </p>
          </div>
        </div>

        {isOwner && (
          <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2 shrink-0 sm:ml-auto">
            <Button
              variant="outline"
              className="text-xs rounded-xl h-9 font-semibold gap-1.5 border-muted"
              onClick={() => setAddTableOpen(true)}
            >
              <Utensils className="size-4 text-emerald-600" /> Tambah Meja Baru
            </Button>

            {tokens.length > 0 && (
              <>
                <Button
                  variant="outline"
                  className="text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50 border-amber-200 dark:border-amber-900/40 rounded-xl h-9 font-semibold gap-1.5"
                  onClick={() => void rotateAllTokens()}
                >
                  <RefreshCw className="size-4" /> Rotasi Semua QR
                </Button>
                <Button
                  variant="outline"
                  className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 dark:border-rose-900/40 rounded-xl h-9 font-semibold gap-1.5"
                  onClick={() => void deleteAllTokens()}
                >
                  <Trash2 className="size-4" /> Hapus Semua
                </Button>
              </>
            )}

            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs gap-2 h-9 px-4 rounded-xl"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" /> Generate QR
            </Button>
          </div>
        )}
      </div>

      {/* Anti-Fraud Security Info Card Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/30 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-xl bg-emerald-600 text-white shrink-0">
            <QrCode className="size-4" />
          </div>
          <div>
            <span className="font-semibold text-emerald-900 dark:text-emerald-200">Proteksi Anti-Penyalahgunaan QR Aktif: </span>
            <span className="text-emerald-800/80 dark:text-emerald-300/80">Setiap meja dilindungi token kriptografis 16-karakter acak. Jika stiker dicurigai bocor, gunakan tombol &quot;Rotasi QR&quot; untuk mengganti token seketika.</span>
          </div>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari meja atau kode token..."
            className="pl-9 h-10 text-sm bg-background shadow-2xs rounded-xl"
          />
        </div>
      </div>

      {/* QR Cards Grid (READ / UPDATE / DELETE) */}
      {filteredTokens.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center p-6">
            <QrCode className="size-10 text-muted-foreground/30" />
            <div>
              <p className="font-bold text-foreground text-base">Belum Ada Token QR</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Klik tombol &quot;Generate QR Baru&quot; di atas untuk memilih meja dan membuat QR stiker pertama Anda.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setAddTableOpen(true)}
              >
                <Utensils className="size-4 mr-1.5 text-emerald-600" /> Tambah Meja Baru
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="size-4 mr-1.5" /> Generate QR Baru
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTokens.map((tok) => {
            const tableId = tok.tableId || tok.table_id;
            const table = tables.find((t) => t.id === tableId);
            return (
              <TableQRCard
                key={tok.id}
                table={table ?? { id: tableId ?? "", name: "Meja", is_active: true }}
                token={tok}
                appUrl={appUrl}
                isOwner={isOwner}
                onGenerateQR={generateQR}
                onToggleToken={toggleToken}
                onRotateToken={rotateToken}
                onDeleteToken={deleteToken}
              />
            );
          })}
        </div>
      )}

      {/* CREATE DIALOG (Modal Tambah Token QR) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Plus className="size-5 text-emerald-600" /> Generate QR Stiker Meja
            </DialogTitle>
            <DialogDescription className="text-xs">
              Pilih meja yang akan dipasangi kode QR untuk transaksi self-order mandiri.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateToken} className="space-y-4 pt-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Pilih Meja Operasional</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-emerald-600 font-semibold p-0"
                  onClick={() => { setCreateOpen(false); setAddTableOpen(true); }}
                >
                  + Tambah Meja Baru
                </Button>
              </div>

              {activeTables.length === 0 ? (
                <div className="p-4 bg-muted/50 rounded-xl text-center space-y-2">
                  <p className="text-xs text-muted-foreground italic">
                    Belum ada meja operasional di restoran Anda.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-xl"
                    onClick={() => { setCreateOpen(false); setAddTableOpen(true); }}
                  >
                    + Buat Meja Pertama
                  </Button>
                </div>
              ) : (
                <Select value={selectedTableId} onValueChange={setSelectedTableId}>
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue placeholder="Pilih Meja" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeTables.map((tbl) => {
                      const hasQR = tokens.some((t) => (t.tableId || t.table_id) === tbl.id);
                      return (
                        <SelectItem key={tbl.id} value={tbl.id}>
                          Meja {tbl.name} {tbl.area ? `(${tbl.area})` : ""} {hasQR ? "— (Sudah ada QR)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" className="rounded-xl h-9" onClick={() => setCreateOpen(false)}>
                Batal
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 font-semibold"
                disabled={creating || !selectedTableId}
              >
                {creating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Membuat...
                  </>
                ) : (
                  "Generate Kode QR"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ADD NEW DINING TABLE DIALOG */}
      <Dialog open={addTableOpen} onOpenChange={setAddTableOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Utensils className="size-5 text-emerald-600" /> Tambah Meja Operasional
            </DialogTitle>
            <DialogDescription className="text-xs">
              Buat data meja makan restoran baru.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTable} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="new-table-name" className="text-xs font-semibold">Nama / Nomor Meja</Label>
              <Input
                id="new-table-name"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="Contoh: Meja 01, VIP-A"
                required
                className="h-10 text-sm rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-table-area" className="text-xs font-semibold">Area Meja</Label>
              <Input
                id="new-table-area"
                value={tableArea}
                onChange={(e) => setTableArea(e.target.value)}
                placeholder="Contoh: Lantai 1, Outdoor, Indoor"
                className="h-10 text-sm rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-table-cap" className="text-xs font-semibold">Kapasitas Kursi</Label>
              <Input
                id="new-table-cap"
                type="number"
                min="1"
                max="50"
                value={tableCapacity}
                onChange={(e) => setTableCapacity(e.target.value)}
                placeholder="4"
                className="h-10 text-sm rounded-xl"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" className="rounded-xl h-9" onClick={() => setAddTableOpen(false)}>
                Batal
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 font-semibold"
                disabled={savingTable || !tableName.trim()}
              >
                {savingTable ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Menyimpan...
                  </>
                ) : (
                  "Simpan Meja"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type TableQRCardProps = {
  table: TableRecord;
  token: TokenRecord | null;
  appUrl: string;
  isOwner: boolean;
  onGenerateQR: (v: string) => Promise<string>;
  onToggleToken: (id: string, active: boolean) => Promise<void>;
  onRotateToken: (id: string) => Promise<void>;
  onDeleteToken: (id: string) => Promise<void>;
};

function TableQRCard({
  table,
  token,
  appUrl,
  isOwner,
  onGenerateQR,
  onToggleToken,
  onRotateToken,
  onDeleteToken,
}: TableQRCardProps) {
  const tokenVal = token?.token || token?.slug || "";
  const qrValue = tokenVal ? `${appUrl}/order/${tokenVal}` : "";
  const [qr, setQr] = useState<string>("");
  const active = token?.isActive ?? token?.is_active ?? false;

  useEffect(() => {
    if (qrValue) void onGenerateQR(qrValue).then(setQr);
  }, [qrValue, onGenerateQR]);

  return (
    <Card className="rounded-2xl border border-t-2 border-t-emerald-500 bg-card shadow-2xs transition-all hover:shadow-md">
      <CardContent className="flex flex-col gap-3.5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-base text-foreground flex items-center gap-2">
              Meja {table.name}
              {active && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Ready
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">{table.area || "Area Utama"}</p>
          </div>
          {token && (
            <Badge
              variant={active ? "default" : "outline"}
              className={active ? "bg-emerald-600 text-[10px] rounded-md font-semibold" : "text-[10px] rounded-md"}
            >
              {active ? "Stiker Aktif" : "Nonaktif"}
            </Badge>
          )}
        </div>

        {qr ? (
          <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white border shadow-2xs self-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={`QR Meja ${table.name}`} className="h-44 w-44 rounded-md" />
            <span className="text-[10px] font-mono text-muted-foreground mt-1">/{tokenVal}</span>
          </div>
        ) : (
          <div className="flex h-44 w-44 items-center justify-center self-center rounded-xl border bg-muted text-muted-foreground text-xs font-medium">
            QR Belum Dibuat
          </div>
        )}

        {token && (
          <div className="flex items-center justify-between text-xs pt-1 border-t border-dashed">
            <span className="text-muted-foreground">URL Scan:</span>
            <code className="text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-400 truncate max-w-[180px]">
              /order/{tokenVal}
            </code>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {token && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs rounded-lg gap-1 border-emerald-200 hover:bg-emerald-50 text-emerald-800"
                onClick={() => {
                  if (qrValue) {
                    void navigator.clipboard.writeText(qrValue);
                    showSuccess(`Link QR Meja ${table.name} berhasil disalin!`);
                  }
                }}
              >
                <Copy className="size-3" /> Salin Link
              </Button>
              {qr && (
                <Button size="sm" variant="outline" className="h-8 text-xs rounded-lg gap-1 text-emerald-700 border-emerald-300" asChild>
                  <a href={qr} download={`qr-meja-${table.name}.png`}>
                    <Download className="size-3" /> Unduh
                  </a>
                </Button>
              )}
              {isOwner && (
                <>
                  <Button size="sm" variant="outline" className="h-8 text-xs rounded-lg flex-1" onClick={() => onToggleToken(token.id, active)}>
                    {active ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs rounded-lg gap-1" onClick={() => onRotateToken(token.id)}>
                    <RefreshCw className="size-3" /> Rotasi
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-rose-600 hover:bg-rose-50 rounded-lg px-2" onClick={() => onDeleteToken(token.id)}>
                    <Trash2 className="size-3" />
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

