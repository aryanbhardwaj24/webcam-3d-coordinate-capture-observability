import type { Metadata } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: "CV Dashboard",
  description: "Glassmorphic Next.js frontend for a local CV engine",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}

