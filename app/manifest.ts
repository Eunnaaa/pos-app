import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kedai-Ku — Smart Point of Sale",
    short_name: "Kedai-Ku",
    description: "POS, inventory, pelanggan, keuangan, laporan, dan AI analytics untuk bisnis Indonesia.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#059669",
    lang: "id",
    orientation: "any",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/kedai-ku-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/kedai-ku-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/kedai-ku-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Buka Kasir", short_name: "Kasir", url: "/dashboard/pos", icons: [{ src: "/kedai-ku-icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Inventory", short_name: "Stok", url: "/dashboard/inventory", icons: [{ src: "/kedai-ku-icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
