"use client"

import * as React from "react"

import { useAuth } from "@/components/providers/AuthProvider"
import {
  analyticsDriftPoints,
  analyticsThroughputPoints,
  buildAnalyticsZipBundle,
} from "@/lib/analytics/exportBundle"
import { uploadZipToDrive } from "@/lib/google/drive"
import { Button } from "@/components/ui/Button"
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { useToast } from "@/components/ui/Toast"

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
  const { hasSupabaseEnv, providerToken, recordArtifact, user } = useAuth()
  const [exporting, setExporting] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [lastUploadName, setLastUploadName] = React.useState<string | null>(null)
  const driveUploadReady = Boolean(providerToken)

  async function downloadZip() {
    setExporting(true)

    try {
      const { blob, fileCount, fileName } = await buildAnalyticsZipBundle()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(url)
      push({
        title: "ZIP export ready",
        detail: `Downloaded ${fileCount} analytics files in a browser-built ZIP bundle.`,
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

  async function uploadBundleToDrive() {
    if (!providerToken) {
      push({
        title: "Missing Google Authorization",
        detail: "Please log in with Google to enable Drive uploads.",
        tone: "danger",
      })
      return
    }

    if (uploading) {
      return
    }

    setUploading(true)

    try {
      const { blob, fileCount, fileName, generatedAt } = await buildAnalyticsZipBundle()
      const upload = await uploadZipToDrive({
        accessToken: providerToken,
        blob,
        fileName,
      })

      if (hasSupabaseEnv && user) {
        await recordArtifact({
          fileName,
          mimeType: "application/zip",
          byteSize: blob.size,
          driveFileId: upload.id,
          driveWebViewLink: upload.webViewLink ?? null,
          metadata: {
            exportSource: "browser",
            exportedFileCount: fileCount,
            generatedAt,
          },
        })
      }

      setLastUploadName(upload.name)
      push({
        title: "Drive upload complete",
        detail: upload.webViewLink ? `Opened ${upload.name} in Google Drive.` : `Uploaded ${upload.name} to Google Drive.`,
        tone: "success",
      })

      if (upload.webViewLink) {
        window.open(upload.webViewLink, "_blank", "noopener,noreferrer")
      }
    } catch (error) {
      push({
        title: "Drive upload failed",
        detail: error instanceof Error ? error.message : "An unknown error occurred during upload.",
        tone: "danger",
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Analytics Center</CardTitle>
          <CardDescription>
            Operator-ready stat cards, trend charts, and browser-side ZIP export with direct upload to Google Drive.
          </CardDescription>
          <div className="mt-2 text-sm text-white/45">
            {driveUploadReady ? "Google Drive upload is ready." : "Sign in with Google to enable Drive uploads."}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={downloadZip} loading={exporting}>
            Download ZIP bundle
          </Button>
          <Button type="button" variant="primary" onClick={uploadBundleToDrive} loading={uploading} disabled={!driveUploadReady || uploading}>
            Upload ZIP to Drive
          </Button>
        </div>
      </CardHeader>
      <CardBody className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Sessions", "14", "+3 today"],
            ["Avg capture FPS", "31.2", "Above target"],
            ["Calibration drift", "3.4 mm", "-1.1 mm"],
            ["Drive state", lastUploadName ? "Synced" : driveUploadReady ? "Ready" : "Sign in required", lastUploadName || "Google session required"],
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
              <path d={sparkline(analyticsThroughputPoints)} fill="none" stroke="rgba(34,211,238,0.95)" strokeWidth="3" />
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
              <path d={sparkline(analyticsDriftPoints)} fill="none" stroke="rgba(167,139,250,0.95)" strokeWidth="3" />
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
