"use client"

import * as React from "react"
import JSZip from "jszip"

import { Button } from "@/components/ui/Button"
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { useToast } from "@/components/ui/Toast"

const throughputPoints = [42, 48, 51, 58, 61, 67, 69]
const driftPoints = [8, 7, 7, 5, 4, 3, 3]
const exportFiles = {
  "analytics/session-summary.json": JSON.stringify(
    {
      generatedAt: "browser",
      sessions: 14,
      avgFps: 31.2,
      calibrationDriftMm: 3.4,
    },
    null,
    2
  ),
  "analytics/throughput.csv": "window,tracked_points\n08:00,42\n09:00,48\n10:00,51\n11:00,58\n12:00,61\n13:00,67\n14:00,69\n",
  "analytics/drift.csv": "window,drift_mm\n08:00,8\n09:00,7\n10:00,7\n11:00,5\n12:00,4\n13:00,3\n14:00,3\n",
}

function sparkline(points: number[]) {
  const max = Math.max(...points)
  const min = Math.min(...points)
  const height = 64
  const width = 240

  return points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * width
      const y = height - ((value - min) / Math.max(max - min, 1)) * (height - 10) - 5
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(" ")
}

export function AnalyticsCenter() {
  const { push } = useToast()
  const [exporting, setExporting] = React.useState(false)

  async function downloadZip() {
    setExporting(true)

    try {
      const zip = new JSZip()
      Object.entries(exportFiles).forEach(([path, contents]) => {
        zip.file(path, contents)
      })
      const blob = await zip.generateAsync({ type: "blob" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = "capture-analytics-bundle.zip"
      anchor.click()
      URL.revokeObjectURL(url)
      push({
        title: "ZIP export ready",
        detail: "Downloaded analytics bundle in the browser using JSZip.",
        tone: "success",
      })
    } catch (error) {
      push({
        title: "ZIP export failed",
        detail: error instanceof Error ? error.message : "Unknown export error",
        tone: "danger",
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Analytics Center</CardTitle>
          <CardDescription>Operator-ready stat cards, trend charts, and browser-side ZIP export with no server round trip.</CardDescription>
        </div>
        <Button type="button" variant="primary" onClick={downloadZip} loading={exporting}>
          Download ZIP bundle
        </Button>
      </CardHeader>
      <CardBody className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Sessions", "14", "+3 today"],
            ["Avg capture FPS", "31.2", "Above target"],
            ["Calibration drift", "3.4 mm", "-1.1 mm"],
            ["Export readiness", "98%", "All artifacts present"],
          ].map(([label, value, delta]) => (
            <div key={label} className="glass-inset p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-white/45">{label}</div>
              <div className="mt-3 text-2xl font-semibold">{value}</div>
              <div className="mt-2 text-sm text-white/50">{delta}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="glass-inset p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Tracked point throughput</div>
                <div className="text-sm text-white/45">Stable rise over the active calibration window.</div>
              </div>
              <div className="rounded-full bg-emerald-400/12 px-3 py-1 text-xs text-emerald-200">Healthy</div>
            </div>
            <svg viewBox="0 0 240 64" className="mt-6 h-28 w-full">
              <path d={sparkline(throughputPoints)} fill="none" stroke="rgba(34,211,238,0.95)" strokeWidth="3" />
            </svg>
            <div className="mt-3 flex justify-between text-xs text-white/35">
              <span>08:00</span>
              <span>14:00</span>
            </div>
          </div>

          <div className="glass-inset p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Drift correction trend</div>
                <div className="text-sm text-white/45">Progressively tighter calibration error across the shift.</div>
              </div>
              <div className="rounded-full bg-accent-violet/15 px-3 py-1 text-xs text-violet-200">Improving</div>
            </div>
            <svg viewBox="0 0 240 64" className="mt-6 h-28 w-full">
              <path d={sparkline(driftPoints)} fill="none" stroke="rgba(167,139,250,0.95)" strokeWidth="3" />
            </svg>
            <div className="mt-3 flex justify-between text-xs text-white/35">
              <span>08:00</span>
              <span>14:00</span>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
