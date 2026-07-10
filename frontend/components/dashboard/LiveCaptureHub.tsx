"use client"

import * as React from "react"
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils"
import {
  FaceLandmarker,
  HandLandmarker,
  type HandLandmarkerResult,
  PoseLandmarker,
} from "@mediapipe/tasks-vision"

import { Button } from "@/components/ui/Button"
import { Card, CardBody, CardTitle } from "@/components/ui/Card"
import { useToast } from "@/components/ui/Toast"
import { useAuth } from "@/components/providers/AuthProvider"
import { finalizeActiveCaptureSession } from "@/lib/analytics/archiveLifecycle"
import { appendAnalyticsSnapshot, startAnalyticsCaptureSession } from "@/lib/analytics/captureSession"
import { useWebcameraPreview } from "@/components/dashboard/useWebcameraPreview"
import { useClientVision, type ClientVisionLandmark } from "@/hooks/useClientVision"

const CYAN = "#00BCD4"
const ORANGE = "#FF9800"
const WHITE = "#FFFFFF"
const SNAPSHOT_WARMUP_MS = 5_000
const SNAPSHOT_INTERVAL_MS = 60_000
const POSE_FACE_INDICES = new Set(Array.from({ length: 11 }, (_, index) => index))

type ConnectorDefinition = {
  start: number
  end: number
}

function toConnectorPairs(connections: ConnectorDefinition[]) {
  return connections.map(({ start, end }) => [start, end] as [number, number])
}

const RIGHT_SIDE_POSE_INDICES = new Set([12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32])
const FACE_TESSELLATION_CONNECTIONS = toConnectorPairs(FaceLandmarker.FACE_LANDMARKS_TESSELATION)
const FACE_CONTOUR_CONNECTIONS = toConnectorPairs(FaceLandmarker.FACE_LANDMARKS_CONTOURS)
const HAND_CONNECTIONS = toConnectorPairs(HandLandmarker.HAND_CONNECTIONS)
const POSE_CONNECTIONS = toConnectorPairs(PoseLandmarker.POSE_CONNECTIONS)

const FACE_DOT_STYLE = {
  color: "transparent",
  fillColor: CYAN,
  radius: 1.1,
  lineWidth: 0,
} as const

const FACE_TESSELLATION_STYLE = {
  color: "rgba(0, 188, 212, 0.34)",
  lineWidth: 0.75,
} as const

const FACE_CONTOUR_STYLE = {
  color: WHITE,
  lineWidth: 1.5,
} as const

const POSE_CONNECTOR_STYLE = {
  color: WHITE,
  lineWidth: 6,
} as const

const POSE_LANDMARK_STYLE = {
  color: WHITE,
  lineWidth: 3,
  radius: 7,
  fillColor: (data: { index?: number }) => (data.index != null && RIGHT_SIDE_POSE_INDICES.has(data.index) ? ORANGE : CYAN),
}

const HAND_CONNECTOR_STYLE = {
  color: WHITE,
  lineWidth: 4,
} as const

const HAND_LANDMARK_STYLE = {
  fillColor: CYAN,
  color: (data: { index?: number }) => (data.index === 0 ? WHITE : CYAN),
  lineWidth: (data: { index?: number }) => (data.index === 0 ? 3 : 0),
  radius: (data: { index?: number }) => (data.index === 0 ? 6 : 4),
}

function drawHandOverlay(canvasCtx: CanvasRenderingContext2D, landmarks: ClientVisionLandmark[]) {
  if (landmarks.length === 0) return

  drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, HAND_CONNECTOR_STYLE)
  drawLandmarks(canvasCtx, landmarks, HAND_LANDMARK_STYLE)
}

function isVisibleLandmark(landmark: ClientVisionLandmark | undefined, minimumVisibility = 0) {
  return (landmark?.visibility ?? 1) > minimumVisibility
}

function normalizeRenderableLandmarks(landmarks: ClientVisionLandmark[], treatMissingVisibilityAsVisible: boolean) {
  return landmarks.map((landmark) => ({
    ...landmark,
    // Face and hand tasks do not expose pose-style visibility reliably for canvas helpers.
    visibility: treatMissingVisibilityAsVisible ? Math.max(landmark.visibility ?? 0, 1) : landmark.visibility ?? 0,
    presence: Math.max((landmark as ClientVisionLandmark & { presence?: number }).presence ?? 0, 1),
  }))
}

function mutePoseFaceLandmarks(landmarks: ClientVisionLandmark[]) {
  return landmarks.map((landmark, index) => {
    if (!POSE_FACE_INDICES.has(index)) {
      return landmark
    }

    return {
      ...landmark,
      visibility: 0,
      presence: 0,
    }
  })
}

function partitionHandLandmarks(handResults: HandLandmarkerResult | null) {
  const leftHandLandmarks: ClientVisionLandmark[][] = []
  const rightHandLandmarks: ClientVisionLandmark[][] = []

  handResults?.landmarks.forEach((landmarks, index) => {
    const handedness = handResults.handedness[index]?.[0]?.categoryName?.toLowerCase() === "left" ? "left" : "right"
    const normalizedLandmarks = normalizeRenderableLandmarks([...landmarks], true)

    if (handedness === "left") {
      leftHandLandmarks.push(normalizedLandmarks)
      return
    }

    rightHandLandmarks.push(normalizedLandmarks)
  })

  return { leftHandLandmarks, rightHandLandmarks }
}

function collectVisibleLandmarks({
  faceLandmarks,
  poseLandmarks,
  leftHandLandmarks,
  rightHandLandmarks,
}: {
  faceLandmarks: ClientVisionLandmark[]
  poseLandmarks: ClientVisionLandmark[]
  leftHandLandmarks: ClientVisionLandmark[][]
  rightHandLandmarks: ClientVisionLandmark[][]
}) {
  return [
    ...faceLandmarks.filter((landmark) => isVisibleLandmark(landmark)),
    ...poseLandmarks.filter((landmark) => isVisibleLandmark(landmark, 0.35)),
    ...leftHandLandmarks.flatMap((landmarks) => landmarks.filter((landmark) => isVisibleLandmark(landmark))),
    ...rightHandLandmarks.flatMap((landmarks) => landmarks.filter((landmark) => isVisibleLandmark(landmark))),
  ]
}

function renderCompositeSnapshotToJpegBlob(video: HTMLVideoElement, overlayCanvas: HTMLCanvasElement | null) {
  const canvas = document.createElement("canvas")
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const context = canvas.getContext("2d")
  if (!context) {
    return Promise.resolve<Blob | null>(null)
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  if (overlayCanvas) {
    context.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height)
  }

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (blob) => {
        canvas.width = 0
        canvas.height = 0
        resolve(blob)
      },
      "image/jpeg",
      0.85
    )
  })
}

function formatSnapshotFileName(capturedAt: string, offsetMs: number) {
  return `snapshot_t+${String(offsetMs).padStart(6, "0")}ms_${capturedAt.replace(/[:.]/g, "-")}.jpg`
}

export function LiveCaptureHub({
  onStatusChange,
  showEngineModal = true,
}: {
  onStatusChange: (status: "live" | "standby" | "offline") => void
  showEngineModal?: boolean
}) {
  const { push } = useToast()
  const { user } = useAuth()
  const { videoRef, webcameraError, webcameraReady, videoPlaying } = useWebcameraPreview()
  const { boxes, delegate, error: clientVisionError, fps, frameLabel, latencyMs, results, retry, status: clientVisionStatus } = useClientVision({
    videoRef,
  })
  const overlayCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const snapshotWarmupTimeoutRef = React.useRef<number | null>(null)
  const snapshotIntervalRef = React.useRef<number | null>(null)
  const snapshotSessionStartedAtRef = React.useRef<number | null>(null)
  const snapshotSessionActiveRef = React.useRef(false)
  const snapshotCaptureInFlightRef = React.useRef(false)
  const [checklistOpen, setChecklistOpen] = React.useState(false)

  const clientVisionReady = clientVisionStatus === "live"
  const clientVisionBooting = clientVisionStatus === "initializing" || clientVisionStatus === "idle"
  const setupOverlayActive = showEngineModal && !clientVisionReady
  const faceLandmarks = React.useMemo(
    () => normalizeRenderableLandmarks([...(results.faceResults?.faceLandmarks[0] ?? [])], true),
    [results.faceResults]
  )
  const poseLandmarks = React.useMemo(() => mutePoseFaceLandmarks([...(results.poseResults?.landmarks[0] ?? [])]), [results.poseResults])
  const { leftHandLandmarks, rightHandLandmarks } = React.useMemo(() => partitionHandLandmarks(results.handResults), [results.handResults])
  const visibleLandmarks = React.useMemo(
    () =>
      collectVisibleLandmarks({
        faceLandmarks,
        poseLandmarks,
        leftHandLandmarks,
        rightHandLandmarks,
      }),
    [faceLandmarks, leftHandLandmarks, poseLandmarks, rightHandLandmarks]
  )
  const runtimeLabel = delegate ? `MediaPipe ${delegate}` : "MediaPipe bootstrap"
  const previewMessage = webcameraError || clientVisionError

  const operatorChecklistItems = React.useMemo(
    () => [
      {
        label: "Confirm all webcams have granted browser permission.",
        ok: webcameraReady && !webcameraError,
      },
      {
        label: "Verify the MediaPipe WebAssembly runtime has initialized in the browser.",
        ok: clientVisionReady,
      },
      {
        label: "Review the heads-up display overlays before beginning the scoring session.",
        ok: clientVisionReady && (boxes.length > 0 || visibleLandmarks.length > 0),
      },
    ],
    [boxes.length, clientVisionReady, visibleLandmarks.length, webcameraError, webcameraReady]
  )
  const operatorChecklistReady = operatorChecklistItems.every((item) => item.ok)

  React.useEffect(() => {
    if (clientVisionReady) {
      onStatusChange("live")
      return
    }

    if (clientVisionBooting || (webcameraReady && !webcameraError)) {
      onStatusChange("standby")
      return
    }

    onStatusChange("offline")
  }, [clientVisionBooting, clientVisionReady, onStatusChange, webcameraError, webcameraReady])

  const clearSnapshotSchedule = React.useCallback(() => {
    if (snapshotWarmupTimeoutRef.current !== null) {
      window.clearTimeout(snapshotWarmupTimeoutRef.current)
      snapshotWarmupTimeoutRef.current = null
    }

    if (snapshotIntervalRef.current !== null) {
      window.clearInterval(snapshotIntervalRef.current)
      snapshotIntervalRef.current = null
    }
  }, [])

  const captureSnapshot = React.useCallback(async () => {
    if (snapshotCaptureInFlightRef.current) {
      return
    }

    const video = videoRef.current
    const overlayCanvas = overlayCanvasRef.current
    const sessionStartedAt = snapshotSessionStartedAtRef.current

    if (!video || !sessionStartedAt || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return
    }

    snapshotCaptureInFlightRef.current = true

    try {
      const blob = await renderCompositeSnapshotToJpegBlob(video, overlayCanvas)
      if (!blob) {
        return
      }

      const capturedAt = new Date().toISOString()
      const offsetMs = Math.max(0, Date.now() - sessionStartedAt)

      appendAnalyticsSnapshot({
        capturedAt,
        offsetMs,
        fileName: formatSnapshotFileName(capturedAt, offsetMs),
        blob,
      })
    } finally {
      snapshotCaptureInFlightRef.current = false
    }
  }, [videoRef])

  React.useEffect(() => {
    const video = videoRef.current
    const sessionReady =
      clientVisionReady && videoPlaying && Boolean(video) && (video?.videoWidth ?? 0) > 0 && (video?.videoHeight ?? 0) > 0

    if (!sessionReady || snapshotSessionActiveRef.current) {
      return
    }

    const startedAt = new Date().toISOString()
    snapshotSessionStartedAtRef.current = Date.parse(startedAt)
    snapshotSessionActiveRef.current = true
    startAnalyticsCaptureSession(startedAt)

    snapshotWarmupTimeoutRef.current = window.setTimeout(() => {
      void captureSnapshot()
      snapshotIntervalRef.current = window.setInterval(() => {
        void captureSnapshot()
      }, SNAPSHOT_INTERVAL_MS)
    }, SNAPSHOT_WARMUP_MS)
  }, [captureSnapshot, clientVisionReady, videoPlaying, videoRef])

  React.useEffect(() => {
    const video = videoRef.current
    const sessionReady =
      clientVisionReady && videoPlaying && Boolean(video) && (video?.videoWidth ?? 0) > 0 && (video?.videoHeight ?? 0) > 0

    if (sessionReady || !snapshotSessionActiveRef.current) {
      return
    }

    clearSnapshotSchedule()
    snapshotSessionActiveRef.current = false
    snapshotSessionStartedAtRef.current = null
  }, [clearSnapshotSchedule, clientVisionReady, videoPlaying, videoRef])

  React.useEffect(() => {
    const canvas = overlayCanvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const width = video.videoWidth || 640
    const height = video.videoHeight || 480

    if (!width || !height) {
      const canvasCtx = canvas.getContext("2d")
      if (canvasCtx) {
        canvasCtx.save()
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
        canvasCtx.restore()
      }
      return
    }

    if (canvas.width !== width) {
      canvas.width = width
    }

    if (canvas.height !== height) {
      canvas.height = height
    }

    const canvasCtx = canvas.getContext("2d")
    if (!canvasCtx) return

    canvasCtx.save()
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height)

    if (faceLandmarks.length > 0) {
      drawConnectors(canvasCtx, faceLandmarks, FACE_TESSELLATION_CONNECTIONS, FACE_TESSELLATION_STYLE)
      drawLandmarks(canvasCtx, faceLandmarks, FACE_DOT_STYLE)
      drawConnectors(canvasCtx, faceLandmarks, FACE_CONTOUR_CONNECTIONS, FACE_CONTOUR_STYLE)
    }

    if (poseLandmarks.length > 0) {
      drawConnectors(canvasCtx, poseLandmarks, POSE_CONNECTIONS, POSE_CONNECTOR_STYLE)
      drawLandmarks(canvasCtx, poseLandmarks, POSE_LANDMARK_STYLE)
    }

    leftHandLandmarks.forEach((landmarks) => {
      drawHandOverlay(canvasCtx, landmarks)
    })

    rightHandLandmarks.forEach((landmarks) => {
      drawHandOverlay(canvasCtx, landmarks)
    })

    canvasCtx.restore()
  }, [faceLandmarks, leftHandLandmarks, poseLandmarks, rightHandLandmarks, videoRef])

  function retryClientVision() {
    clearSnapshotSchedule()
    snapshotSessionActiveRef.current = false
    snapshotSessionStartedAtRef.current = null
    retry()
    push({
      title: "Client vision restart requested",
      detail: "MediaPipe Tasks are reloading in the browser.",
      tone: "success",
    })
  }

  React.useEffect(() => {
    return () => {
      clearSnapshotSchedule()
      snapshotSessionActiveRef.current = false
      snapshotSessionStartedAtRef.current = null
      void finalizeActiveCaptureSession(user?.id ?? null)
    }
  }, [clearSnapshotSchedule, user?.id])

  return (
    <>
      <Card className="relative overflow-hidden">
        <CardBody
          className={`grid items-start gap-6 pt-5 transition-[filter,opacity] duration-300 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch ${
            setupOverlayActive ? "pointer-events-none select-none blur-xl opacity-35" : ""
          }`}
        >
          <div className="flex min-h-[640px] flex-col gap-6 xl:h-full">
            <div>
              <CardTitle>Live Capture Hub</CardTitle>
            </div>

            <div className="glass-inset relative flex min-h-[420px] flex-1 flex-col overflow-hidden p-3">
              <div className="absolute left-5 top-5 z-20 flex gap-3">
                <div className="glass-panel px-3 py-2 text-xs uppercase tracking-[0.24em] text-white/60">
                  FPS <span className="ml-2 text-sm text-white">{fps.toFixed(1)}</span>
                </div>
                <div className="glass-panel px-3 py-2 text-xs uppercase tracking-[0.24em] text-white/60">
                  Latency <span className="ml-2 text-sm text-white">{latencyMs} ms</span>
                </div>
              </div>

              <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-glass bg-black">
                <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover bg-black" />
                <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                <div className="absolute bottom-4 left-4 z-20 rounded-full bg-black/60 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/70">
                  WebCamera
                </div>
                {!videoPlaying && !previewMessage ? (
                  <div className="absolute bottom-4 right-4 z-20 rounded-full bg-black/60 px-3 py-1 text-xs text-white/70">
                    {webcameraReady ? "Starting WebCamera preview..." : "Waiting for WebCamera permission..."}
                  </div>
                ) : null}
                {previewMessage ? (
                  <div className="absolute inset-x-6 bottom-6 z-30 rounded-[20px] border border-rose-300/20 bg-black/70 p-4 text-sm text-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl">
                    {previewMessage}
                  </div>
                ) : null}
                <div className="pointer-events-none absolute inset-0">
                  {boxes.map((box) => (
                    <div
                      key={box.id}
                      className="absolute rounded-xl border border-accent-cyan/80 shadow-[0_0_18px_rgba(34,211,238,0.28)]"
                      style={{
                        left: `${box.x}%`,
                        top: `${box.y}%`,
                        width: `${box.width}%`,
                        height: `${box.height}%`,
                      }}
                    >
                      <span className="absolute -top-7 left-0 rounded-full bg-black/70 px-2 py-1 text-xs text-white/80">
                        {boxes.length === 1 ? "Person 1" : box.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 xl:w-[360px]">
            <div className="glass-inset flex items-center gap-3 px-4 py-3 text-sm text-white/65">
              <span className={clientVisionReady ? "status-dot-live" : "status-dot-down"} />
              {clientVisionReady ? "Streaming from client vision" : clientVisionBooting ? "Loading client vision" : "Client vision offline"}
            </div>
            <div className="flex w-full flex-col items-end gap-3">
              <button
                type="button"
                className="glass-inset inline-flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-white/75 transition hover:bg-white/8"
                onClick={() => setChecklistOpen((value) => !value)}
                aria-expanded={checklistOpen}
              >
                <span className="inline-flex items-center gap-3">
                  <span className={operatorChecklistReady ? "status-dot-live" : "status-dot-down"} />
                  <span>Operator checklist</span>
                </span>
                <span className="text-white/45">{checklistOpen ? "Hide" : "Show"}</span>
              </button>
              {checklistOpen ? (
                <div className="glass-inset w-full space-y-3 p-4 text-sm text-white/70">
                  {operatorChecklistItems.map((item) => (
                    <div key={item.label} className="flex items-start gap-3">
                      <span className={`mt-1 ${item.ok ? "status-dot-live" : "status-dot-down"}`} />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="glass-inset p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-white/45">Frame source</div>
              <div className="mt-3 text-lg font-semibold">{frameLabel}</div>
              <p className="mt-2 text-sm text-white/55">
                The preview stays active while MediaPipe tasks initialize and browser inference warms up.
              </p>
            </div>
            <div className="glass-inset p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-white/45">Runtime policy</div>
              <ul className="mt-3 space-y-3 text-sm text-white/65">
                <li>Inference follows the browser video clock and only processes fresh frames.</li>
                <li>GPU delegation is attempted first and automatically falls back to CPU if the browser declines it.</li>
                <li>Track IDs are maintained with centroid matching and pruned after brief visibility gaps.</li>
              </ul>
            </div>
            <div className="glass-inset p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-white/45">Detection summary</div>
                <div className="mt-3 space-y-2 text-sm text-white/70">
                  {boxes.length > 0 ? (
                  boxes.map((box) => (
                    <div key={box.id} className="flex items-center justify-between gap-3 rounded-glass bg-white/5 px-3 py-2">
                      <span>{box.label}</span>
                      <span className="text-white/40">
                        {box.width.toFixed(0)}% x {box.height.toFixed(0)}%
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-glass bg-white/5 px-3 py-2 text-white/50">No person tracks detected yet.</div>
                )}
              </div>
            </div>
            <div className="glass-inset p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-white/45">Holistic overlay</div>
              <div className="mt-3 text-sm text-white/65">
                {visibleLandmarks.length > 0
                  ? `${visibleLandmarks.length} landmark points rendered from client-side MediaPipe output (${poseLandmarks.length} pose, ${faceLandmarks.length} face, ${leftHandLandmarks.flat().length + rightHandLandmarks.flat().length} hands).`
                  : "No client-side landmark points rendered yet."}
              </div>
            </div>
            {!clientVisionReady ? (
              <div className="glass-inset space-y-3 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-white/45">Vision status</div>
                <p className="text-sm text-white/60">
                  The browser runtime is still warming up. Camera preview stays available while tasks initialize and tracks settle.
                </p>
              </div>
            ) : null}
          </div>
        </CardBody>
        {setupOverlayActive ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(3,5,10,0.84)] px-4 backdrop-blur-[22px]">
            <div className="w-full max-w-3xl border border-white/12 bg-[rgba(6,8,14,0.92)] shadow-[0_30px_120px_rgba(0,0,0,0.6)] glass-panel-strong ring-accent">
              <div className="px-6 pb-4 pt-6">
                <div className="text-base font-semibold tracking-tight">Initialize client vision</div>
              </div>
              <div className="space-y-4 px-6 pb-6">
                <p className="text-sm text-white/75">
                  Grant camera access and let the browser load the MediaPipe WebAssembly tasks. The overlay closes automatically as soon as
                  client-side tracking becomes live.
                </p>
                <div className="overflow-x-auto rounded-glass bg-black/30 p-4 font-mono text-sm text-white/85">{runtimeLabel}</div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="primary" onClick={retryClientVision}>
                    Retry initialization
                  </Button>
                  <div className="text-sm text-white/45">The retry action reboots the task bundle without leaving the capture page.</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </>
  )
}
