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
      { src: "/kedai-ku-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/kedai-ku-icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Buka Kasir", short_name: "Kasir", url: "/dashboard/pos", icons: [{ src: "/kedai-ku-icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Inventory", short_name: "Stok", url: "/dashboard/inventory", icons: [{ src: "/kedai-ku-icon.svg", sizes: "any", type: "image/svg+xml" }] },
    ],
  };
}
