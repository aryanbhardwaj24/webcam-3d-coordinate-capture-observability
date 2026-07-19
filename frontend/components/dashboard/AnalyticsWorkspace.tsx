"use client"

import { AnalyticsCenter } from "@/components/dashboard/AnalyticsCenter"
import { OperatorShell } from "@/components/dashboard/OperatorShell"
import { ProfileMenu } from "@/components/dashboard/ProfileMenu"
import { StatStrip } from "@/components/dashboard/StatStrip"
import { TelemetryBadge } from "@/components/dashboard/TelemetryBadge"
import { hasBrowserTelemetryConfig } from "@/lib/telemetry/config"

export function AnalyticsWorkspace() {
  return (
    <OperatorShell
      title="Analytics review center"
      description="Inspect session throughput, drift correction, and export readiness before sending bundles to Drive in the browser."
      status="standby"
      allowPageScroll
      plainBackground
      solidHeader
      headerControls={
        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-wrap justify-end gap-3">
            <TelemetryBadge tone="standby" label="Reconnect in progress" />
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
            { label: "Bundle source", value: "Browser", detail: "JSZip packages files client-side" },
            { label: "Drive path", value: "Google Identity Services", detail: "drive.file upload runs entirely in the browser" },
            { label: "Telemetry posture", value: "Ready", detail: "Browser traces stay inside the app relay path" },
          ]}
        />
        <AnalyticsCenter />
      </div>
    </OperatorShell>
  )
}
