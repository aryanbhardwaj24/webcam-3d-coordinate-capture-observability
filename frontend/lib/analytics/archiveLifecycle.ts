"use client"

import {
  clearAnalyticsCaptureSession,
  getAnalyticsCaptureArtifacts,
  getAnalyticsCaptureSnapshot,
} from "@/lib/analytics/captureSession"
import { buildAnalyticsZipBundleFromSource } from "@/lib/analytics/exportBundle"
import {
  addOrUpdateLocalArchivedCaptureSession,
  updateLocalArchivedCaptureSession,
} from "@/lib/analytics/sessionArchives"
import { syncCaptureSessionToSupabase } from "@/lib/analytics/supabaseSync"

export async function finalizeActiveCaptureSession(userId: string | null) {
  const snapshot = getAnalyticsCaptureSnapshot()
  const artifacts = getAnalyticsCaptureArtifacts()

  if (!artifacts.captureSessionId || (snapshot.frameCount === 0 && artifacts.snapshots.length === 0)) {
    clearAnalyticsCaptureSession()
    return null
  }

  clearAnalyticsCaptureSession()

  const archive = await buildAnalyticsZipBundleFromSource(
    {
      snapshot,
      snapshots: artifacts.snapshots,
    },
    {
      fileNamePrefix: "capture-session",
    }
  )

  addOrUpdateLocalArchivedCaptureSession({
    id: artifacts.captureSessionId,
    userId,
    source: "local",
    createdAt: archive.sessionSummary.lastCapturedAt ?? archive.generatedAt,
    startedAt: archive.sessionSummary.startedAt,
    endedAt: archive.sessionSummary.lastCapturedAt,
    durationMs: archive.sessionSummary.durationMs,
    summary: archive.sessionSummary,
    bundleFileName: archive.fileName,
    zipPath: null,
    zipBlob: archive.blob,
    snapshotCount: artifacts.snapshots.length,
    syncStatus: userId ? "syncing" : "failed",
    syncError: userId ? null : "The capture finished locally, but no signed-in user was available for cloud sync.",
  })

  if (!userId) {
    return artifacts.captureSessionId
  }

  try {
    const { zipPath } = await syncCaptureSessionToSupabase({
      userId,
      sessionId: artifacts.captureSessionId,
      bundleFileName: archive.fileName,
      zipBlob: archive.blob,
      summary: archive.sessionSummary,
      snapshots: artifacts.snapshots,
    })

    updateLocalArchivedCaptureSession(artifacts.captureSessionId, {
      zipPath,
      syncStatus: "synced",
      syncError: null,
    })
  } catch (error) {
    updateLocalArchivedCaptureSession(artifacts.captureSessionId, {
      syncStatus: "failed",
      syncError: error instanceof Error ? error.message : "Cloud sync failed for this archived capture session.",
    })
  }

  return artifacts.captureSessionId
}
