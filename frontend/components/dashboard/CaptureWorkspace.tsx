"use client"

import * as React from "react"

import { LiveCaptureHub } from "@/components/dashboard/LiveCaptureHub"
import { OperatorShell } from "@/components/dashboard/OperatorShell"
import { ProfileMenu } from "@/components/dashboard/ProfileMenu"
import { StatStrip } from "@/components/dashboard/StatStrip"
import { TelemetryBadge } from "@/components/dashboard/TelemetryBadge"
import { hasBrowserTelemetryConfig } from "@/lib/telemetry/config"

export function CaptureWorkspace() {
  const [status, setStatus] = React.useState<"live" | "standby" | "offline">("offline")
  const engineTarget = "Browser WebAssembly"
  const reconnectCadence = "Frame-synced"
  const overlayState = status === "live" ? "Active" : status === "standby" ? "Starting" : "Offline"

  return (
    <OperatorShell
      title="Live capture workspace"
      description="Keep the browser WebAssembly runtime warm, monitor HUD overlays, and validate client-side tracking behavior before a clinical scoring session begins."
      status={status}
      allowPageScroll
      plainBackground
      solidHeader
      headerControls={
        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-wrap justify-end gap-3">
            <TelemetryBadge
              tone={status}
              label={status === "live" ? "Client vision live" : status === "standby" ? "Client vision loading" : "Client vision offline"}
            />
            <TelemetryBadge
              tone={hasBrowserTelemetryConfig() ? "live" : "standby"}
              label={hasBrowserTelemetryConfig() ? "Browser telemetry active" : "Browser telemetry unavailable"}
            />
          </div>
          <div className="flex justify-end">
            <ProfileMenu />
          </div>
        </div>
      }
    >
      <div className="grid gap-6">
        <StatStrip
          items={[
            { label: "Engine target", value: engineTarget, detail: "MediaPipe tasks running directly in the browser" },
            { label: "Reconnect cadence", value: reconnectCadence, detail: "Inference follows the live WebCamera frame clock" },
            {
              label: "Overlay state",
              value: overlayState,
              detail: "Heads-up display overlays stay visible in the capture view.",
            },
          ]}
        />

        <LiveCaptureHub onStatusChange={setStatus} />
      </div>
    </OperatorShell>
  )
}
