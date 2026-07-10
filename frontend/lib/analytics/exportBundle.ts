import JSZip from "jszip"

import {
  getAnalyticsCaptureArtifacts,
  getAnalyticsCaptureSnapshot,
  type AnalyticsSnapshot,
  type AnalyticsSnapshotArtifact,
} from "@/lib/analytics/captureSession"
import { buildCombinedAnalyticsSummary, type AnalyticsSessionSummaryPayload, type ArchivedCaptureSession } from "@/lib/analytics/sessionArchives"

type AnalyticsExportSource = {
  snapshot: AnalyticsSnapshot
  snapshots: AnalyticsSnapshotArtifact[]
}

function toCsvCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return ""

  const serialized = `${value}`
  if (!/[",\n]/.test(serialized)) return serialized

  return `"${serialized.replace(/"/g, '""')}"`
}

function toCsvRow(values: Array<string | number | boolean | null | undefined>) {
  return values.map((value) => toCsvCell(value)).join(",")
}

function getDurationMs(startedAt: string | null, lastCapturedAt: string | null) {
  if (!startedAt || !lastCapturedAt) return 0
  return Math.max(0, Date.parse(lastCapturedAt) - Date.parse(startedAt))
}

export function buildAnalyticsSessionSummary(snapshot: AnalyticsSnapshot, generatedAt = new Date().toISOString()): AnalyticsSessionSummaryPayload {
  return {
    generatedAt,
    captureSessionId: snapshot.captureSessionId,
    startedAt: snapshot.startedAt,
    lastCapturedAt: snapshot.lastCapturedAt,
    durationMs: getDurationMs(snapshot.startedAt, snapshot.lastCapturedAt),
    frameCount: snapshot.frameCount,
    avgFps: snapshot.avgFps,
    avgLatencyMs: snapshot.avgLatencyMs,
    avgVisiblePointCount: snapshot.avgVisiblePointCount,
    maxTrackCount: snapshot.maxTrackCount,
    avgDriftPx: snapshot.avgDriftPx,
    frameLabel: snapshot.frameLabel,
    chartBuckets: snapshot.chartPoints,
    snapshotCount: snapshot.snapshotCount,
  }
}

function buildExportFiles(source: AnalyticsExportSource, generatedAt = new Date().toISOString()) {
  const snapshot = source.snapshot
  const sessionSummary = buildAnalyticsSessionSummary(snapshot, generatedAt)

  const throughputCsv = [
    toCsvRow(["window", "visible_points"]),
    ...snapshot.chartPoints.map((point) => toCsvRow([point.label, point.throughput])),
  ].join("\n")

  const driftCsv = [
    toCsvRow(["window", "drift_px"]),
    ...snapshot.chartPoints.map((point) => toCsvRow([point.label, point.driftPx])),
  ].join("\n")

  const frameTimelineCsv = [
    toCsvRow(["captured_at", "fps", "latency_ms", "track_count", "visible_point_count", "avg_drift_px", "video_width", "video_height"]),
    ...snapshot.frames.map((frame) =>
      toCsvRow([
        frame.capturedAt,
        frame.fps,
        frame.latencyMs,
        frame.trackCount,
        frame.visiblePointCount,
        frame.avgDriftPx,
        frame.videoWidth,
        frame.videoHeight,
      ])
    ),
  ].join("\n")

  const coordinateRowsNdjson = snapshot.frames
    .flatMap((frame) =>
      frame.observations.map((observation) =>
        JSON.stringify({
          capturedAt: frame.capturedAt,
          trackId: observation.trackId,
          domain: observation.domain,
          landmarkIndex: observation.landmarkIndex,
          x: observation.x,
          y: observation.y,
          z: observation.z,
          visibility: observation.visibility,
          videoWidth: frame.videoWidth,
          videoHeight: frame.videoHeight,
        })
      )
    )
    .join("\n")

  const facialBlendshapeNdjson = snapshot.frames
    .flatMap((frame) =>
      frame.blendshapeSamples.flatMap((sample) => {
        if (sample.categories.length === 0) return []

        return [
          JSON.stringify({
            capturedAt: frame.capturedAt,
            trackId: sample.trackId,
            blendshapes: sample.categories,
          }),
        ]
      })
    )
    .join("\n")

  const kinematicsPostureCsv = [
    toCsvRow([
      "captured_at",
      "track_id",
      "left_elbow_angle",
      "right_elbow_angle",
      "left_knee_angle",
      "right_knee_angle",
    ]),
    ...snapshot.frames.flatMap((frame) =>
      frame.tracks.map((track) =>
        toCsvRow([
          frame.capturedAt,
          track.trackId,
          track.semantics.leftElbowAngleDeg,
          track.semantics.rightElbowAngleDeg,
          track.semantics.leftKneeAngleDeg,
          track.semantics.rightKneeAngleDeg,
        ])
      )
    ),
  ].join("\n")

  const spatialProxemicsCsv = [
    toCsvRow([
      "captured_at",
      "track_id_1",
      "track_id_2",
      "distance_px",
    ]),
    ...snapshot.frames.flatMap((frame) =>
      frame.proxemics.map((proxemic) =>
        toCsvRow([
          frame.capturedAt,
          proxemic.sourceTrackId,
          proxemic.targetTrackId,
          proxemic.distancePx,
        ])
      )
    ),
  ].join("\n")

  const handStatesCsv = [
    toCsvRow(["captured_at", "track_id", "is_left_hand", "pinch_distance"]),
    ...snapshot.frames.flatMap((frame) =>
      frame.tracks.flatMap((track) => [
        toCsvRow([frame.capturedAt, track.trackId, true, track.semantics.leftPinchDistance]),
        toCsvRow([frame.capturedAt, track.trackId, false, track.semantics.rightPinchDistance]),
      ])
    ),
  ].join("\n")

  const visibilityConfidenceCsv = [
    toCsvRow(["captured_at", "track_id", "pose_visibility_pct"]),
    ...snapshot.frames.flatMap((frame) =>
      frame.tracks.map((track) =>
        toCsvRow([
          frame.capturedAt,
          track.trackId,
          track.semantics.poseVisibilityPct,
        ])
      )
    ),
  ].join("\n")

  return {
    generatedAt,
    sessionSummary,
    files: {
      "analytics/session-summary.json": JSON.stringify(sessionSummary, null, 2),
      "analytics/throughput.csv": `${throughputCsv}\n`,
      "analytics/drift.csv": `${driftCsv}\n`,
      "analytics/frame-timeline.csv": `${frameTimelineCsv}\n`,
      "analytics/coordinates.ndjson": coordinateRowsNdjson ? `${coordinateRowsNdjson}\n` : "",
      "analytics/facial-blendshapes.ndjson": facialBlendshapeNdjson ? `${facialBlendshapeNdjson}\n` : "",
      "analytics/kinematics-posture.csv": `${kinematicsPostureCsv}\n`,
      "analytics/spatial-proxemics.csv": `${spatialProxemicsCsv}\n`,
      "analytics/hand-states.csv": `${handStatesCsv}\n`,
      "analytics/visibility-confidence.csv": `${visibilityConfidenceCsv}\n`,
    },
  }
}

export async function buildAnalyticsZipBundleFromSource(
  source: AnalyticsExportSource,
  options?: {
    fileNamePrefix?: string
  }
) {
  const zip = new JSZip()
  const { files, generatedAt, sessionSummary } = buildExportFiles(source)

  Object.entries(files).forEach(([path, contents]) => {
    zip.file(path, contents)
  })

  source.snapshots.forEach((snapshot) => {
    zip.file(`snapshots/${snapshot.fileName}`, snapshot.blob)
  })

  const blob = await zip.generateAsync({ type: "blob" })
  const fileName = `${options?.fileNamePrefix ?? "capture-analytics"}-${generatedAt.replace(/[:.]/g, "-")}.zip`

  return {
    blob,
    fileCount: Object.keys(files).length + source.snapshots.length,
    fileName,
    generatedAt,
    sessionSummary,
  }
}

export async function buildAnalyticsZipBundle() {
  const activeArtifacts = getAnalyticsCaptureArtifacts()
  return buildAnalyticsZipBundleFromSource({
    snapshot: getAnalyticsCaptureSnapshot(),
    snapshots: activeArtifacts.snapshots,
  })
}

export async function buildCombinedArchivedSessionsZip(sessions: ArchivedCaptureSession[]) {
  const zip = new JSZip()
  const summary = buildCombinedAnalyticsSummary(sessions.map((session) => session.summary))
  const generatedAt = new Date().toISOString()

  zip.file("combined/session-summary.json", JSON.stringify(summary, null, 2))

  sessions.forEach((session) => {
    if (!session.zipBlob) return

    zip.file(`sessions/${session.id}/${session.bundleFileName}`, session.zipBlob)
    zip.file(`sessions/${session.id}/session-summary.json`, JSON.stringify(session.summary, null, 2))
  })

  const blob = await zip.generateAsync({ type: "blob" })
  const fileName = `capture-session-history-${generatedAt.replace(/[:.]/g, "-")}.zip`

  return {
    blob,
    fileCount: sessions.length + 1,
    fileName,
    generatedAt,
    summary,
  }
}
