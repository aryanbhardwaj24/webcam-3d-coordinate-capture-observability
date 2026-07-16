"use client"

import * as React from "react"

import { LiveWebcameraPanel } from "@/components/dashboard/LiveWebcameraPanel"
import { OperatorShell } from "@/components/dashboard/OperatorShell"
import { TelemetryBadge } from "@/components/dashboard/TelemetryBadge"

export function DashboardExperience() {
  const [hasWebcameraAccess, setHasWebcameraAccess] = React.useState(false)

  return (
    <OperatorShell
      title="Operator console for live WebCamera capture"
      description="Check your live WebCamera feed and make sure browser access is working before you jump into capture."
      status="standby"
      allowPageScroll
      plainBackground
      solidHeader
      badges={
        <TelemetryBadge
          tone={hasWebcameraAccess ? "live" : "offline"}
          label={hasWebcameraAccess ? "WebCamera Access allowed" : "WebCamera Access required"}
        />
      }
    >
      <LiveWebcameraPanel onAccessChange={setHasWebcameraAccess} />
    </OperatorShell>
  )
}
