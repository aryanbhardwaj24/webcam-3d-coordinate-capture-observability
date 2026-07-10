"use client"

import * as React from "react"
import {
  type Category,
  FaceLandmarker,
  type FaceLandmarkerResult,
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
  type NormalizedLandmark,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision"
import { recordVisionFrame } from "@/lib/analytics/captureSession"

type VisionStatus = "idle" | "initializing" | "live" | "error"

type BoundingBox = {
  x: number
  y: number
  width: number
  height: number
}

type Point2D = {
  x: number
  y: number
}

type TrackMemory = {
  id: string
  centroid: Point2D
  box: BoundingBox
  lastSeenTimestampMs: number
}

type RuntimeContext = {
  poseLandmarker: PoseLandmarker
  faceLandmarker: FaceLandmarker
  handLandmarker: HandLandmarker
  delegate: "GPU"
}

export type ClientVisionTrack = {
  trackId: string
  label: string
  box: BoundingBox
  poseLandmarks: NormalizedLandmark[]
  leftHandLandmarks: NormalizedLandmark[]
  rightHandLandmarks: NormalizedLandmark[]
  faceLandmarks: NormalizedLandmark[]
  faceBlendshapes: ClientVisionFaceBlendshape[]
  hasPose: boolean
  hasLeftHand: boolean
  hasRightHand: boolean
  hasFace: boolean
}

export type ClientVisionLandmark = NormalizedLandmark
export type ClientVisionFaceBlendshape = Pick<Category, "categoryName" | "displayName" | "score">

export type ClientVisionFrame = {
  frameLabel: string
  latencyMs: number
  tracks: ClientVisionTrack[]
  boxes: Array<BoundingBox & { id: string; label: string }>
  results: ClientVisionTriModelResults
}

export type ClientVisionTriModelResults = {
  poseResults: PoseLandmarkerResult | null
  handResults: HandLandmarkerResult | null
  faceResults: FaceLandmarkerResult | null
}

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
const MODEL_ROOT = "https://storage.googleapis.com/mediapipe-models"
const POSE_MODEL_PATH = `${MODEL_ROOT}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`
const FACE_MODEL_PATH = `${MODEL_ROOT}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
const HAND_MODEL_PATH = `${MODEL_ROOT}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`

const FRAME_LABEL = "WebAssembly (Local GPU)"
const EMPTY_HAND = createEmptyLandmarks(21)
const EMPTY_FACE = createEmptyLandmarks(468)
const TRACK_BUCKET_COUNT = 12
const TRACK_TTL_MS = 900
const MIN_INFERENCE_INTERVAL_MS = 90
const ANALYTICS_RECORD_INTERVAL_MS = 250
const FACE_TRIGGER_VISIBILITY = 0.2
const HAND_TRIGGER_VISIBILITY = 0.2
const PRIMARY_TRACK_ID = "track-1"

type PoseCandidate = {
  centroid: Point2D
  box: BoundingBox
  poseLandmarks: NormalizedLandmark[]
}

function createEmptyLandmarks(size: number): NormalizedLandmark[] {
  return Array.from({ length: size }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  }))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function padLandmarks(landmarks: readonly NormalizedLandmark[] | undefined, size: number) {
  const padded = createEmptyLandmarks(size)

  landmarks?.slice(0, size).forEach((landmark, index) => {
    padded[index] = {
      x: clamp(landmark.x ?? 0, 0, 1),
      y: clamp(landmark.y ?? 0, 0, 1),
      z: landmark.z ?? 0,
      visibility: clamp(landmark.visibility ?? 1, 0, 1),
    }
  })

  return padded
}

function buildBoundingBox(landmarks: readonly NormalizedLandmark[], minimumVisibility: number) {
  const visible = landmarks.filter((landmark) => (landmark.visibility ?? 0) >= minimumVisibility)
  if (visible.length === 0) return null

  const minX = Math.min(...visible.map((landmark) => landmark.x))
  const maxX = Math.max(...visible.map((landmark) => landmark.x))
  const minY = Math.min(...visible.map((landmark) => landmark.y))
  const maxY = Math.max(...visible.map((landmark) => landmark.y))
  const width = clamp(maxX - minX, 0.04, 1)
  const height = clamp(maxY - minY, 0.04, 1)
  const expandX = Math.max(width * 0.15, 0.02)
  const expandY = Math.max(height * 0.18, 0.03)

  const left = clamp(minX - expandX, 0, 1)
  const top = clamp(minY - expandY, 0, 1)
  const right = clamp(maxX + expandX, 0, 1)
  const bottom = clamp(maxY + expandY, 0, 1)

  return {
    x: left * 100,
    y: top * 100,
    width: Math.max(8, (right - left) * 100),
    height: Math.max(10, (bottom - top) * 100),
  }
}

function getBoxCentroid(box: BoundingBox): Point2D {
  return {
    x: box.x / 100 + box.width / 200,
    y: box.y / 100 + box.height / 200,
  }
}

function createPoseCandidates(result: PoseLandmarkerResult): PoseCandidate[] {
  return result.landmarks.flatMap((landmarks) => {
    const padded = padLandmarks(landmarks, 33)
    const box = buildBoundingBox(padded, 0.3)
    if (!box) return []

    return [
      {
        centroid: getBoxCentroid(box),
        box,
        poseLandmarks: padded,
      },
    ]
  })
}

function shouldRunFaceLandmarker(result: PoseLandmarkerResult) {
  return result.landmarks.some((landmarks) => (landmarks[0]?.visibility ?? 0) > FACE_TRIGGER_VISIBILITY)
}

function shouldRunHandLandmarker(result: PoseLandmarkerResult) {
  return result.landmarks.some((landmarks) => {
    const leftWristVisibility = landmarks[15]?.visibility ?? 0
    const rightWristVisibility = landmarks[16]?.visibility ?? 0
    return leftWristVisibility > HAND_TRIGGER_VISIBILITY || rightWristVisibility > HAND_TRIGGER_VISIBILITY
  })
}

function getBucketIndex(value: number) {
  return clamp(Math.floor(value * TRACK_BUCKET_COUNT), 0, TRACK_BUCKET_COUNT - 1)
}

function reconcileTracks(
  candidates: PoseCandidate[],
  activeTracksRef: React.MutableRefObject<TrackMemory[]>,
  nextTrackIdRef: React.MutableRefObject<number>,
  timestampMs: number
) {
  const liveTracks = activeTracksRef.current.filter((track) => timestampMs - track.lastSeenTimestampMs <= TRACK_TTL_MS)
  const bucketMap = new Map<number, TrackMemory[]>()

  liveTracks.forEach((track) => {
    const bucket = getBucketIndex(track.centroid.x)
    const current = bucketMap.get(bucket) || []
    current.push(track)
    bucketMap.set(bucket, current)
  })

  const claimedTrackIds = new Set<string>()
  const currentTracks = candidates.map((candidate) => {
    const singleSubjectTrackId = candidates.length === 1 ? liveTracks[0]?.id ?? PRIMARY_TRACK_ID : null
    const candidateBucket = getBucketIndex(candidate.centroid.x)
    let matchedTrack: TrackMemory | null = null
    let matchedScore = Number.POSITIVE_INFINITY

    if (!singleSubjectTrackId) {
      for (let offset = -1; offset <= 1; offset += 1) {
        const bucketTracks = bucketMap.get(candidateBucket + offset)
        if (!bucketTracks) continue

        for (const track of bucketTracks) {
          if (claimedTrackIds.has(track.id)) continue

          const dx = Math.abs(track.centroid.x - candidate.centroid.x)
          const dy = Math.abs(track.centroid.y - candidate.centroid.y)
          const maxDx = Math.max(track.box.width, candidate.box.width) / 100 + 0.08
          const maxDy = Math.max(track.box.height, candidate.box.height) / 100 + 0.12

          if (dx > maxDx || dy > maxDy) continue

          const score = dx + dy * 1.35
          if (score < matchedScore) {
            matchedTrack = track
            matchedScore = score
          }
        }
      }
    }

    const trackId = singleSubjectTrackId ?? matchedTrack?.id ?? `track-${nextTrackIdRef.current++}`
    claimedTrackIds.add(trackId)

    return {
      trackId,
      label: `Person ${trackId.replace("track-", "")}`,
      box: candidate.box,
      centroid: candidate.centroid,
      poseLandmarks: candidate.poseLandmarks,
      leftHandLandmarks: EMPTY_HAND.map((landmark) => ({ ...landmark })),
      rightHandLandmarks: EMPTY_HAND.map((landmark) => ({ ...landmark })),
      faceLandmarks: EMPTY_FACE.map((landmark) => ({ ...landmark })),
      faceBlendshapes: [] as ClientVisionFaceBlendshape[],
      hasPose: true,
      hasLeftHand: false,
      hasRightHand: false,
      hasFace: false,
      lastSeenTimestampMs: timestampMs,
    }
  })

  activeTracksRef.current = currentTracks.map((track) => ({
    id: track.trackId,
    centroid: track.centroid,
    box: track.box,
    lastSeenTimestampMs: timestampMs,
  }))

  return currentTracks
}

function getLandmarkCentroid(landmarks: readonly NormalizedLandmark[], minimumVisibility: number) {
  const visible = landmarks.filter((landmark) => (landmark.visibility ?? 0) >= minimumVisibility)
  if (visible.length === 0) return null

  return {
    x: visible.reduce((sum, landmark) => sum + landmark.x, 0) / visible.length,
    y: visible.reduce((sum, landmark) => sum + landmark.y, 0) / visible.length,
  }
}

function normalizeFaceBlendshapes(
  classifications: FaceLandmarkerResult["faceBlendshapes"][number] | undefined
): ClientVisionFaceBlendshape[] {
  return (classifications?.categories ?? []).map((category) => ({
    categoryName: category.categoryName,
    displayName: category.displayName,
    score: category.score,
  }))
}

function attachFaceLandmarks(tracks: ReturnType<typeof reconcileTracks>, result: FaceLandmarkerResult) {
  result.faceLandmarks.forEach((face, index) => {
    const padded = padLandmarks(face, 468)
    const faceBlendshapes = normalizeFaceBlendshapes(result.faceBlendshapes[index])
    const centroid = getLandmarkCentroid(padded, 0.1)
    if (!centroid) return

    let targetTrackIndex = -1
    let bestScore = Number.POSITIVE_INFINITY

    tracks.forEach((track, index) => {
      if (track.hasFace) return

      const dx = Math.abs(track.centroid.x - centroid.x)
      const dy = Math.abs(track.centroid.y - centroid.y)
      const score = dx + dy * 1.2

      if (score < bestScore) {
        bestScore = score
        targetTrackIndex = index
      }
    })

    if (targetTrackIndex < 0 || bestScore > 0.9) return

    tracks[targetTrackIndex].faceLandmarks = padded
    tracks[targetTrackIndex].faceBlendshapes = faceBlendshapes
    tracks[targetTrackIndex].hasFace = true
  })
}

function normalizeHandednessLabel(result: HandLandmarkerResult, index: number) {
  const label = result.handedness[index]?.[0]?.categoryName?.toLowerCase()
  return label === "left" || label === "right" ? label : "right"
}

function attachHandLandmarks(tracks: ReturnType<typeof reconcileTracks>, result: HandLandmarkerResult) {
  result.landmarks.forEach((hand, index) => {
    const padded = padLandmarks(hand, 21)
    const centroid = getLandmarkCentroid(padded, 0.1)
    if (!centroid) return

    const handedness = normalizeHandednessLabel(result, index)
    let targetTrackIndex = -1
    let bestScore = Number.POSITIVE_INFINITY

    tracks.forEach((track, trackIndex) => {
      if (handedness === "left" && track.hasLeftHand) return
      if (handedness === "right" && track.hasRightHand) return

      const dx = Math.abs(track.centroid.x - centroid.x)
      const dy = Math.abs(track.centroid.y - centroid.y)
      const score = dx + dy * 1.3

      if (score < bestScore) {
        bestScore = score
        targetTrackIndex = trackIndex
      }
    })

    if (targetTrackIndex < 0 || bestScore > 1) return

    if (handedness === "left") {
      tracks[targetTrackIndex].leftHandLandmarks = padded
      tracks[targetTrackIndex].hasLeftHand = true
      return
    }

    tracks[targetTrackIndex].rightHandLandmarks = padded
    tracks[targetTrackIndex].hasRightHand = true
  })
}

async function createRuntime(): Promise<RuntimeContext> {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)

  const [poseLandmarker, faceLandmarker, handLandmarker] = await Promise.all([
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL_PATH, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 4,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    }),
    FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL_PATH, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 4,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    }),
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: HAND_MODEL_PATH, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 8,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
  ])

  return {
    poseLandmarker,
    faceLandmarker,
    handLandmarker,
    delegate: "GPU",
  }
}

function closeRuntime(runtime: RuntimeContext | null) {
  runtime?.poseLandmarker.close()
  runtime?.faceLandmarker.close()
  runtime?.handLandmarker.close()
}

function createEmptyFrame(): ClientVisionFrame {
  return {
    frameLabel: FRAME_LABEL,
    latencyMs: 0,
    tracks: [],
    boxes: [],
    results: {
      poseResults: null,
      handResults: null,
      faceResults: null,
    },
  }
}

type UseClientVisionOptions = {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

export function useClientVision({ videoRef }: UseClientVisionOptions) {
  const runtimeRef = React.useRef<RuntimeContext | null>(null)
  const activeTracksRef = React.useRef<TrackMemory[]>([])
  const nextTrackIdRef = React.useRef(1)
  const lastVideoTimeRef = React.useRef(-1)
  const animationFrameRef = React.useRef<number | null>(null)
  const lastInferenceAtRef = React.useRef<number | null>(null)
  const lastRecordedAtRef = React.useRef<number | null>(null)
  const [bootRevision, setBootRevision] = React.useState(0)
  const [status, setStatus] = React.useState<VisionStatus>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [delegate, setDelegate] = React.useState<"GPU" | null>(null)
  const [frame, setFrame] = React.useState<ClientVisionFrame>(createEmptyFrame)
  const [fps, setFps] = React.useState(0)

  React.useEffect(() => {
    let disposed = false

    activeTracksRef.current = []
    nextTrackIdRef.current = 1
    lastVideoTimeRef.current = -1
    lastInferenceAtRef.current = null
    lastRecordedAtRef.current = null
    setFrame(createEmptyFrame())
    setFps(0)
    setStatus("initializing")
    setError(null)
    setDelegate(null)

    async function loadRuntime() {
      try {
        const runtime = await createRuntime()
        if (disposed) {
          closeRuntime(runtime)
          return
        }

        runtimeRef.current = runtime
        setStatus("initializing")
        setError(null)
        setDelegate(runtime.delegate)
      } catch (runtimeError) {
        if (disposed) return
        setStatus("error")
        setError(runtimeError instanceof Error ? runtimeError.message : "Unable to initialize the WebAssembly vision runtime.")
        setDelegate(null)
      }
    }

    void loadRuntime()

    return () => {
      disposed = true
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      closeRuntime(runtimeRef.current)
      runtimeRef.current = null
    }
  }, [bootRevision])

  const processVideoFrame = React.useCallback((video: HTMLVideoElement, timestampMs = performance.now()): ClientVisionFrame | null => {
    const runtime = runtimeRef.current
    if (!runtime) return null
    if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return null
    if (video.currentTime === lastVideoTimeRef.current) return null

    lastVideoTimeRef.current = video.currentTime
    const startedAt = performance.now()

    const poseResults = runtime.poseLandmarker.detectForVideo(video, timestampMs)
    const faceResults = shouldRunFaceLandmarker(poseResults) ? runtime.faceLandmarker.detectForVideo(video, timestampMs) : null
    const handResults = shouldRunHandLandmarker(poseResults) ? runtime.handLandmarker.detectForVideo(video, timestampMs) : null

    const reconciledTracks = reconcileTracks(createPoseCandidates(poseResults), activeTracksRef, nextTrackIdRef, timestampMs)
    if (faceResults) {
      attachFaceLandmarks(reconciledTracks, faceResults)
    }
    if (handResults) {
      attachHandLandmarks(reconciledTracks, handResults)
    }

    const tracks = reconciledTracks.map((track) => ({
      trackId: track.trackId,
      label: track.label,
      box: track.box,
      poseLandmarks: track.poseLandmarks,
      leftHandLandmarks: track.leftHandLandmarks,
      rightHandLandmarks: track.rightHandLandmarks,
      faceLandmarks: track.faceLandmarks,
      faceBlendshapes: track.faceBlendshapes,
      hasPose: track.hasPose,
      hasLeftHand: track.hasLeftHand,
      hasRightHand: track.hasRightHand,
      hasFace: track.hasFace,
    }))

    return {
      frameLabel: FRAME_LABEL,
      latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
      tracks,
      boxes: tracks.map((track) => ({
        id: track.trackId,
        label: track.label,
        ...track.box,
      })),
      results: {
        poseResults,
        handResults,
        faceResults,
      },
    }
  }, [])

  React.useEffect(() => {
    function tick() {
      const now = performance.now()
      const video = videoRef.current
      const shouldInfer =
        lastInferenceAtRef.current === null || now - lastInferenceAtRef.current >= MIN_INFERENCE_INTERVAL_MS
      const nextFrame = video && shouldInfer ? processVideoFrame(video, now) : null

      if (nextFrame && video) {
        const nextFps =
          lastInferenceAtRef.current && now > lastInferenceAtRef.current ? Number((1000 / (now - lastInferenceAtRef.current)).toFixed(1)) : 0
        if (lastInferenceAtRef.current && now > lastInferenceAtRef.current) {
          setFps(nextFps)
        }
        lastInferenceAtRef.current = now
        setFrame(nextFrame)
        setStatus("live")
        if (lastRecordedAtRef.current === null || now - lastRecordedAtRef.current >= ANALYTICS_RECORD_INTERVAL_MS) {
          lastRecordedAtRef.current = now
          recordVisionFrame({
            capturedAt: new Date().toISOString(),
            fps: nextFps,
            latencyMs: nextFrame.latencyMs,
            frameLabel: nextFrame.frameLabel,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            tracks: nextFrame.tracks,
            results: nextFrame.results,
          })
        }
      } else if (runtimeRef.current && lastInferenceAtRef.current === null && status !== "error") {
        setStatus("initializing")
      }

      animationFrameRef.current = window.requestAnimationFrame(tick)
    }

    animationFrameRef.current = window.requestAnimationFrame(tick)

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [processVideoFrame, status, videoRef])

  const retry = React.useCallback(() => {
    closeRuntime(runtimeRef.current)
    runtimeRef.current = null
    setBootRevision((value) => value + 1)
  }, [])

  return {
    boxes: frame.boxes,
    status,
    error,
    delegate,
    fps,
    frameLabel: frame.frameLabel,
    latencyMs: frame.latencyMs,
    results: frame.results,
    retry,
    tracks: frame.tracks,
  }
}
