"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Loader2, QrCode, RefreshCw, Trash2 } from "lucide-react";
import { useOrganization } from "@/components/kasir/organization-provider";
import { apiFetch } from "@/lib/client";
import { showError, showSuccess } from "@/lib/toast-handler";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type TableRecord = { id: string; name: string; area?: string; is_active: boolean };
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
  const { organization } = useOrganization();
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [loading, setLoading] = useState(true);

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
      showError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  async function generateQR(value: string): Promise<string> {
    const dataUrl = await QRCode.toDataURL(value, { width: 256, margin: 2 });
    return dataUrl;
  }

  async function ensureToken(tableId: string, tableName: string) {
    try {
      const token = crypto.randomUUID().split("-").join("").slice(0, 16);
      await apiFetch("/api/v1/resources/qr-order-tokens", {
        method: "POST",
        body: JSON.stringify({
          table_id: tableId,
          token,
          is_active: true,
        }),
      });
      showSuccess(`Token untuk meja ${tableName} dibuat`);
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal membuat token");
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
      showSuccess("Token diperbarui, QR lama tidak lagi berlaku");
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal merotasi token");
    }
  }

  async function deleteToken(id: string) {
    if (!confirm("Hapus token? QR lama tidak akan berlaku.")) return;
    try {
      await apiFetch(`/api/v1/resources/qr-order-tokens/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menghapus");
    }
  }

  if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!organization) return null;

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <QrCode className="size-5" />
        </span>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Self Order QR</h2>
          <p className="text-sm text-muted-foreground">Cetak QR per meja untuk self-order customer. QR mengarah ke <code>/order/[token]</code>.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tables.filter((t) => t.is_active).map((tbl) => (
          <TableQRCard
            key={tbl.id}
            table={tbl}
            token={tokens.find((t) => (t.tableId || t.table_id) === tbl.id) ?? null}
            appUrl={appUrl}
            onGenerateQR={generateQR}
            onEnsureToken={ensureToken}
            onToggleToken={toggleToken}
            onRotateToken={rotateToken}
            onDeleteToken={deleteToken}
          />
        ))}
      </div>
      {tables.length === 0 && (
        <Card><CardContent className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
          <Label>Belum ada meja</Label>
          <p className="mt-2 text-sm text-muted-foreground">Tambahkan meja melalui menu Reservations / dining_tables.</p>
        </CardContent></Card>
      )}
    </div>
  );
}

type TableQRCardProps = {
  table: TableRecord;
  token: TokenRecord | null;
  appUrl: string;
  onGenerateQR: (v: string) => Promise<string>;
  onEnsureToken: (tableId: string, tableName: string) => Promise<void>;
  onToggleToken: (id: string, active: boolean) => Promise<void>;
  onRotateToken: (id: string) => Promise<void>;
  onDeleteToken: (id: string) => Promise<void>;
};

function TableQRCard({ table, token, appUrl, onGenerateQR, onEnsureToken, onToggleToken, onRotateToken, onDeleteToken }: TableQRCardProps) {
  const tokenVal = token?.token || token?.slug || "";
  const qrValue = tokenVal ? `${appUrl}/order/${tokenVal}` : "";
  const [qr, setQr] = useState<string>("");
  const active = token?.isActive ?? token?.is_active ?? false;

  useEffect(() => {
    if (qrValue) void onGenerateQR(qrValue).then(setQr);
  }, [qrValue, onGenerateQR]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Meja {table.name}</p>
            <p className="text-xs text-muted-foreground">{table.area || "—"}</p>
          </div>
          {token && (
            <Badge variant={active ? "default" : "secondary"}>
              {active ? "Aktif" : "Nonaktif"}
            </Badge>
          )}
        </div>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`QR Meja ${table.name}`} className="h-48 w-48 self-center rounded-lg border" />
        ) : (
          <div className="flex h-48 w-48 items-center justify-center self-center rounded-lg border bg-muted text-muted-foreground text-sm">
            QR belum dibuat
          </div>
        )}
        {token ? (
          <div className="space-y-1 text-xs">
            <p className="break-all text-muted-foreground">Token: <code>{tokenVal}</code></p>
            <p className="break-all text-muted-foreground">URL: <code>{qrValue}</code></p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Token belum dibuat untuk meja ini.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {!token && (
            <Button size="sm" onClick={() => onEnsureToken(table.id, table.name)}>Buat Token</Button>
          )}
          {token && (
            <>
              <Button size="sm" variant="outline" onClick={() => onToggleToken(token.id, active)}>
                {active ? "Nonaktifkan" : "Aktifkan"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRotateToken(token.id)}>
                <RefreshCw className="h-3 w-3" /> Rotasi
              </Button>
              {qr && (
                <Button size="sm" variant="outline" asChild>
                  <a href={qr} download={`qr-meja-${table.name}.png`}>Unduh</a>
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => onDeleteToken(token.id)}>
                <Trash2 className="h-3 w-3" /> Hapus
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
