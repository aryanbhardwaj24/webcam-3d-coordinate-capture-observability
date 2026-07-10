"use client"

import { useSyncExternalStore } from "react"
import type { FaceLandmarkerResult, HandLandmarkerResult, NormalizedLandmark, PoseLandmarkerResult } from "@mediapipe/tasks-vision"
import {
  calculateAngle,
  calculateDistance,
  calculateVisibility,
} from "@/lib/analytics/heuristics"

const MAX_FRAME_HISTORY = 240
const CHART_BUCKET_COUNT = 7

type Box = {
  x: number
  y: number
  width: number
  height: number
}

type Landmark = {
  x: number
  y: number
  z: number
  visibility: number
}

type BlendshapeInput = {
  score: number
  categoryName: string
  displayName: string
}

type TrackInput = {
  trackId: string
  label: string
  box: Box
  poseLandmarks: Landmark[]
  leftHandLandmarks: Landmark[]
  rightHandLandmarks: Landmark[]
  faceLandmarks: Landmark[]
  faceBlendshapes: BlendshapeInput[]
  hasPose: boolean
  hasLeftHand: boolean
  hasRightHand: boolean
  hasFace: boolean
}

type FrameInput = {
  capturedAt: string
  fps: number
  latencyMs: number
  frameLabel: string
  videoWidth: number
  videoHeight: number
  tracks: TrackInput[]
  results: {
    poseResults: PoseLandmarkerResult | null
    handResults: HandLandmarkerResult | null
    faceResults: FaceLandmarkerResult | null
  }
}

type AnalyticsObservation = {
  trackId: string
  domain: "pose" | "left_hand" | "right_hand" | "face"
  landmarkIndex: number
  x: number
  y: number
  z: number
  visibility: number
}

type AnalyticsTrack = {
  trackId: string
  label: string
  box: Box
  hasPose: boolean
  hasLeftHand: boolean
  hasRightHand: boolean
  hasFace: boolean
  poseCount: number
  leftHandCount: number
  rightHandCount: number
  faceCount: number
  semantics: AnalyticsTrackSemantics
}

type AnalyticsFrame = {
  capturedAt: string
  fps: number
  latencyMs: number
  frameLabel: string
  videoWidth: number
  videoHeight: number
  trackCount: number
  visiblePointCount: number
  avgDriftPx: number
  tracks: AnalyticsTrack[]
  observations: AnalyticsObservation[]
  blendshapeSamples: AnalyticsBlendshapeSample[]
  proxemics: AnalyticsProxemic[]
}

type AnalyticsBlendshape = {
  categoryName: string
  displayName: string
  score: number
}

type AnalyticsBlendshapeSample = {
  trackId: string
  categories: AnalyticsBlendshape[]
}

type AnalyticsTrackSemantics = {
  leftElbowAngleDeg: number | null
  rightElbowAngleDeg: number | null
  leftKneeAngleDeg: number | null
  rightKneeAngleDeg: number | null
  leftPinchDistance: number | null
  rightPinchDistance: number | null
  poseVisibilityPct: number | null
  blendshapes: AnalyticsBlendshape[]
}

type AnalyticsProxemic = {
  sourceTrackId: string
  targetTrackId: string
  distancePx: number | null
}

type ChartPoint = {
  label: string
  throughput: number
  driftPx: number
}

type AnalyticsState = {
  captureSessionId: string | null
  startedAt: string | null
  lastCapturedAt: string | null
  frames: AnalyticsFrame[]
  snapshots: AnalyticsSnapshotArtifact[]
}

export type AnalyticsSnapshot = {
  captureSessionId: string | null
  startedAt: string | null
  lastCapturedAt: string | null
  frameCount: number
  avgFps: number
  avgLatencyMs: number
  avgVisiblePointCount: number
  maxTrackCount: number
  avgDriftPx: number
  frameLabel: string
  throughputPoints: number[]
  driftPoints: number[]
  chartPoints: ChartPoint[]
  frames: AnalyticsFrame[]
  snapshotCount: number
}

export type AnalyticsSnapshotArtifact = {
  capturedAt: string
  offsetMs: number
  fileName: string
  blob: Blob
}

const initialState: AnalyticsState = {
  captureSessionId: null,
  startedAt: null,
  lastCapturedAt: null,
  frames: [],
  snapshots: [],
}

let state: AnalyticsState = initialState
const listeners = new Set<() => void>()
let cachedSnapshot: AnalyticsSnapshot | null = null

const MIN_SEMANTIC_VISIBILITY = 0.2
const LEFT_SHOULDER_INDEX = 11
const RIGHT_SHOULDER_INDEX = 12
const LEFT_ELBOW_INDEX = 13
const RIGHT_ELBOW_INDEX = 14
const LEFT_WRIST_INDEX = 15
const RIGHT_WRIST_INDEX = 16
const LEFT_HIP_INDEX = 23
const RIGHT_HIP_INDEX = 24
const LEFT_KNEE_INDEX = 25
const RIGHT_KNEE_INDEX = 26
const LEFT_ANKLE_INDEX = 27
const RIGHT_ANKLE_INDEX = 28
const THUMB_TIP_INDEX = 4
const INDEX_FINGER_TIP_INDEX = 8
const POSE_POINT_COUNT = 33
const HAND_POINT_COUNT = 21
const FACE_POINT_COUNT = 468

function emit() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatBucketLabel(index: number, total: number) {
  return `W${Math.min(index + 1, total)}`
}

function getTrackCenterPixels(track: AnalyticsTrack, width: number, height: number) {
  return {
    x: ((track.box.x + track.box.width / 2) / 100) * width,
    y: ((track.box.y + track.box.height / 2) / 100) * height,
  }
}

function getLandmarkCentroid(
  landmarks: readonly Pick<Landmark, "x" | "y" | "visibility">[] | readonly Pick<NormalizedLandmark, "x" | "y" | "visibility">[],
  fallbackVisibility = 0
) {
  const visible = landmarks.filter((landmark) => (landmark.visibility ?? fallbackVisibility) > 0)
  if (visible.length === 0) return null

  return {
    x: visible.reduce((sum, landmark) => sum + landmark.x, 0) / visible.length,
    y: visible.reduce((sum, landmark) => sum + landmark.y, 0) / visible.length,
  }
}

function flattenRawLandmarks(
  trackId: string,
  domain: AnalyticsObservation["domain"],
  landmarks: readonly NormalizedLandmark[] | undefined,
  fallbackVisibility = 0
) {
  return (landmarks ?? []).flatMap((landmark, landmarkIndex) => {
    const visibility = landmark.visibility ?? fallbackVisibility
    if (visibility <= 0) return []

    return [
      {
        trackId,
        domain,
        landmarkIndex,
        x: landmark.x ?? 0,
        y: landmark.y ?? 0,
        z: landmark.z ?? 0,
        visibility,
      },
    ]
  })
}

function roundMetric(value: number | null, precision = 3) {
  if (value === null || !Number.isFinite(value)) return null
  return Number(value.toFixed(precision))
}

function getVisibleLandmark(landmarks: Landmark[], index: number, minimumVisibility = MIN_SEMANTIC_VISIBILITY) {
  const landmark = landmarks[index]
  if (!landmark || (landmark.visibility ?? 0) < minimumVisibility) return null
  return landmark
}

function normalizeBlendshapes(blendshapes: BlendshapeInput[]): AnalyticsBlendshape[] {
  return blendshapes.map((blendshape) => ({
    categoryName: blendshape.categoryName,
    displayName: blendshape.displayName,
    score: roundMetric(blendshape.score, 6) ?? 0,
  }))
}

function resolvePrimaryTrackId(tracks: TrackInput[]) {
  return tracks.find((track) => track.trackId === "track-1" || track.label === "Person 1")?.trackId ?? tracks[0]?.trackId ?? "track-1"
}

function resolveTrackIdForLandmarks(
  tracks: TrackInput[],
  domain: AnalyticsObservation["domain"],
  rawLandmarks: readonly NormalizedLandmark[] | undefined
) {
  const rawCentroid = getLandmarkCentroid(rawLandmarks ?? [], domain === "face" || domain === "left_hand" || domain === "right_hand" ? 1 : 0)
  if (!rawCentroid) {
    return resolvePrimaryTrackId(tracks)
  }

  let bestTrackId = resolvePrimaryTrackId(tracks)
  let bestScore = Number.POSITIVE_INFINITY

  tracks.forEach((track) => {
    const candidateLandmarks =
      domain === "face"
        ? track.faceLandmarks
        : domain === "left_hand"
          ? track.leftHandLandmarks
          : domain === "right_hand"
            ? track.rightHandLandmarks
            : track.poseLandmarks
    const candidateCentroid = getLandmarkCentroid(candidateLandmarks, domain === "face" || domain === "left_hand" || domain === "right_hand" ? 1 : 0)
    if (!candidateCentroid) return

    const score = calculateDistance(rawCentroid, candidateCentroid)
    if (score === null || score >= bestScore) return

    bestScore = score
    bestTrackId = track.trackId
  })

  return bestTrackId
}

function normalizeHandDomain(result: HandLandmarkerResult, index: number): AnalyticsObservation["domain"] {
  const handedness = result.handedness[index]?.[0]?.categoryName?.toLowerCase()
  return handedness === "left" ? "left_hand" : "right_hand"
}

function buildObservations(input: FrameInput) {
  const observations: AnalyticsObservation[] = []
  const primaryTrackId = resolvePrimaryTrackId(input.tracks)
  const poseLandmarks = input.results.poseResults?.landmarks[0]
  const faceLandmarks = input.results.faceResults?.faceLandmarks[0]

  observations.push(...flattenRawLandmarks(resolveTrackIdForLandmarks(input.tracks, "pose", poseLandmarks) || primaryTrackId, "pose", poseLandmarks, 0))
  observations.push(...flattenRawLandmarks(resolveTrackIdForLandmarks(input.tracks, "face", faceLandmarks) || primaryTrackId, "face", faceLandmarks, 1))

  input.results.handResults?.landmarks.forEach((landmarks, index) => {
    const domain = normalizeHandDomain(input.results.handResults as HandLandmarkerResult, index)
    const trackId = resolveTrackIdForLandmarks(input.tracks, domain, landmarks) || primaryTrackId
    observations.push(...flattenRawLandmarks(trackId, domain, landmarks, 1))
  })

  return observations
}

function buildBlendshapeSamples(input: FrameInput): AnalyticsBlendshapeSample[] {
  const categories = input.results.faceResults?.faceBlendshapes[0]?.categories
  if (!categories || categories.length === 0) return []

  const trackId = resolveTrackIdForLandmarks(input.tracks, "face", input.results.faceResults?.faceLandmarks[0])

  return [
    {
      trackId,
      categories: categories.map((category) => ({
        categoryName: category.categoryName,
        displayName: category.displayName,
        score: roundMetric(category.score, 6) ?? 0,
      })),
    },
  ]
}

function countVisiblePointsFromResults(input: FrameInput) {
  const poseCount = (input.results.poseResults?.landmarks.length ?? 0) * POSE_POINT_COUNT
  const faceCount = (input.results.faceResults?.faceLandmarks.length ?? 0) * FACE_POINT_COUNT
  const handCount = (input.results.handResults?.landmarks.length ?? 0) * HAND_POINT_COUNT

  return poseCount + faceCount + handCount
}

function buildTrackSemantics(track: TrackInput): AnalyticsTrackSemantics {
  const leftShoulder = getVisibleLandmark(track.poseLandmarks, LEFT_SHOULDER_INDEX)
  const rightShoulder = getVisibleLandmark(track.poseLandmarks, RIGHT_SHOULDER_INDEX)
  const leftElbow = getVisibleLandmark(track.poseLandmarks, LEFT_ELBOW_INDEX)
  const rightElbow = getVisibleLandmark(track.poseLandmarks, RIGHT_ELBOW_INDEX)
  const leftWrist = getVisibleLandmark(track.poseLandmarks, LEFT_WRIST_INDEX)
  const rightWrist = getVisibleLandmark(track.poseLandmarks, RIGHT_WRIST_INDEX)
  const leftHip = getVisibleLandmark(track.poseLandmarks, LEFT_HIP_INDEX)
  const rightHip = getVisibleLandmark(track.poseLandmarks, RIGHT_HIP_INDEX)
  const leftKnee = getVisibleLandmark(track.poseLandmarks, LEFT_KNEE_INDEX)
  const rightKnee = getVisibleLandmark(track.poseLandmarks, RIGHT_KNEE_INDEX)
  const leftAnkle = getVisibleLandmark(track.poseLandmarks, LEFT_ANKLE_INDEX)
  const rightAnkle = getVisibleLandmark(track.poseLandmarks, RIGHT_ANKLE_INDEX)
  const leftThumbTip = getVisibleLandmark(track.leftHandLandmarks, THUMB_TIP_INDEX)
  const leftIndexTip = getVisibleLandmark(track.leftHandLandmarks, INDEX_FINGER_TIP_INDEX)
  const rightThumbTip = getVisibleLandmark(track.rightHandLandmarks, THUMB_TIP_INDEX)
  const rightIndexTip = getVisibleLandmark(track.rightHandLandmarks, INDEX_FINGER_TIP_INDEX)

  return {
    leftElbowAngleDeg: roundMetric(calculateAngle(leftShoulder, leftElbow, leftWrist), 2),
    rightElbowAngleDeg: roundMetric(calculateAngle(rightShoulder, rightElbow, rightWrist), 2),
    leftKneeAngleDeg: roundMetric(calculateAngle(leftHip, leftKnee, leftAnkle), 2),
    rightKneeAngleDeg: roundMetric(calculateAngle(rightHip, rightKnee, rightAnkle), 2),
    leftPinchDistance: roundMetric(calculateDistance(leftThumbTip, leftIndexTip), 4),
    rightPinchDistance: roundMetric(calculateDistance(rightThumbTip, rightIndexTip), 4),
    poseVisibilityPct: roundMetric(calculateVisibility(track.poseLandmarks), 2),
    blendshapes: normalizeBlendshapes(track.faceBlendshapes),
  }
}

function buildAnalyticsFrame(input: FrameInput, previousFrame: AnalyticsFrame | null): AnalyticsFrame {
  const tracks = input.tracks.map((track) => {
    const poseCount = track.hasPose ? POSE_POINT_COUNT : 0
    const leftHandCount = track.hasLeftHand ? HAND_POINT_COUNT : 0
    const rightHandCount = track.hasRightHand ? HAND_POINT_COUNT : 0
    const faceCount = track.hasFace ? FACE_POINT_COUNT : 0

    return {
      trackId: track.trackId,
      label: track.label,
      box: track.box,
      hasPose: track.hasPose,
      hasLeftHand: track.hasLeftHand,
      hasRightHand: track.hasRightHand,
      hasFace: track.hasFace,
      poseCount,
      leftHandCount,
      rightHandCount,
      faceCount,
      semantics: buildTrackSemantics(track),
    }
  })

  const visiblePointCount = countVisiblePointsFromResults(input)

  const observations = buildObservations(input)
  const blendshapeSamples = buildBlendshapeSamples(input)

  const previousTracks = new Map(previousFrame?.tracks.map((track) => [track.trackId, track]) ?? [])
  const driftSamples = tracks.flatMap((track) => {
    const previousTrack = previousTracks.get(track.trackId)
    if (!previousTrack) return []

    const previousCenter = getTrackCenterPixels(previousTrack, previousFrame?.videoWidth ?? input.videoWidth, previousFrame?.videoHeight ?? input.videoHeight)
    const currentCenter = getTrackCenterPixels(track, input.videoWidth, input.videoHeight)
    const dx = currentCenter.x - previousCenter.x
    const dy = currentCenter.y - previousCenter.y

    return [Math.sqrt(dx * dx + dy * dy)]
  })

  const primaryTrack = tracks.find((track) => track.label === "Person 1" || track.trackId === "track-1") ?? null
  const proxemics = primaryTrack
    ? tracks
        .filter((track) => track.trackId !== primaryTrack.trackId)
        .map((track) => {
          const primaryCenter = getTrackCenterPixels(primaryTrack, input.videoWidth, input.videoHeight)
          const targetCenter = getTrackCenterPixels(track, input.videoWidth, input.videoHeight)

          return {
            sourceTrackId: primaryTrack.trackId,
            targetTrackId: track.trackId,
            distancePx: roundMetric(calculateDistance(primaryCenter, targetCenter), 3),
          }
        })
    : []

  return {
    capturedAt: input.capturedAt,
    fps: input.fps,
    latencyMs: input.latencyMs,
    frameLabel: input.frameLabel,
    videoWidth: input.videoWidth,
    videoHeight: input.videoHeight,
    trackCount: tracks.length,
    visiblePointCount,
    avgDriftPx: average(driftSamples),
    tracks,
    observations,
    blendshapeSamples,
    proxemics,
  }
}

function buildChartPoints(frames: AnalyticsFrame[]) {
  if (frames.length === 0) {
    return Array.from({ length: CHART_BUCKET_COUNT }, (_, index) => ({
      label: formatBucketLabel(index, CHART_BUCKET_COUNT),
      throughput: 0,
      driftPx: 0,
    }))
  }

  const bucketSize = Math.max(1, Math.ceil(frames.length / CHART_BUCKET_COUNT))
  const points: ChartPoint[] = []

  for (let index = 0; index < CHART_BUCKET_COUNT; index += 1) {
    const start = index * bucketSize
    const bucketFrames = frames.slice(start, start + bucketSize)

    points.push({
      label: formatBucketLabel(index, CHART_BUCKET_COUNT),
      throughput: Number(average(bucketFrames.map((frame) => frame.visiblePointCount)).toFixed(1)),
      driftPx: Number(average(bucketFrames.map((frame) => frame.avgDriftPx)).toFixed(1)),
    })
  }

  return points
}

function buildSnapshot(): AnalyticsSnapshot {
  const frames = state.frames
  const chartPoints = buildChartPoints(frames)

  return {
    captureSessionId: state.captureSessionId,
    startedAt: state.startedAt,
    lastCapturedAt: state.lastCapturedAt,
    frameCount: frames.length,
    avgFps: Number(average(frames.map((frame) => frame.fps)).toFixed(1)),
    avgLatencyMs: Math.round(average(frames.map((frame) => frame.latencyMs))),
    avgVisiblePointCount: Number(average(frames.map((frame) => frame.visiblePointCount)).toFixed(1)),
    maxTrackCount: frames.reduce((max, frame) => Math.max(max, frame.trackCount), 0),
    avgDriftPx: Number(average(frames.map((frame) => frame.avgDriftPx)).toFixed(1)),
    frameLabel: frames.at(-1)?.frameLabel ?? "WebAssembly (Local GPU)",
    throughputPoints: chartPoints.map((point) => point.throughput),
    driftPoints: chartPoints.map((point) => point.driftPx),
    chartPoints,
    frames,
    snapshotCount: state.snapshots.length,
  }
}

function getSnapshot(): AnalyticsSnapshot {
  if (!cachedSnapshot) {
    cachedSnapshot = buildSnapshot()
  }

  return cachedSnapshot
}

export function recordVisionFrame(input: FrameInput) {
  const previousFrame = state.frames.at(-1) ?? null
  const nextFrame = buildAnalyticsFrame(input, previousFrame)
  const nextFrames = [...state.frames, nextFrame].slice(-MAX_FRAME_HISTORY)

  state = {
    captureSessionId: state.captureSessionId,
    startedAt: state.startedAt ?? input.capturedAt,
    lastCapturedAt: input.capturedAt,
    frames: nextFrames,
    snapshots: state.snapshots,
  }

  cachedSnapshot = buildSnapshot()
  emit()
}

export function startAnalyticsCaptureSession(startedAt: string) {
  state = {
    captureSessionId: crypto.randomUUID(),
    startedAt,
    lastCapturedAt: null,
    frames: [],
    snapshots: [],
  }

  cachedSnapshot = buildSnapshot()
  emit()
}

export function appendAnalyticsSnapshot(snapshot: AnalyticsSnapshotArtifact) {
  state = {
    ...state,
    snapshots: [...state.snapshots, snapshot],
  }

  cachedSnapshot = buildSnapshot()
  emit()
}

export function getAnalyticsCaptureSnapshot() {
  return getSnapshot()
}

export function getAnalyticsCaptureArtifacts() {
  return {
    captureSessionId: state.captureSessionId,
    startedAt: state.startedAt,
    lastCapturedAt: state.lastCapturedAt,
    frames: state.frames,
    snapshots: state.snapshots,
  }
}

export function clearAnalyticsCaptureSession() {
  state = initialState
  cachedSnapshot = buildSnapshot()
  emit()
}

export function useAnalyticsCaptureSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
