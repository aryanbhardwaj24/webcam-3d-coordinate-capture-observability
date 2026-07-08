import type { Metadata } from "next"

import { AppProviders } from "@/components/providers/AppProviders"

import "./globals.css"

export const metadata: Metadata = {
  title: "Calibrated Multi-Cam Capture",
  description: "SigNoz-inspired control plane for the local 3D capture engine",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
