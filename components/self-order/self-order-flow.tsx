"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  ChefHat,
  CheckCircle2,
  Clock,
  Loader2,
  Minus,
  Plus,
  Printer,
  ShoppingCart,
  Trash2,
  Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { selfOrderFetch, SelfOrderApiError } from "@/lib/client/self-order-api";
import { useSelfOrderCart, type CartItem } from "@/hooks/use-self-order-cart";
import { useOrderStatus, type OrderStatus } from "@/hooks/use-order-status";
import { useTranslations } from "next-intl";
import { showError, showInfo, showSuccess } from "@/lib/toast-handler";
import { getCategoryEmoji } from "@/lib/services/category-images";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  variants: Array<{ id: string; name: string; sku: string; priceAmount: string; available: boolean }>;
};
type MenuData = {
  organization: { id: string; name: string; defaultCurrency: string };
  table: { id: string; name: string; area: string | null };
  categories: Array<{ id: string; name: string; slug: string; products: MenuItem[] }>;
};

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

export type SelfOrderVariant = "mobile" | "kiosk";

type Props = {
  token: string;
  variant?: SelfOrderVariant;
};

type Step = "menu" | "product" | "cart" | "payment" | "tracking";

export function SelfOrderFlow({ token, variant = "mobile" }: Props) {
  const t = useTranslations("SelfOrder");
  const isKiosk = variant === "kiosk";
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<Step>("menu");
  const [activeProduct, setActiveProduct] = useState<MenuItem | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [callStaffOpen, setCallStaffOpen] = useState(false);
  const [callingStaff, setCallingStaff] = useState(false);
  const cart = useSelfOrderCart(token);

  useEffect(() => {
    void (async () => {
      try {
        const res = await selfOrderFetch<MenuData>(`/api/v1/self-order/menu?token=${encodeURIComponent(token)}`);
        setMenu(res.data);
        setActiveCategory("all");
      } catch (e) {
        const message = e instanceof SelfOrderApiError ? e.message : t("failedLoadMenu");
        setError(message);
        showError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, t]);

  const filteredProducts = useMemo(() => {
    if (!menu) return [];
    let list: MenuItem[] = [];
    if (activeCategory === "all") {
      list = menu.categories.flatMap((c) => c.products);
      const seen = new Set<string>();
      list = list.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    } else {
      const cat = menu.categories.find((c) => c.id === activeCategory);
      list = cat?.products ?? [];
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.variants.some((v) => v.sku.toLowerCase().includes(q)));
    }
    return list;
  }, [menu, activeCategory, search]);

  async function handleCallStaff(reason: string) {
    setCallingStaff(true);
    try {
      await selfOrderFetch("/api/v1/self-order/call-staff", {
        method: "POST",
        body: JSON.stringify({ token, reason }),
      });
      showSuccess("Pelayan telah dipanggil! Staf restoran akan segera menuju meja Anda.");
      setCallStaffOpen(false);
    } catch {
      showError("Gagal memanggil pelayan. Silakan panggil staf terdekat secara langsung.");
    } finally {
      setCallingStaff(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-destructive font-medium">{error}</p>
        <Button onClick={() => window.location.reload()}>{t("retry")}</Button>
      </div>
    );
  }

  if (!menu) return null;

  return (
    <div className={cn("min-h-dvh bg-background pb-20", isKiosk && "text-2xl")}>
      {/* Header Bar */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4 gap-3 max-w-5xl mx-auto">
          <div className="min-w-0">
            <p className="font-bold truncate text-base text-foreground">{menu.organization.name}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <span className="inline-flex size-2 rounded-full bg-emerald-500" />
              {t("table")} <strong className="text-foreground">{menu.table.name}</strong>
              {menu.table.area ? ` · ${menu.table.area}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {step !== "menu" && (
              <Button variant="ghost" size="sm" onClick={() => setStep(step === "tracking" ? "tracking" : "menu")}>
                <ArrowLeft className="h-4 w-4" /> {t("menu")}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              aria-label="Keranjang Belanja"
              onClick={() => setStep("cart")}
              className="relative cursor-pointer bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold"
            >
              <ShoppingCart className="h-4 w-4" />
              {cart.totalItems > 0 && (
                <Badge className="absolute -right-2 -top-2 h-5 min-w-5 justify-center rounded-full px-1 text-xs bg-emerald-600">
                  {cart.totalItems}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="container mx-auto max-w-5xl p-4">
        {step === "menu" && (
          <MenuView
            menu={menu}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            search={search}
            setSearch={setSearch}
            filteredProducts={filteredProducts}
            isKiosk={isKiosk}
            cartItems={cart.items}
            onSelect={(p) => { setActiveProduct(p); setStep("product"); }}
            onQuickAdd={(p) => {
              if (p.variants.length > 1) {
                setActiveProduct(p);
                setStep("product");
              } else {
                const v = p.variants[0];
                if (!v) return;
                cart.add({
                  variantId: v.id,
                  productId: p.id,
                  name: p.name,
                  variantName: v.name,
                  price: Number(v.priceAmount),
                  quantity: 1,
                });
                showSuccess(`${p.name} ditambahkan ke keranjang`);
              }
            }}
            onQuickRemove={(p) => {
              const v = p.variants[0];
              if (!v) return;
              const existing = cart.items.find((i) => i.productId === p.id && i.variantId === v.id);
              if (existing) {
                if (existing.quantity > 1) {
                  cart.updateQuantity(v.id, existing.notes, existing.quantity - 1);
                  showInfo(`${p.name} dikurangi (${existing.quantity - 1})`);
                } else {
                  cart.remove(v.id, existing.notes);
                  showInfo(`${p.name} dikeluarkan dari keranjang`);
                }
              }
            }}
          />
        )}

        {step === "product" && activeProduct && (
          <ProductDetail
            product={activeProduct}
            isKiosk={isKiosk}
            onAdd={(item) => { cart.add(item); setActiveProduct(null); setStep("menu"); }}
            onBack={() => { setActiveProduct(null); setStep("menu"); }}
          />
        )}

        {step === "cart" && (
          <CartView
            items={cart.items}
            totalAmount={cart.totalAmount}
            onChangeQty={cart.updateQuantity}
            onRemove={cart.remove}
            onCheckout={() => setStep("payment")}
            onBack={() => setStep("menu")}
          />
        )}

        {step === "payment" && (
          <PaymentView
            token={token}
            items={cart.items}
            totalAmount={cart.totalAmount}
            isKiosk={isKiosk}
            onPaid={(orderId) => {
              cart.clear();
              setStep("tracking");
              setActiveOrderId(orderId);
            }}
            onBack={() => setStep("cart")}
          />
        )}

        {step === "tracking" && activeOrderId && (
          <TrackingView orderId={activeOrderId} token={token} isKiosk={isKiosk} />
        )}
      </main>

      {/* Floating Mini Cart Box Popup (Pojok Kanan Bawah) */}
      {cart.totalItems > 0 && step === "menu" && (
        <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="flex flex-col gap-2.5 p-4 rounded-3xl bg-slate-900/95 backdrop-blur-md text-white shadow-2xl border border-slate-800 w-80 max-w-[calc(100vw-2rem)]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-xs">
                  {cart.totalItems}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    <ShoppingCart className="size-3.5 text-emerald-400" /> Ringkasan Keranjang
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{cart.totalItems} Produk Siap Diproses</p>
                </div>
              </div>
              <span className="text-sm font-extrabold text-emerald-400">
                {rupiah(cart.totalAmount)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStep("cart")}
                className="rounded-xl text-xs font-semibold h-9 bg-slate-800 hover:bg-slate-700 text-white border-slate-700"
              >
                Validasi Pesanan
              </Button>
              <Button
                size="sm"
                onClick={() => setStep("payment")}
                className="rounded-xl text-xs font-bold h-9 bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-xs"
              >
                Bayar Sekarang
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB) Panggil Pelayan */}
      <div className="fixed bottom-5 left-4 z-40 sm:bottom-6 sm:left-6">
        <Button
          size="sm"
          onClick={() => setCallStaffOpen(true)}
          className="rounded-full shadow-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-3.5 py-2.5 flex items-center gap-2 border-2 border-white"
        >
          <Bell className="size-4 fill-slate-950" />
          <span className="text-xs">Panggil Pelayan</span>
        </Button>
      </div>

      {/* Call Staff Dialog */}
      <Dialog open={callStaffOpen} onOpenChange={setCallStaffOpen}>
        <DialogContent className="sm:max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Bell className="size-5 text-amber-500" /> Panggil Pelayan ke Meja
            </DialogTitle>
            <DialogDescription className="text-xs">
              Pilih alasan atau kebutuhan Anda di Meja {menu.table.name}:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 pt-2">
            <Button
              variant="outline"
              className="w-full justify-start text-xs font-semibold rounded-xl h-10 border-amber-200 hover:bg-amber-50"
              disabled={callingStaff}
              onClick={() => void handleCallStaff("Minta Bantuan Pelayan")}
            >
              🛎️ Bantuan Umum / Konsultasi Menu
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-xs font-semibold rounded-xl h-10 border-amber-200 hover:bg-amber-50"
              disabled={callingStaff}
              onClick={() => void handleCallStaff("Minta Alat Makan / Sendok Garpu")}
            >
              🥄 Minta Alat Makan (Sendok / Garpu / Piring)
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-xs font-semibold rounded-xl h-10 border-amber-200 hover:bg-amber-50"
              disabled={callingStaff}
              onClick={() => void handleCallStaff("Minta Tisu / Sedotan / Air Minum")}
            >
              🧻 Minta Tisu / Sedotan / Air
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function MenuView(props: {
  menu: MenuData;
  activeCategory: string;
  setActiveCategory: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  filteredProducts: MenuItem[];
  isKiosk: boolean;
  cartItems: CartItem[];
  onSelect: (p: MenuItem) => void;
  onQuickAdd: (p: MenuItem) => void;
  onQuickRemove: (p: MenuItem) => void;
}) {
  const { menu, activeCategory, setActiveCategory, search, setSearch, filteredProducts, isKiosk, cartItems, onSelect, onQuickAdd, onQuickRemove } = props;
  const t = useTranslations("SelfOrder");
  const activeCat = menu.categories.find((c) => c.id === activeCategory);
  const categoryName = activeCat?.name ?? "";

  const allCategories = [
    { id: "all", name: "Semua" },
    ...menu.categories,
  ];

  return (
    <div className="space-y-5">
      {/* Search Input */}
      <div className="relative">
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn("h-11 rounded-2xl text-sm bg-background shadow-2xs pl-4", isKiosk && "h-14 text-lg")}
        />
      </div>

      {/* Category Horizontal Scroll */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {allCategories.map((c) => {
          const isActive = c.id === activeCategory;
          return (
            <Button
              key={c.id}
              variant={isActive ? "default" : "outline"}
              size={isKiosk ? "lg" : "sm"}
              onClick={() => setActiveCategory(c.id)}
              className={cn(
                "rounded-xl text-xs font-semibold shrink-0 transition-all px-4",
                isActive
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                  : "bg-background hover:bg-muted text-foreground border-border/70"
              )}
            >
              {c.name}
            </Button>
          );
        })}
      </div>

      {/* Product Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {filteredProducts.map((p) => {
          const v = p.variants[0];
          const qty = cartItems
            .filter((i) => i.productId === p.id)
            .reduce((sum, i) => sum + i.quantity, 0);

          return (
            <div
              key={p.id}
              onClick={() => onSelect(p)}
              className="group flex flex-col justify-between overflow-hidden rounded-2xl border bg-card text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer shadow-2xs"
            >
              <div className="aspect-square overflow-hidden bg-muted relative">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-4xl bg-gradient-to-br from-emerald-50 to-muted dark:from-emerald-950 dark:to-muted">
                    {getCategoryEmoji(categoryName)}
                  </div>
                )}
                {qty > 0 && (
                  <Badge className="absolute top-2 right-2 bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow-xs">
                    {qty} di Keranjang
                  </Badge>
                )}
              </div>

              <div className="flex flex-1 flex-col justify-between p-3.5 space-y-2">
                <div>
                  <h3 className="line-clamp-2 font-bold text-sm leading-tight text-foreground">{p.name}</h3>
                  {p.description && (
                    <p className="line-clamp-1 text-[11px] text-muted-foreground mt-0.5">{p.description}</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1 gap-1">
                  {v && (
                    <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                      {rupiah(Number(v.priceAmount))}
                    </span>
                  )}

                  {qty > 0 ? (
                    <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 rounded-lg p-0.5 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200/60 rounded p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuickRemove(p);
                        }}
                      >
                        <Minus className="size-3" />
                      </Button>
                      <span className="min-w-4 text-center text-xs font-extrabold text-emerald-900 dark:text-emerald-200">
                        {qty}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200/60 rounded p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuickAdd(p);
                        }}
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="h-7 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickAdd(p);
                      }}
                    >
                      + Tambah
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredProducts.length === 0 && (
          <div className="col-span-full py-12 text-center space-y-2">
            <p className="text-sm text-muted-foreground font-medium">{t("noMenu")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductDetail(props: {
  product: MenuItem;
  isKiosk: boolean;
  onAdd: (item: CartItem) => void;
  onBack: () => void;
}) {
  const { product, isKiosk, onAdd, onBack } = props;
  const t = useTranslations("SelfOrder");
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];

  return (
    <div className="mx-auto max-w-xl space-y-5 bg-card border rounded-3xl p-5 shadow-sm">
      <Button variant="ghost" size="sm" onClick={onBack} className="rounded-xl h-8 px-2.5 text-xs text-muted-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> {t("back")}
      </Button>

      {product.imageUrl && (
        <div className="aspect-video w-full overflow-hidden rounded-2xl border shadow-2xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
        </div>
      )}

      <div>
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">{product.name}</h1>
        {product.description && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{product.description}</p>}
      </div>

      {product.variants.length > 1 && (
        <div className="space-y-2">
          <Label className="text-xs font-bold text-foreground">{t("options")}</Label>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <Button
                key={v.id}
                variant={v.id === variantId ? "default" : "outline"}
                size={isKiosk ? "lg" : "sm"}
                className={cn(
                  "rounded-xl text-xs font-semibold",
                  v.id === variantId && "bg-emerald-600 hover:bg-emerald-700 text-white"
                )}
                onClick={() => setVariantId(v.id)}
              >
                {v.name} · {rupiah(Number(v.priceAmount))}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="notes" className="text-xs font-bold text-foreground">Catatan Khusus</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Contoh: Tanpa gula, es sedikit, pedas sedang..."
          rows={2}
          className="rounded-2xl text-xs shadow-2xs resize-none"
        />
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {["🌶️ Pedas Sedang", "❄️ Less Ice", "🚫 Tanpa Gula", "🥛 Gula Pisah", "🥡 Bungkus"].map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-[11px] rounded-lg px-2 text-muted-foreground border-border/80 hover:bg-emerald-50 hover:text-emerald-800 dark:hover:bg-emerald-950/60"
              onClick={() => {
                setNotes((prev) => (prev ? `${prev}, ${preset}` : preset));
              }}
            >
              + {preset}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t gap-3">
        <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-8 text-center text-sm font-bold text-foreground">{quantity}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setQuantity(quantity + 1)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <Button
          size="lg"
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl h-11 text-sm shadow-xs"
          disabled={!variant}
          onClick={() => {
            if (!variant) return;
            onAdd({
              variantId: variant.id,
              productId: product.id,
              name: product.name,
              variantName: variant.name,
              price: Number(variant.priceAmount),
              quantity,
              notes: notes.trim() || undefined,
            });
          }}
        >
          {t("add")} · {variant ? rupiah(Number(variant.priceAmount) * quantity) : "—"}
        </Button>
      </div>
    </div>
  );
}

function CartView(props: {
  items: CartItem[];
  totalAmount: number;
  onChangeQty: (variantId: string, notes: string | undefined, q: number) => void;
  onRemove: (variantId: string, notes: string | undefined) => void;
  onCheckout: () => void;
  onBack: () => void;
}) {
  const { items, totalAmount, onChangeQty, onRemove, onCheckout, onBack } = props;
  const t = useTranslations("SelfOrder");

  return (
    <div className="mx-auto max-w-xl space-y-5 bg-card border rounded-3xl p-5 shadow-sm">
      <Button variant="ghost" size="sm" onClick={onBack} className="rounded-xl h-8 px-2.5 text-xs text-muted-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> {t("backToMenu")}
      </Button>

      <h1 className="text-xl font-bold text-foreground">{t("cartTitle")}</h1>

      {items.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          <p>{t("cartEmpty")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {items.map((i) => (
              <div key={`${i.variantId}-${i.notes ?? ""}`} className="flex items-start justify-between gap-3 rounded-2xl border p-3.5 bg-card/60 shadow-2xs">
                <div className="flex-1 space-y-1">
                  <p className="font-bold text-sm text-foreground">{i.name}</p>
                  <p className="text-xs text-muted-foreground">{i.variantName} · {rupiah(i.price)}</p>
                  {i.notes && <p className="text-[11px] italic text-muted-foreground/80 mt-0.5">&ldquo;{i.notes}&rdquo;</p>}
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="font-extrabold text-sm text-foreground">{rupiah(i.price * i.quantity)}</span>
                  <div className="flex items-center gap-1.5 border rounded-lg p-0.5 bg-muted/30">
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded" onClick={() => onChangeQty(i.variantId, i.notes, i.quantity - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="min-w-6 text-center text-xs font-bold">{i.quantity}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded" onClick={() => onChangeQty(i.variantId, i.notes, i.quantity + 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded text-rose-600" onClick={() => onRemove(i.variantId, i.notes)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex items-center justify-between text-foreground pt-1">
            <span className="text-base font-bold">{t("total")}</span>
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{rupiah(totalAmount)}</span>
          </div>

          <Button
            size="lg"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl h-11 text-sm shadow-xs"
            onClick={onCheckout}
          >
            Lanjut ke Pembayaran
          </Button>
        </div>
      )}
    </div>
  );
}

function PaymentView(props: {
  token: string;
  items: CartItem[];
  totalAmount: number;
  isKiosk: boolean;
  onPaid: (orderId: string) => void;
  onBack: () => void;
}) {
  const { token, items, totalAmount, onPaid, onBack } = props;
  const t = useTranslations("SelfOrder");
  const [method, setMethod] = useState<"qris" | "e_wallet">("qris");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const create = await selfOrderFetch<{ order: { id: string }; payment: { provider: string } }>(
        "/api/v1/self-order/orders",
        {
          method: "POST",
          body: JSON.stringify({
            token,
            items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, notes: i.notes })),
            paymentMethod: method,
          }),
        },
      );
      const orderId = create.data.order.id;
      const charge = await selfOrderFetch<{ invoiceUrl: string | null; externalId: string }>(
        "/api/v1/self-order/payments",
        {
          method: "POST",
          token,
          body: JSON.stringify({ token, orderId, paymentMethods: method === "qris" ? ["QRIS"] : ["OVO", "DANA", "SHOPEEPAY"] }),
        },
      );
      if (charge.data.invoiceUrl) {
        window.location.href = charge.data.invoiceUrl;
      } else {
        onPaid(orderId);
      }
    } catch (e) {
      const message = e instanceof SelfOrderApiError ? e.message : t("failedPayment");
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 bg-card border rounded-3xl p-5 shadow-sm">
      <Button variant="ghost" size="sm" onClick={onBack} className="rounded-xl h-8 px-2.5 text-xs text-muted-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> {t("back")}
      </Button>

      <div className="space-y-1">
        <h1 className="text-xl font-bold text-foreground">{t("paymentTitle")}</h1>
        <p className="text-xs text-muted-foreground">Pilih metode pembayaran Payment Gateway otomatis via Xendit.</p>
      </div>

      {/* Payment Method Cards */}
      <div className="space-y-2">
        <Label className="text-xs font-bold text-foreground">Metode Pembayaran Mandiri</Label>
        <div className="grid grid-cols-2 gap-3">
          <div
            onClick={() => setMethod("qris")}
            className={cn(
              "cursor-pointer rounded-2xl border p-4 transition-all flex flex-col justify-between gap-3 text-left",
              method === "qris"
                ? "border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/60 ring-2 ring-emerald-500/20"
                : "bg-card hover:bg-muted/40"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-sm text-foreground">QRIS Instant</span>
              <Badge variant="outline" className="text-[10px] bg-background">Semua Bank</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">BCA, Mandiri, GoPay, OVO, ShopeePay, LinkAja</p>
          </div>

          <div
            onClick={() => setMethod("e_wallet")}
            className={cn(
              "cursor-pointer rounded-2xl border p-4 transition-all flex flex-col justify-between gap-3 text-left",
              method === "e_wallet"
                ? "border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/60 ring-2 ring-emerald-500/20"
                : "bg-card hover:bg-muted/40"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-sm text-foreground">E-Wallet</span>
              <Badge variant="outline" className="text-[10px] bg-background">Direct App</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">OVO, DANA, ShopeePay</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Total Amount Breakdown */}
      <div className="flex items-center justify-between text-foreground">
        <span className="text-base font-bold">{t("total")}</span>
        <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{rupiah(totalAmount)}</span>
      </div>

      {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}

      <Button
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl h-12 text-sm shadow-xs gap-2"
        size="lg"
        onClick={submit}
        disabled={submitting || items.length === 0}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Memproses Payment...
          </>
        ) : (
          `Bayar Sekarang · ${rupiah(totalAmount)}`
        )}
      </Button>

      <p className="text-[10px] text-center text-muted-foreground">
        🔒 Transaksi aman &amp; terenkripsi via Xendit Payment Gateway.
      </p>
    </div>
  );
}

function TrackingView({ orderId, token, isKiosk }: { orderId: string; token: string; isKiosk: boolean }) {
  const { status, loading, error } = useOrderStatus(orderId, token);
  if (loading && !status) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (error && !status) {
    return <div className="p-6 text-center text-destructive">{error}</div>;
  }
  if (!status) return null;
  void isKiosk;
  return <OrderTimeline status={status} />;
}

function OrderTimeline({ status }: { status: OrderStatus }) {
  const t = useTranslations("SelfOrder");
  const order = status.order;
  const kitchen = status.kitchenTicket;

  const isPaid = ["confirmed", "paid", "partially_refunded", "refunded", "completed"].includes(order.status);
  const isCooking = kitchen ? ["cooking", "ready", "served"].includes(kitchen.status) : false;
  const isReady = kitchen ? ["ready", "served"].includes(kitchen.status) : false;

  const steps = [
    { key: "pending", label: "Pesanan Diterima", icon: Clock, done: order.status !== "cancelled" },
    { key: "paid", label: "Pembayaran Lunas", icon: CheckCircle2, done: isPaid },
    { key: "cooking", label: "Sedang Dimasak Dapur", icon: ChefHat, done: isCooking },
    { key: "ready", label: "Siap Disajikan di Meja", icon: Utensils, done: isReady },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-5 bg-card border rounded-3xl p-5 shadow-sm">
      {/* Header Invoice Banner */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-2.5 py-0.5 rounded-full mb-1">
            {isPaid ? "✓ LUNAS" : "MENUNGGU PEMBAYARAN"}
          </Badge>
          <h1 className="text-xl font-bold text-foreground">Invoice &amp; Struk Digital</h1>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">#{order.orderNumber}</p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="rounded-xl text-xs gap-1.5 h-9"
          onClick={() => window.print()}
        >
          <Printer className="size-3.5" /> Cetak Struk
        </Button>
      </div>

      {/* Live Timeline Tracker */}
      <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
        <h2 className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Status Pesanan Live
        </h2>

        <div className="grid grid-cols-4 gap-2 pt-1 text-center">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.key} className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex size-9 items-center justify-center rounded-2xl border transition-all",
                    s.done
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                      : "bg-background text-muted-foreground border-border/80"
                  )}
                >
                  <Icon className="size-4" />
                </div>
                <span className={cn("text-[10px] font-semibold leading-tight", s.done ? "text-foreground font-bold" : "text-muted-foreground")}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Itemized Receipt Details */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-foreground">Rincian Item Pesanan</h2>
        <div className="space-y-2 rounded-2xl border bg-card p-3.5 shadow-2xs divide-y divide-dashed">
          {status.items.map((i) => {
            const qty = Number(i.quantity) || 1;
            const total = Number(i.totalAmount) || 0;
            const unitPrice = total / qty;
            return (
              <div key={i.id} className="flex items-start justify-between text-xs pt-2 first:pt-0">
                <div>
                  <p className="font-bold text-foreground">{i.name}</p>
                  <p className="text-[11px] text-muted-foreground">{i.quantity} x {rupiah(unitPrice)}</p>
                </div>
                <span className="font-extrabold text-foreground">{rupiah(total)}</span>
              </div>
            );
          })}
        </div>

        {/* Total Summary */}
        <div className="rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200/80 p-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">Total Pembayaran</p>
            <p className="text-[10px] text-emerald-700 dark:text-emerald-400">Terbayar via Payment Gateway</p>
          </div>
          <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {rupiah(Number(order.totalAmount))}
          </span>
        </div>
      </div>

      {order.status === "cancelled" && (
        <p className="rounded-xl bg-rose-50 p-3 text-center text-xs font-bold text-rose-600 border border-rose-200">
          {t("orderCancelled")}
        </p>
      )}

      <div className="pt-2 text-center">
        <Button
          variant="outline"
          className="rounded-2xl text-xs font-semibold w-full h-10 border-muted"
          onClick={() => window.location.reload()}
        >
          Pesan Menu Tambahan
        </Button>
      </div>
    </div>
  );
}
