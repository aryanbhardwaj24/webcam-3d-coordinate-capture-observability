"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import type { AnalyticsSnapshotArtifact } from "@/lib/analytics/captureSession"
import type { AnalyticsSessionSummaryPayload, ArchivedCaptureSession } from "@/lib/analytics/sessionArchives"

const RAW_BUNDLES_BUCKET = "raw-bundles"
const SNAPSHOTS_BUCKET = "snapshots"
const SESSION_LIMIT = 5
const SNAPSHOT_BATCH_SIZE = 3

type CaptureSessionRow = {
  id: string
  user_id: string
  status: string
  started_at: string | null
  ended_at: string | null
  duration_ms: number
  bundle_file_name: string
  zip_path: string
  snapshot_count: number
  created_at: string
}

type CaptureSessionSummaryRow = {
  session_id: string
  payload: AnalyticsSessionSummaryPayload
}

type SyncCaptureSessionInput = {
  userId: string
  sessionId: string
  bundleFileName: string
  zipBlob: Blob
  summary: AnalyticsSessionSummaryPayload
  snapshots: AnalyticsSnapshotArtifact[]
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function uploadSnapshotsInBatches(userId: string, sessionId: string, snapshots: AnalyticsSnapshotArtifact[]) {
  const supabase = getSupabaseBrowserClient()
  const batches = chunkArray(snapshots, SNAPSHOT_BATCH_SIZE)

  for (const batch of batches) {
    await Promise.all(
      batch.map(async (snapshot) => {
        const path = `${userId}/${sessionId}/${snapshot.fileName}`
        const { error } = await supabase.storage.from(SNAPSHOTS_BUCKET).upload(path, snapshot.blob, {
          contentType: "image/jpeg",
          upsert: true,
        })

        if (error) throw error
      })
    )
  }
}

async function removeSnapshotFolder(userId: string, sessionId: string) {
  const supabase = getSupabaseBrowserClient()
  const folderPath = `${userId}/${sessionId}`
  const { data, error } = await supabase.storage.from(SNAPSHOTS_BUCKET).list(folderPath, {
    limit: 100,
    offset: 0,
  })

  if (error) throw error
  if (!data || data.length === 0) return

  const filePaths = data
    .filter((entry) => entry.name)
    .map((entry) => `${folderPath}/${entry.name}`)

  if (filePaths.length === 0) return

  const { error: removeError } = await supabase.storage.from(SNAPSHOTS_BUCKET).remove(filePaths)
  if (removeError) throw removeError
}

export async function enforceCaptureSessionLimit(userId: string) {
  const supabase = getSupabaseBrowserClient()
  const { data, error } = await supabase
    .from("capture_sessions")
    .select("id, user_id, zip_path")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) throw error

  const sessions = (data ?? []) as Array<Pick<CaptureSessionRow, "id" | "user_id" | "zip_path">>
  if (sessions.length <= SESSION_LIMIT) return

  const sessionsToPrune = sessions.slice(SESSION_LIMIT)

  await Promise.all(
    sessionsToPrune.map(async (session) => {
      const { error: zipError } = await supabase.storage.from(RAW_BUNDLES_BUCKET).remove([session.zip_path])
      if (zipError) throw zipError

      await removeSnapshotFolder(userId, session.id)

      const { error: deleteError } = await supabase.from("capture_sessions").delete().eq("id", session.id).eq("user_id", userId)
      if (deleteError) throw deleteError
    })
  )
}

export async function syncCaptureSessionToSupabase(input: SyncCaptureSessionInput) {
  const supabase = getSupabaseBrowserClient()
  const zipPath = `${input.userId}/${input.sessionId}.zip`

  const { error: zipError } = await supabase.storage.from(RAW_BUNDLES_BUCKET).upload(zipPath, input.zipBlob, {
    contentType: "application/zip",
    upsert: true,
  })

  if (zipError) throw zipError

  await uploadSnapshotsInBatches(input.userId, input.sessionId, input.snapshots)

  const { error: sessionError } = await supabase.from("capture_sessions").upsert({
    id: input.sessionId,
    user_id: input.userId,
    status: "completed",
    started_at: input.summary.startedAt,
    ended_at: input.summary.lastCapturedAt,
    duration_ms: input.summary.durationMs,
    bundle_file_name: input.bundleFileName,
    zip_path: zipPath,
    snapshot_count: input.snapshots.length,
    updated_at: new Date().toISOString(),
  })

  if (sessionError) throw sessionError

  const { error: summaryError } = await supabase.from("capture_session_summaries").upsert({
    session_id: input.sessionId,
    user_id: input.userId,
    payload: input.summary,
  })

  if (summaryError) throw summaryError

  await enforceCaptureSessionLimit(input.userId)

  return {
    zipPath,
  }
}

export async function listPersistedCaptureSessions(userId: string) {
  const supabase = getSupabaseBrowserClient()
  const { data: sessionsData, error: sessionsError } = await supabase
    .from("capture_sessions")
    .select("id, user_id, status, started_at, ended_at, duration_ms, bundle_file_name, zip_path, snapshot_count, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(SESSION_LIMIT)

  if (sessionsError) throw sessionsError

  const sessions = (sessionsData ?? []) as CaptureSessionRow[]
  if (sessions.length === 0) return [] as ArchivedCaptureSession[]

  const sessionIds = sessions.map((session) => session.id)
  const { data: summariesData, error: summariesError } = await supabase
    .from("capture_session_summaries")
    .select("session_id, payload")
    .in("session_id", sessionIds)

  if (summariesError) throw summariesError

  const summaries = new Map(
    ((summariesData ?? []) as CaptureSessionSummaryRow[]).map((summary) => [summary.session_id, summary.payload])
  )

  return sessions.flatMap((session) => {
    const summary = summaries.get(session.id)
    if (!summary) return []

    return [
      {
        id: session.id,
        userId: session.user_id,
        source: "cloud" as const,
        createdAt: session.created_at,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        durationMs: session.duration_ms,
        summary,
        bundleFileName: session.bundle_file_name,
        zipPath: session.zip_path,
        zipBlob: null,
        snapshotCount: session.snapshot_count,
        syncStatus: "synced" as const,
        syncError: null,
      },
    ]
  })
}

export async function downloadArchivedCaptureSessionZip(session: ArchivedCaptureSession) {
  if (session.zipBlob) {
    return session.zipBlob
  }

  if (!session.zipPath) {
    throw new Error("This archived session does not have a downloadable bundle path.")
  }

  const supabase = getSupabaseBrowserClient()
  const { data, error } = await supabase.storage.from(RAW_BUNDLES_BUCKET).download(session.zipPath)

  if (error) throw error
  return data
}
