"use client"

import { AnalyticsCenter } from "@/components/dashboard/AnalyticsCenter"
import { OperatorShell } from "@/components/dashboard/OperatorShell"
import { StatStrip } from "@/components/dashboard/StatStrip"

export function AnalyticsWorkspace() {
  return (
    <OperatorShell
      title="Analytics review center"
      description="Inspect session throughput, drift correction, and export readiness before sending bundles to Drive in the browser."
      status="standby"
    >
      <StatStrip
        items={[
          { label: "Bundle source", value: "Browser", detail: "JSZip packages files client-side" },
          { label: "Drive path", value: "Pending", detail: "GIS upload wiring arrives in Phase 4" },
          { label: "Telemetry posture", value: "Ready", detail: "OTLP endpoint placeholder already surfaced" },
        ]}
      />
      <AnalyticsCenter />
    </OperatorShell>
  )
}

