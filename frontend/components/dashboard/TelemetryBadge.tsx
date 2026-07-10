"use client"

import { cx } from "@/utils/cx"

export function TelemetryBadge({
  tone = "standby",
  label,
}: {
  tone?: "live" | "standby" | "offline"
  label: string
}) {
  return (
    <div className="glass-inset inline-flex items-center gap-3 px-3 py-2 text-sm text-white/75">
      <span
        className={cx(
          tone === "live" ? "status-dot-live" : tone === "offline" ? "status-dot-down" : "status-dot-warn"
        )}
      />
      <span>{label}</span>
    </div>
  )
}
