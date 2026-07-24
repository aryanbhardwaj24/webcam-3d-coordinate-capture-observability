"use client"

import { AuthProvider } from "@/components/providers/AuthProvider"
import { TelemetryProvider } from "@/components/providers/TelemetryProvider"
import { ToastProvider } from "@/components/ui/Toast"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <TelemetryProvider>
        <AuthProvider>{children}</AuthProvider>
      </TelemetryProvider>
    </ToastProvider>
  )
}
