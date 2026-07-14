"use client"

import * as React from "react"

import { LiveCaptureHub } from "@/components/dashboard/LiveCaptureHub"
import { OperatorShell } from "@/components/dashboard/OperatorShell"
import { ProfileMenu } from "@/components/dashboard/ProfileMenu"
import { StatStrip } from "@/components/dashboard/StatStrip"
import { TelemetryBadge } from "@/components/dashboard/TelemetryBadge"
import { ENGINE_RECONNECT_INTERVAL_MS, ENGINE_WEBSOCKET_URL } from "@/lib/engine"
import { hasBrowserTelemetryConfig } from "@/lib/telemetry/config"

export function CaptureWorkspace() {
  const [status, setStatus] = React.useState<"live" | "standby" | "offline">("offline")
  const engineTarget = React.useMemo(() => {
    try {
      return new URL(ENGINE_WEBSOCKET_URL).hostname || "localhost"
    } catch {
      return "localhost"
    }
  }, [])
  const reconnectCadence = `${(ENGINE_RECONNECT_INTERVAL_MS / 1000).toFixed(1)}s`
  const overlayState = status === "live" ? "Active" : status === "standby" ? "Starting" : "Offline"

  return (
    <OperatorShell
      title="Live capture workspace"
      description="Keep the local Docker engine online, monitor HUD overlays, and validate reconnect behavior before a clinical scoring session begins."
      status={status}
      allowPageScroll
      plainBackground
      solidHeader
      headerControls={
        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-wrap justify-end gap-3">
            <TelemetryBadge
              tone={status}
              label={status === "live" ? "Engine stream live" : status === "standby" ? "Reconnect in progress" : "Engine offline"}
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
            { label: "Engine target", value: engineTarget, detail: "Dockerized FastAPI computer vision engine" },
            { label: "Reconnect cadence", value: reconnectCadence, detail: "Automatic WebSocket retry loop" },
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
