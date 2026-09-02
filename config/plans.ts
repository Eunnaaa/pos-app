export type PlanId = "free" | "pro" | "business";
export type BillingCycle = "monthly" | "yearly";

export interface PlanLimits {
  maxMonthlyOrders: number;
  maxProducts: number;
  maxBranches: number;
  maxMembers: number;
  maxWarehouses: number;
  historyDays: number;
}

export interface PlanFeatures {
  recipeBOM: boolean; // Bahan baku & resep otomatis
  exportReports: boolean; // Export data ke Excel / CSV / PDF
  whatsappRecap: boolean; // Notifikasi rekap shift via WhatsApp
  aiAdvisor: boolean; // AI Business Advisor & Prediksi Penjualan
  watermarkFreeReceipt: boolean; // Struk tanpa watermark Kedai-Ku
  multiBranchTransfer: boolean; // Transfer stok antar cabang
  promotionsAndDiscounts: boolean; // Voucher promo & diskon kustom
  tableManagement: boolean; // Denah & manajemen meja
  selfOrderQR: boolean; // Self Order QR Meja & digital menu
}

export interface PlanConfig {
  id: PlanId;
  name: string;
  badge: string;
  description: string;
  priceMonthly: number; // in IDR
  priceYearly: number; // in IDR (per month when billed annually)
  limits: PlanLimits;
  features: PlanFeatures;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    name: "Starter",
    badge: "Gratis",
    description: "Cocok untuk UMKM pemula, booth, dan usaha mandiri 1 kasir.",
    priceMonthly: 0,
    priceYearly: 0,
    limits: {
      maxMonthlyOrders: 100,
      maxProducts: 20,
      maxBranches: 1,
      maxMembers: 1,
      maxWarehouses: 1,
      historyDays: 3,
    },
    features: {
      recipeBOM: false,
      exportReports: false,
      whatsappRecap: false,
      aiAdvisor: false,
      watermarkFreeReceipt: false,
      multiBranchTransfer: false,
      promotionsAndDiscounts: false,
      tableManagement: false,
      selfOrderQR: false,
    },
  },
  pro: {
    id: "pro",
    name: "Kedai-Ku Pro",
    badge: "Paling Populer",
    description: "Untuk kafe, kedai kopi, dan resto yang butuh kelola stok detail & tim.",
    priceMonthly: 99000,
    priceYearly: 79000,
    limits: {
      maxMonthlyOrders: Infinity,
      maxProducts: Infinity,
      maxBranches: 5,
      maxMembers: Infinity,
      maxWarehouses: 3,
      historyDays: 365,
    },
    features: {
      recipeBOM: true,
      exportReports: true,
      whatsappRecap: true,
      aiAdvisor: true,
      watermarkFreeReceipt: true,
      multiBranchTransfer: true,
      promotionsAndDiscounts: true,
      tableManagement: true,
      selfOrderQR: true,
    },
  },
  business: {
    id: "business",
    name: "Kedai-Ku Business",
    badge: "Multi-Cabang",
    description: "Untuk bisnis berkembang dengan banyak cabang, franchise, dan gudang pusat.",
    priceMonthly: 249000,
    priceYearly: 199000,
    limits: {
      maxMonthlyOrders: Infinity,
      maxProducts: Infinity,
      maxBranches: 20,
      maxMembers: Infinity,
      maxWarehouses: 10,
      historyDays: Infinity,
    },
    features: {
      recipeBOM: true,
      exportReports: true,
      whatsappRecap: true,
      aiAdvisor: true,
      watermarkFreeReceipt: true,
      multiBranchTransfer: true,
      promotionsAndDiscounts: true,
      tableManagement: true,
      selfOrderQR: true,
    },
  },
};

export const TRIAL_DURATION_DAYS = 14;
