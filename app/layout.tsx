import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { PwaRegister } from "@/components/pwa-register"
import { GooeyToaster } from "@/components/gooey-toaster"
import { ThemeProvider } from "@/components/theme-provider"
import { CookieConsent } from "@/components/cookie-consent"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: { default: "Kasir-Ku — Smart Point of Sale", template: "%s | Kasir-Ku" },
  description: "POS cloud modern untuk penjualan, inventory, pelanggan, keuangan, laporan, dan AI analytics.",
  applicationName: "Kasir-Ku",
}

export const viewport: Viewport = { themeColor: "#059669", width: "device-width", initialScale: 1 }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
          <PwaRegister />
          <GooeyToaster />
          <CookieConsent />
        </ThemeProvider>
      </body>
    </html>
  )
}
