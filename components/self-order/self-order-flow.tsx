"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, ShoppingCart, Trash2, ArrowLeft, Loader2, CheckCircle2, Clock, ChefHat, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { selfOrderFetch, SelfOrderApiError } from "@/lib/client/self-order-api";
import { useSelfOrderCart, type CartItem } from "@/hooks/use-self-order-cart";
import { useOrderStatus, type OrderStatus } from "@/hooks/use-order-status";

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
  const isKiosk = variant === "kiosk";
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<Step>("menu");
  const [activeProduct, setActiveProduct] = useState<MenuItem | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const cart = useSelfOrderCart(token);

  useEffect(() => {
    void (async () => {
      try {
        const res = await selfOrderFetch<MenuData>(`/api/v1/self-order/menu?token=${encodeURIComponent(token)}`);
        setMenu(res.data);
        if (res.data.categories[0]) setActiveCategory(res.data.categories[0].id);
      } catch (e) {
        setError(e instanceof SelfOrderApiError ? e.message : "Gagal memuat menu");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const filteredProducts = useMemo(() => {
    if (!menu) return [];
    const cat = menu.categories.find((c) => c.id === activeCategory);
    let list = cat?.products ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.variants.some((v) => v.sku.toLowerCase().includes(q)));
    }
    return list;
  }, [menu, activeCategory, search]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-destructive">{error}</p>
        <Button onClick={() => window.location.reload()}>Coba lagi</Button>
      </div>
    );
  }

  if (!menu) return null;

  return (
    <div className={cn("min-h-dvh bg-background", isKiosk && "text-2xl")}>
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4 gap-3">
          <div className="min-w-0">
            <p className="font-semibold truncate">{menu.organization.name}</p>
            <p className="text-xs text-muted-foreground">Meja {menu.table.name}{menu.table.area ? ` · ${menu.table.area}` : ""}</p>
          </div>
          {step !== "menu" && (
            <Button variant="ghost" size="sm" onClick={() => setStep(step === "tracking" ? "tracking" : "menu")}>
              <ArrowLeft className="h-4 w-4" /> Menu
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setStep("cart")} className="relative">
            <ShoppingCart className="h-4 w-4" />
            {cart.totalItems > 0 && (
              <Badge className="absolute -right-2 -top-2 h-5 min-w-5 justify-center rounded-full px-1 text-xs">
                {cart.totalItems}
              </Badge>
            )}
          </Button>
        </div>
      </header>

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
            onSelect={(p) => { setActiveProduct(p); setStep("product"); }}
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
  onSelect: (p: MenuItem) => void;
}) {
  const { menu, activeCategory, setActiveCategory, search, setSearch, filteredProducts, isKiosk, onSelect } = props;
  return (
    <div className="space-y-6">
      <Input
        placeholder="Cari menu atau SKU…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={cn(isKiosk && "h-14 text-lg")}
      />
      <div className="flex flex-wrap gap-2">
        {menu.categories.map((c) => (
          <Button
            key={c.id}
            variant={c.id === activeCategory ? "default" : "outline"}
            size={isKiosk ? "lg" : "sm"}
            onClick={() => setActiveCategory(c.id)}
          >
            {c.name}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filteredProducts.map((p) => {
          const v = p.variants[0];
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition hover:shadow-md"
            >
              <div className="aspect-square overflow-hidden bg-muted">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl">🍽️</div>
                )}
              </div>
              <div className="space-y-1 p-3">
                <p className="line-clamp-2 font-medium leading-tight">{p.name}</p>
                {v && <p className="text-sm font-semibold text-primary">{rupiah(Number(v.priceAmount))}</p>}
              </div>
            </button>
          );
        })}
        {filteredProducts.length === 0 && <p className="col-span-full text-center text-muted-foreground">Tidak ada menu.</p>}
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
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Kembali</Button>
      {product.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.imageUrl} alt={product.name} className="aspect-video w-full rounded-xl object-cover" />
      )}
      <h1 className="text-2xl font-bold">{product.name}</h1>
      {product.description && <p className="text-muted-foreground">{product.description}</p>}
      {product.variants.length > 1 && (
        <div className="space-y-2">
          <Label>Pilihan</Label>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <Button
                key={v.id}
                variant={v.id === variantId ? "default" : "outline"}
                size={isKiosk ? "lg" : "default"}
                onClick={() => setVariantId(v.id)}
              >
                {v.name} · {rupiah(Number(v.priceAmount))}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="notes">Catatan (contoh: pedas, tanpa es)</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catatan untuk dapur" rows={2} />
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus className="h-4 w-4" /></Button>
        <span className="min-w-10 text-center text-lg font-semibold">{quantity}</span>
        <Button variant="outline" size="icon" onClick={() => setQuantity(quantity + 1)}><Plus className="h-4 w-4" /></Button>
        <Separator orientation="vertical" className="h-8" />
        <Button
          size={isKiosk ? "lg" : "lg"}
          className="flex-1"
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
          Tambah · {variant ? rupiah(Number(variant.priceAmount) * quantity) : "—"}
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
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Kembali ke menu</Button>
      <h1 className="text-2xl font-bold">Keranjang</h1>
      {items.length === 0 ? (
        <p className="text-muted-foreground">Keranjang kosong.</p>
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <div key={`${i.variantId}-${i.notes ?? ""}`} className="flex items-start gap-3 rounded-lg border p-3">
              <div className="flex-1 space-y-1">
                <p className="font-medium">{i.name}</p>
                <p className="text-sm text-muted-foreground">{i.variantName} · {rupiah(i.price)}</p>
                {i.notes && <p className="text-sm italic text-muted-foreground">“{i.notes}”</p>}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => onChangeQty(i.variantId, i.notes, i.quantity - 1)}><Minus className="h-4 w-4" /></Button>
                <span className="min-w-8 text-center">{i.quantity}</span>
                <Button variant="outline" size="icon" onClick={() => onChangeQty(i.variantId, i.notes, i.quantity + 1)}><Plus className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => onRemove(i.variantId, i.notes)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <p className="min-w-24 text-right font-semibold">{rupiah(i.price * i.quantity)}</p>
            </div>
          ))}
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-2xl font-bold">{rupiah(totalAmount)}</span>
          </div>
          <Button size="lg" className="w-full" onClick={onCheckout}>Lanjut ke Pembayaran</Button>
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
  const { token, items, totalAmount, isKiosk, onPaid, onBack } = props;
  const [method, setMethod] = useState<"qris" | "e_wallet">("qris");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSubmitting(true); setError("");
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
          body: JSON.stringify({ orderId, paymentMethods: method === "qris" ? ["QRIS"] : ["OVO", "DANA", "SHOPEEPAY"] }),
        },
      );
      if (charge.data.invoiceUrl) {
        window.location.href = charge.data.invoiceUrl;
      } else {
        onPaid(orderId);
      }
    } catch (e) {
      setError(e instanceof SelfOrderApiError ? e.message : "Gagal membuat pembayaran");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Kembali</Button>
      <h1 className="text-2xl font-bold">Pembayaran</h1>
      <div className="space-y-2">
        <Label>Metode</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={method === "qris" ? "default" : "outline"} size={isKiosk ? "lg" : "default"} onClick={() => setMethod("qris")}>QRIS</Button>
          <Button variant={method === "e_wallet" ? "default" : "outline"} size={isKiosk ? "lg" : "default"} onClick={() => setMethod("e_wallet")}>E-Wallet</Button>
        </div>
      </div>
      <Separator />
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">Total</span>
        <span className="text-2xl font-bold">{rupiah(totalAmount)}</span>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      <Button className="w-full" size="lg" onClick={submit} disabled={submitting || items.length === 0}>
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Bayar dengan Xendit
      </Button>
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
  const order = status.order;
  const kitchen = status.kitchenTicket;
  const steps = [
    { key: "pending", label: "Order Diterima", icon: Clock, done: order.status !== "cancelled" },
    { key: "paid", label: "Pembayaran Dikonfirmasi", icon: CheckCircle2, done: ["confirmed", "paid", "partially_refunded", "refunded", "completed"].includes(order.status) },
    { key: "cooking", label: "Diproses Dapur", icon: ChefHat, done: kitchen ? ["cooking", "ready", "served"].includes(kitchen.status) : false },
    { key: "ready", label: "Siap Disajikan", icon: Utensils, done: kitchen ? ["ready", "served"].includes(kitchen.status) : false },
  ];
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Status Pesanan</h1>
      <p className="text-sm text-muted-foreground">#{order.orderNumber}</p>
      <ol className="space-y-4">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.key} className="flex items-start gap-3">
              <span className={cn("flex h-10 w-10 items-center justify-center rounded-full border", s.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="pt-1">
                <p className="font-medium">{s.label}</p>
                {!s.done && <p className="text-sm text-muted-foreground">Menunggu…</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <Separator />
      <div className="space-y-2">
        <h2 className="font-semibold">Item</h2>
        {status.items.map((i) => (
          <div key={i.id} className="flex justify-between text-sm">
            <span>{i.name} × {i.quantity}</span>
            <span>{rupiah(Number(i.totalAmount))}</span>
          </div>
        ))}
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>{rupiah(Number(order.totalAmount))}</span>
        </div>
      </div>
      {order.status === "cancelled" && (
        <p className="rounded-lg bg-destructive/10 p-3 text-center text-destructive">Pesanan dibatalkan.</p>
      )}
    </div>
  );
}
