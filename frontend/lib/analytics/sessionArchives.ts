"use client"

import { useSyncExternalStore } from "react"

export type AnalyticsChartBucket = {
  label: string
  throughput: number
  driftPx: number
}

export type AnalyticsSessionSummaryPayload = {
  generatedAt: string
  captureSessionId: string | null
  startedAt: string | null
  lastCapturedAt: string | null
  durationMs: number
  frameCount: number
  avgFps: number
  avgLatencyMs: number
  avgVisiblePointCount: number
  maxTrackCount: number
  avgDriftPx: number
  frameLabel: string
  chartBuckets: AnalyticsChartBucket[]
  snapshotCount: number
}

export type ArchivedCaptureSessionSyncStatus = "processing" | "syncing" | "synced" | "failed"

export type ArchivedCaptureSession = {
  id: string
  userId: string | null
  source: "local" | "cloud"
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  durationMs: number
  summary: AnalyticsSessionSummaryPayload
  bundleFileName: string
  zipPath: string | null
  zipBlob: Blob | null
  snapshotCount: number
  syncStatus: ArchivedCaptureSessionSyncStatus
  syncError: string | null
}

const MAX_ARCHIVED_SESSIONS = 5

let localArchivedSessions: ArchivedCaptureSession[] = []
const listeners = new Set<() => void>()
let cachedArchivedSessionsSnapshot: ArchivedCaptureSession[] = []

function emit() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function sortSessionsNewestFirst(sessions: ArchivedCaptureSession[]) {
  return [...sessions].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function weightedAverage(values: Array<{ value: number; weight: number }>) {
  const weighted = values.filter(({ value, weight }) => Number.isFinite(value) && Number.isFinite(weight) && weight > 0)
  if (weighted.length === 0) {
    return average(values.map(({ value }) => value).filter((value) => Number.isFinite(value)))
  }

  const totalWeight = weighted.reduce((sum, { weight }) => sum + weight, 0)
  if (totalWeight <= 0) return 0

  return weighted.reduce((sum, { value, weight }) => sum + value * weight, 0) / totalWeight
}

function roundMetric(value: number, precision = 1) {
  return Number(value.toFixed(precision))
}

export function buildCombinedAnalyticsSummary(summaries: AnalyticsSessionSummaryPayload[]): AnalyticsSessionSummaryPayload {
  const validSummaries = summaries.filter((summary) => summary.frameCount > 0 || summary.snapshotCount > 0)
  const sourceSummaries = validSummaries.length > 0 ? validSummaries : summaries
  const startedAt = sourceSummaries
    .map((summary) => summary.startedAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null
  const lastCapturedAt = sourceSummaries
    .map((summary) => summary.lastCapturedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null
  const bucketCount = Math.max(...sourceSummaries.map((summary) => summary.chartBuckets.length), 0)
  const chartBuckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketValues = sourceSummaries
      .map((summary) => ({
        bucket: summary.chartBuckets[index],
        weight: summary.frameCount || 1,
      }))
      .filter((entry) => entry.bucket)

    const label = bucketValues[0]?.bucket.label ?? `W${index + 1}`

    return {
      label,
      throughput: roundMetric(
        weightedAverage(bucketValues.map(({ bucket, weight }) => ({ value: bucket.throughput, weight })))
      ),
      driftPx: roundMetric(
        weightedAverage(bucketValues.map(({ bucket, weight }) => ({ value: bucket.driftPx, weight })))
      ),
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    captureSessionId: null,
    startedAt,
    lastCapturedAt,
    durationMs: sourceSummaries.reduce((sum, summary) => sum + summary.durationMs, 0),
    frameCount: sourceSummaries.reduce((sum, summary) => sum + summary.frameCount, 0),
    avgFps: roundMetric(weightedAverage(sourceSummaries.map((summary) => ({ value: summary.avgFps, weight: summary.frameCount || 1 })))),
    avgLatencyMs: roundMetric(
      weightedAverage(sourceSummaries.map((summary) => ({ value: summary.avgLatencyMs, weight: summary.frameCount || 1 }))),
      0
    ),
    avgVisiblePointCount: roundMetric(
      weightedAverage(sourceSummaries.map((summary) => ({ value: summary.avgVisiblePointCount, weight: summary.frameCount || 1 })))
    ),
    maxTrackCount: sourceSummaries.reduce((max, summary) => Math.max(max, summary.maxTrackCount), 0),
    avgDriftPx: roundMetric(
      weightedAverage(sourceSummaries.map((summary) => ({ value: summary.avgDriftPx, weight: summary.frameCount || 1 })))
    ),
    frameLabel: sourceSummaries.at(-1)?.frameLabel ?? "WebAssembly (Local GPU)",
    chartBuckets,
    snapshotCount: sourceSummaries.reduce((sum, summary) => sum + summary.snapshotCount, 0),
  }
}

export function getLocalArchivedCaptureSessions() {
  return cachedArchivedSessionsSnapshot
}

export function addOrUpdateLocalArchivedCaptureSession(session: ArchivedCaptureSession) {
  const nextSessions = localArchivedSessions.filter((item) => item.id !== session.id)
  nextSessions.push(session)
  localArchivedSessions = sortSessionsNewestFirst(nextSessions).slice(0, MAX_ARCHIVED_SESSIONS)
  cachedArchivedSessionsSnapshot = localArchivedSessions
  emit()
}

export function updateLocalArchivedCaptureSession(
  sessionId: string,
  patch: Partial<Omit<ArchivedCaptureSession, "id" | "source">>
) {
  localArchivedSessions = localArchivedSessions.map((session) => {
    if (session.id !== sessionId) return session
    return {
      ...session,
      ...patch,
    }
  })
  cachedArchivedSessionsSnapshot = localArchivedSessions
  emit()
}

export function useLocalArchivedCaptureSessions() {
  return useSyncExternalStore(subscribe, getLocalArchivedCaptureSessions, getLocalArchivedCaptureSessions)
}

export function combineArchivedCaptureSessions(localSessions: ArchivedCaptureSession[], cloudSessions: ArchivedCaptureSession[]) {
  const combined = new Map<string, ArchivedCaptureSession>()

  cloudSessions.forEach((session) => {
    combined.set(session.id, session)
  })

  localSessions.forEach((session) => {
    const existing = combined.get(session.id)
    combined.set(session.id, {
      ...(existing ?? {}),
      ...session,
      source: session.source,
      zipBlob: session.zipBlob ?? existing?.zipBlob ?? null,
      zipPath: session.zipPath ?? existing?.zipPath ?? null,
      syncStatus: session.syncStatus,
      syncError: session.syncError,
    } as ArchivedCaptureSession)
  })

  return sortSessionsNewestFirst(Array.from(combined.values())).slice(0, MAX_ARCHIVED_SESSIONS)
}
