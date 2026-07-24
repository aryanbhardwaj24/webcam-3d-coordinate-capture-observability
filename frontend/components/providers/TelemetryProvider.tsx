"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { flushBrowserTelemetry, recordBrowserPageView, startBrowserTelemetry } from "@/lib/telemetry/client"

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  React.useEffect(() => {
    startBrowserTelemetry()
  }, [])

  React.useEffect(() => {
    if (!pathname) return
    recordBrowserPageView(pathname)
  }, [pathname])

  React.useEffect(() => {
    function handlePageHide() {
      void flushBrowserTelemetry()
    }

    window.addEventListener("pagehide", handlePageHide)

    return () => {
      window.removeEventListener("pagehide", handlePageHide)
    }
  }, [])

  return <>{children}</>
}
