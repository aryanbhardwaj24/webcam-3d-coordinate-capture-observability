"use client"

import * as React from "react"

import { useAuth } from "@/components/providers/AuthProvider"
import { Button } from "@/components/ui/Button"
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Modal } from "@/components/ui/Modal"
import { useToast } from "@/components/ui/Toast"
import { buildCombinedArchivedSessionsZip } from "@/lib/analytics/exportBundle"
import { buildCombinedAnalyticsSummary, type ArchivedCaptureSession } from "@/lib/analytics/sessionArchives"
import { downloadArchivedCaptureSessionZip } from "@/lib/analytics/supabaseSync"
import { uploadZipToDrive } from "@/lib/google/drive"

function sparkline(points: number[]) {
  const max = Math.max(...points)
  const min = Math.min(...points)
  const height = 64
  const width = 240

  return points
    .map((value, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width
      const y = height - ((value - min) / Math.max(max - min, 1)) * (height - 10) - 5
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(" ")
}

function formatDateTime(value: string | null) {
  if (!value) return "Unavailable"

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

const EMPTY_CHART_POINTS = Array.from({ length: 7 }, () => 0)

export function AnalyticsCenter({
  archivedSessions,
  loadingArchivedSessions,
  pastSessionsOpen,
  onClosePastSessions,
  onNavigateToCapture,
}: {
  archivedSessions: ArchivedCaptureSession[]
  loadingArchivedSessions: boolean
  pastSessionsOpen: boolean
  onClosePastSessions: () => void
  onNavigateToCapture: () => void
}) {
  const { push } = useToast()
  const { connectGoogleDrive, hasSupabaseEnv, providerToken, recordArtifact, user } = useAuth()
  const [exportingCombined, setExportingCombined] = React.useState(false)
  const [uploadingCombined, setUploadingCombined] = React.useState(false)
  const [connectingGoogleDrive, setConnectingGoogleDrive] = React.useState(false)
  const [activeSessionActionId, setActiveSessionActionId] = React.useState<string | null>(null)
  const [lastUploadName, setLastUploadName] = React.useState<string | null>(null)

  const driveUploadReady = Boolean(providerToken)
  const hasArchivedSessions = archivedSessions.length > 0
  const combinedSummary = React.useMemo(
    () => (hasArchivedSessions ? buildCombinedAnalyticsSummary(archivedSessions.map((session) => session.summary)) : null),
    [archivedSessions, hasArchivedSessions]
  )
  const throughputPoints = combinedSummary?.chartBuckets.map((point) => point.throughput) ?? EMPTY_CHART_POINTS
  const driftPoints = combinedSummary?.chartBuckets.map((point) => point.driftPx) ?? EMPTY_CHART_POINTS
  const anySyncInProgress = archivedSessions.some((session) => session.syncStatus === "processing" || session.syncStatus === "syncing")

  async function resolveArchivedSessionBundle(session: ArchivedCaptureSession) {
    const blob = await downloadArchivedCaptureSessionZip(session)
    return {
      ...session,
      zipBlob: blob,
    }
  }

  async function buildCombinedBundle() {
    const resolvedSessions = await Promise.all(archivedSessions.map((session) => resolveArchivedSessionBundle(session)))
    return buildCombinedArchivedSessionsZip(resolvedSessions)
  }

  async function downloadCombinedZip() {
    if (!hasArchivedSessions || exportingCombined) return

    setExportingCombined(true)

    try {
      const { blob, fileCount, fileName } = await buildCombinedBundle()
      downloadBlob(blob, fileName)
      push({
        title: "Combined ZIP export ready",
        detail: `Downloaded a combined bundle containing ${fileCount} archived session files.`,
        tone: "success",
      })
    } catch (error) {
      push({
        title: "Combined ZIP export failed",
        detail: error instanceof Error ? error.message : "Unknown export error",
        tone: "danger",
      })
    } finally {
      setExportingCombined(false)
    }
  }

  async function uploadCombinedZipToDrive() {
    if (!providerToken || !hasArchivedSessions || uploadingCombined) {
      return
    }

    setUploadingCombined(true)

    try {
      const { blob, fileCount, fileName, generatedAt } = await buildCombinedBundle()
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
            exportSource: "combined_recent_sessions",
            archivedSessionCount: archivedSessions.length,
            exportedFileCount: fileCount,
            generatedAt,
          },
        })
      }

      setLastUploadName(upload.name)
      push({
        title: "Combined Drive upload complete",
        detail: upload.webViewLink ? `Opened ${upload.name} in Google Drive.` : `Uploaded ${upload.name} to Google Drive.`,
        tone: "success",
      })

      if (upload.webViewLink) {
        window.open(upload.webViewLink, "_blank", "noopener,noreferrer")
      }
    } catch (error) {
      push({
        title: "Combined Drive upload failed",
        detail: error instanceof Error ? error.message : "An unknown error occurred during upload.",
        tone: "danger",
      })
    } finally {
      setUploadingCombined(false)
    }
  }

  async function startGoogleDriveConnect() {
    if (connectingGoogleDrive) return

    setConnectingGoogleDrive(true)

    try {
      await connectGoogleDrive()
    } catch (error) {
      push({
        title: "Google Drive connection failed",
        detail: error instanceof Error ? error.message : "We could not connect Google Drive right now.",
        tone: "danger",
      })
      setConnectingGoogleDrive(false)
    }
  }

  async function downloadArchivedSession(session: ArchivedCaptureSession) {
    setActiveSessionActionId(`download:${session.id}`)

    try {
      const blob = await downloadArchivedCaptureSessionZip(session)
      downloadBlob(blob, session.bundleFileName)
      push({
        title: "Session bundle ready",
        detail: `Downloaded the archived bundle recorded on ${formatDateTime(session.endedAt ?? session.createdAt)}.`,
        tone: "success",
      })
    } catch (error) {
      push({
        title: "Session download failed",
        detail: error instanceof Error ? error.message : "Unknown download error",
        tone: "danger",
      })
    } finally {
      setActiveSessionActionId(null)
    }
  }

  async function uploadArchivedSessionToDrive(session: ArchivedCaptureSession) {
    if (!providerToken) {
      await startGoogleDriveConnect()
      return
    }

    setActiveSessionActionId(`upload:${session.id}`)

    try {
      const blob = await downloadArchivedCaptureSessionZip(session)
      const upload = await uploadZipToDrive({
        accessToken: providerToken,
        blob,
        fileName: session.bundleFileName,
      })

      if (hasSupabaseEnv && user) {
        await recordArtifact({
          fileName: session.bundleFileName,
          mimeType: "application/zip",
          byteSize: blob.size,
          driveFileId: upload.id,
          driveWebViewLink: upload.webViewLink ?? null,
          metadata: {
            exportSource: "single_archived_session",
            archiveSessionId: session.id,
            generatedAt: session.summary.generatedAt,
          },
        })
      }

      setLastUploadName(upload.name)
      push({
        title: "Session uploaded to Drive",
        detail: upload.webViewLink ? `Opened ${upload.name} in Google Drive.` : `Uploaded ${upload.name} to Google Drive.`,
        tone: "success",
      })

      if (upload.webViewLink) {
        window.open(upload.webViewLink, "_blank", "noopener,noreferrer")
      }
    } catch (error) {
      push({
        title: "Session Drive upload failed",
        detail: error instanceof Error ? error.message : "An unknown error occurred during upload.",
        tone: "danger",
      })
    } finally {
      setActiveSessionActionId(null)
    }
  }

  return (
    <>
      <Card className="relative overflow-hidden">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Analytics Center</CardTitle>
            <CardDescription>
              Review the newest archived sessions, merge their summary metrics, and export combined or per-session bundles on demand.
            </CardDescription>
            <div className="mt-2 text-sm text-white/45">
              {!hasArchivedSessions
                ? loadingArchivedSessions
                  ? "Loading archived sessions..."
                  : "Capture a session to start building your analytics history."
                : anySyncInProgress
                  ? "Recent capture processing is still finishing in the background."
                  : driveUploadReady
                    ? "Google Drive upload is ready."
                    : "Connect Google Drive to enable Drive uploads for this account."}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={downloadCombinedZip}
              loading={exportingCombined}
              disabled={!hasArchivedSessions}
            >
              Download Past Sessions ZIP Bundle
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={driveUploadReady ? uploadCombinedZipToDrive : startGoogleDriveConnect}
              loading={driveUploadReady ? uploadingCombined : connectingGoogleDrive}
              disabled={!hasArchivedSessions || (driveUploadReady ? uploadingCombined : connectingGoogleDrive)}
            >
              {driveUploadReady ? "Upload Past Sessions ZIP to Drive" : "Connect Google Drive"}
            </Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              [
                "Archived frames",
                combinedSummary ? `${combinedSummary.frameCount}` : "0",
                combinedSummary ? `Across ${archivedSessions.length} archived sessions` : "No archived session data yet",
              ],
              [
                "Avg capture FPS",
                combinedSummary ? `${combinedSummary.avgFps.toFixed(1)}` : "0.0",
                combinedSummary ? combinedSummary.frameLabel : "No completed sessions yet",
              ],
              [
                "Track drift",
                combinedSummary ? `${combinedSummary.avgDriftPx.toFixed(1)} px` : "0.0 px",
                combinedSummary ? `${combinedSummary.maxTrackCount} max active tracks` : "No drift samples yet",
              ],
              [
                "Drive state",
                lastUploadName ? "Synced" : driveUploadReady ? "Ready" : "Connection required",
                lastUploadName || (driveUploadReady ? "Google Drive upload is ready" : "Connect Google Drive to continue"),
              ],
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
                  <div className="text-sm font-semibold">Visible landmarks per frame</div>
                  <div className="text-sm text-white/45">Averaged across recent archived sessions and grouped into 7 segments.</div>
                </div>
                <div className="rounded-full bg-emerald-400/12 px-3 py-1 text-xs text-emerald-200">
                  {hasArchivedSessions ? "Ready" : loadingArchivedSessions ? "Loading" : "Empty"}
                </div>
              </div>
              <svg viewBox="0 0 240 64" className="mt-6 h-28 w-full">
                <path d={sparkline(throughputPoints)} fill="none" stroke="rgba(34,211,238,0.95)" strokeWidth="3" />
              </svg>
              <div className="mt-3 flex justify-between text-xs text-white/35">
                <span>Segment 1</span>
                <span>Segment 7</span>
              </div>
            </div>

            <div className="glass-inset p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Track drift trend</div>
                  <div className="text-sm text-white/45">Average person movement per frame, grouped into 7 segments.</div>
                </div>
                <div className="rounded-full bg-accent-violet/15 px-3 py-1 text-xs text-violet-200">
                  {hasArchivedSessions ? "Observed" : loadingArchivedSessions ? "Loading" : "Empty"}
                </div>
              </div>
              <svg viewBox="0 0 240 64" className="mt-6 h-28 w-full">
                <path d={sparkline(driftPoints)} fill="none" stroke="rgba(167,139,250,0.95)" strokeWidth="3" />
              </svg>
              <div className="mt-3 flex justify-between text-xs text-white/35">
                <span>Segment 1</span>
                <span>Segment 7</span>
              </div>
            </div>
          </div>
        </CardBody>
        {!loadingArchivedSessions && !hasArchivedSessions ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(3,5,10,0.84)] px-4 backdrop-blur-[22px]">
            <div className="w-full max-w-3xl border border-white/12 bg-[rgba(6,8,14,0.92)] shadow-[0_30px_120px_rgba(0,0,0,0.6)] glass-panel-strong ring-accent">
              <div className="px-6 pb-4 pt-6">
                <div className="text-base font-semibold tracking-tight">Capture a session to unlock analytics</div>
              </div>
              <div className="space-y-4 px-6 pb-6 text-sm text-white/75">
                <p>
                  No saved session data is available yet. Record a capture session first, then return here to review combined analytics,
                  browse recent history, and export archived bundles.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="primary" onClick={onNavigateToCapture}>
                    Capture
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      <Modal
        open={pastSessionsOpen}
        onClose={onClosePastSessions}
        title="Past Sessions"
        className="max-w-[calc(100vw-32px)]"
        closeLabel="Close past sessions"
      >
        <div className="space-y-4">
          {archivedSessions.map((session) => (
            <div key={session.id} className="glass-inset flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1 text-sm text-white/75">
                <div className="font-medium text-white">{formatDateTime(session.endedAt ?? session.createdAt)}</div>
                <div>Duration: {formatDuration(session.durationMs)}</div>
                <div className="text-white/45">
                  {session.syncStatus === "failed"
                    ? `Cloud sync failed: ${session.syncError ?? "Unknown sync error"}`
                    : session.syncStatus === "syncing"
                      ? "Background cloud sync in progress."
                      : `${session.snapshotCount} snapshots captured.`}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => downloadArchivedSession(session)}
                  loading={activeSessionActionId === `download:${session.id}`}
                >
                  Download ZIP Bundle
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => uploadArchivedSessionToDrive(session)}
                  loading={activeSessionActionId === `upload:${session.id}`}
                    disabled={connectingGoogleDrive}
                >
                    {driveUploadReady ? "Upload ZIP to Drive" : "Connect Google Drive"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}
