"use client"

import * as React from "react"
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils"
import {
  FACEMESH_FACE_OVAL,
  FACEMESH_LEFT_EYE,
  FACEMESH_LEFT_EYEBROW,
  FACEMESH_LIPS,
  FACEMESH_RIGHT_EYE,
  FACEMESH_RIGHT_EYEBROW,
  HAND_CONNECTIONS,
  POSE_CONNECTIONS,
} from "@mediapipe/holistic"

import {
  ENGINE_DOCKER_COMMAND,
  ENGINE_HEALTH_URL,
  ENGINE_RECONNECT_INTERVAL_MS,
  ENGINE_WEBSOCKET_URL,
  FALLBACK_SNAPSHOT,
  readSnapshot,
} from "@/lib/engine"
import { Button } from "@/components/ui/Button"
import { Card, CardBody, CardTitle } from "@/components/ui/Card"
import { useToast } from "@/components/ui/Toast"
import { useWebcameraPreview } from "@/components/dashboard/useWebcameraPreview"

const CYAN = "#00BCD4"
const ORANGE = "#FF9800"
const WHITE = "#FFFFFF"

const RIGHT_SIDE_POSE_INDICES = new Set([12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32])
const FACE_CONTOUR_CONNECTIONS = [
  FACEMESH_FACE_OVAL,
  FACEMESH_LIPS,
  FACEMESH_LEFT_EYEBROW,
  FACEMESH_RIGHT_EYEBROW,
  FACEMESH_LEFT_EYE,
  FACEMESH_RIGHT_EYE,
]

const FACE_DOT_STYLE = {
  color: "transparent",
  fillColor: CYAN,
  radius: 1.5,
  lineWidth: 0,
} as const

const FACE_CONTOUR_STYLE = {
  color: WHITE,
  lineWidth: 2,
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

type CanvasLandmark = {
  x: number
  y: number
  z?: number
  visibility?: number
}

type RawObservation = {
  track_id?: string
  domain?: "face" | "pose" | "left_hand" | "right_hand"
  landmark_index?: number
  x?: number
  y?: number
  visibility?: number | null
}

function createEmptyLandmarks(size: number) {
  return Array.from({ length: size }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }))
}

function rebuildTrackLandmarks(observations: RawObservation[], trackId: string, canvasWidth: number, canvasHeight: number) {
  const poseLandmarks = createEmptyLandmarks(33)
  const leftHandLandmarks = createEmptyLandmarks(21)
  const rightHandLandmarks = createEmptyLandmarks(21)
  const faceLandmarks = createEmptyLandmarks(468)

  let hasPose = false
  let hasLeftHand = false
  let hasRightHand = false
  let hasFace = false

  observations.forEach((observation) => {
    if (observation.track_id !== trackId && `track-${observation.track_id}` !== trackId) return
    if (typeof observation.landmark_index !== "number") return
    if (typeof observation.x !== "number" || typeof observation.y !== "number") return

    const landmarkIndex = observation.landmark_index
    const point = {
      x: observation.x / canvasWidth,
      y: observation.y / canvasHeight,
      z: 0,
      visibility: observation.visibility ?? 1,
    }

    if (observation.domain === "pose" && landmarkIndex < 33) {
      poseLandmarks[landmarkIndex] = point
      hasPose = true
    } else if (observation.domain === "left_hand" && landmarkIndex < 21) {
      leftHandLandmarks[landmarkIndex] = point
      hasLeftHand = true
    } else if (observation.domain === "right_hand" && landmarkIndex < 21) {
      rightHandLandmarks[landmarkIndex] = point
      hasRightHand = true
    } else if (observation.domain === "face" && landmarkIndex < 468) {
      faceLandmarks[landmarkIndex] = point
      hasFace = true
    }
  })

  return {
    poseLandmarks,
    leftHandLandmarks,
    rightHandLandmarks,
    faceLandmarks,
    hasPose,
    hasLeftHand,
    hasRightHand,
    hasFace,
  }
}

function drawHandOverlay(canvasCtx: CanvasRenderingContext2D, landmarks: CanvasLandmark[]) {
  if (landmarks.length === 0) return

  drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, HAND_CONNECTOR_STYLE)
  drawLandmarks(canvasCtx, landmarks, HAND_LANDMARK_STYLE)
}

export function LiveCaptureHub({
  onStatusChange,
  showEngineModal = true,
}: {
  onStatusChange: (status: "live" | "standby" | "offline") => void
  showEngineModal?: boolean
}) {
  const { push } = useToast()
  const { videoRef, webcameraError, webcameraReady, videoPlaying } = useWebcameraPreview()
  const captureCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const reconnectTimer = React.useRef<number | null>(null)
  const pollTimer = React.useRef<number | null>(null)
  const frameTimer = React.useRef<number | null>(null)
  const socketRef = React.useRef<WebSocket | null>(null)
  const connectSocketRef = React.useRef<() => void>(() => undefined)
  const connectedRef = React.useRef(false)
  const onStatusChangeRef = React.useRef(onStatusChange)
  const shuttingDownRef = React.useRef(false)
  const frameInFlightRef = React.useRef(false)
  const lastFrameSentAtRef = React.useRef<number | null>(null)
  const lastFrameReceivedAtRef = React.useRef<number | null>(null)
  const rawFramePayloadRef = React.useRef<{ observations?: RawObservation[] } | null>(null)
  const [snapshot, setSnapshot] = React.useState(FALLBACK_SNAPSHOT)
  const [connected, setConnected] = React.useState(false)
  const [isCopying, setIsCopying] = React.useState(false)
  const [checklistOpen, setChecklistOpen] = React.useState(false)
  const engineOverlayActive = showEngineModal && !connected
  const reconnectCadenceSeconds = (ENGINE_RECONNECT_INTERVAL_MS / 1000).toFixed(1)
  const visibleLandmarks = React.useMemo(
    () =>
      snapshot.landmarks.filter((landmark) => {
        if (landmark.domain === "face") return landmark.landmarkIndex % 6 === 0
        if (landmark.domain === "pose") return landmark.visibility == null || landmark.visibility > 0.35
        return true
      }),
    [snapshot.landmarks]
  )
  const operatorChecklistItems = React.useMemo(
    () => [
      {
        label: "Confirm all webcams have granted browser permission.",
        ok: webcameraReady && !webcameraError,
      },
      {
        label: "Verify the Docker engine is listening on port 8000.",
        ok: connected,
      },
      {
        label: "Review the heads-up display boxes before beginning the scoring session.",
        ok: connected && (snapshot.boxes.length > 0 || visibleLandmarks.length > 0),
      },
    ],
    [connected, snapshot.boxes.length, visibleLandmarks.length, webcameraError, webcameraReady]
  )
  const operatorChecklistReady = operatorChecklistItems.every((item) => item.ok)

  React.useEffect(() => {
    connectedRef.current = connected
  }, [connected])

  React.useEffect(() => {
    onStatusChangeRef.current = onStatusChange
  }, [onStatusChange])

  const scheduleReconnect = React.useCallback(() => {
    if (reconnectTimer.current !== null) return
    reconnectTimer.current = window.setTimeout(() => {
      reconnectTimer.current = null
      connectSocketRef.current()
    }, ENGINE_RECONNECT_INTERVAL_MS)
  }, [])

  const stopFramePump = React.useCallback(() => {
    if (frameTimer.current !== null) {
      window.clearInterval(frameTimer.current)
      frameTimer.current = null
    }
    frameInFlightRef.current = false
  }, [])

  const pumpFrame = React.useCallback(() => {
    const socket = socketRef.current
    const video = videoRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN || !video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return
    }

    if (frameInFlightRef.current) return

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720

    let canvas = captureCanvasRef.current
    if (!canvas) {
      canvas = document.createElement("canvas")
      captureCanvasRef.current = canvas
    }

    canvas.width = width
    canvas.height = height

    const context = canvas.getContext("2d")
    if (!context) return

    context.drawImage(video, 0, 0, width, height)
    frameInFlightRef.current = true
    lastFrameSentAtRef.current = performance.now()

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          frameInFlightRef.current = false
          return
        }

        try {
          const bytes = await blob.arrayBuffer()
          if (socketRef.current !== socket || socket.readyState !== WebSocket.OPEN) {
            frameInFlightRef.current = false
            return
          }
          socket.send(bytes)
        } catch {
          frameInFlightRef.current = false
        }
      },
      "image/jpeg",
      0.8
    )
  }, [videoRef])

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

    const payload = rawFramePayloadRef.current
    const canvasCtx = canvas.getContext("2d")
    if (!canvasCtx) return

    canvasCtx.save()
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height)

    if (!payload || !Array.isArray(payload.observations)) {
      canvasCtx.restore()
      return
    }

    const uniqueTrackIds = Array.from(
      new Set(payload.observations.map((observation) => observation.track_id).filter((trackId): trackId is string => typeof trackId === "string"))
    )

    uniqueTrackIds.forEach((trackId) => {
      const { faceLandmarks, poseLandmarks, leftHandLandmarks, rightHandLandmarks, hasFace, hasPose, hasLeftHand, hasRightHand } =
        rebuildTrackLandmarks(payload.observations ?? [], trackId, width, height)

      if (hasFace) {
        drawLandmarks(canvasCtx, faceLandmarks, FACE_DOT_STYLE)
        FACE_CONTOUR_CONNECTIONS.forEach((contour) => {
          const isValid = contour.every(
            ([startIndex, endIndex]) => (faceLandmarks[startIndex]?.visibility ?? 0) > 0 && (faceLandmarks[endIndex]?.visibility ?? 0) > 0
          )
          if (isValid) {
            drawConnectors(canvasCtx, faceLandmarks, contour, FACE_CONTOUR_STYLE)
          }
        })
      }

      if (hasPose) {
        drawConnectors(canvasCtx, poseLandmarks, POSE_CONNECTIONS, POSE_CONNECTOR_STYLE)
        drawLandmarks(canvasCtx, poseLandmarks, POSE_LANDMARK_STYLE)
      }

      if (hasLeftHand) {
        drawHandOverlay(canvasCtx, leftHandLandmarks)
      }

      if (hasRightHand) {
        drawHandOverlay(canvasCtx, rightHandLandmarks)
      }
    })

    canvasCtx.restore()
  }, [snapshot.fps, videoRef])

  const startFramePump = React.useCallback(() => {
    if (frameTimer.current !== null) return
    frameTimer.current = window.setInterval(() => {
      pumpFrame()
    }, 250)
  }, [pumpFrame])

  const runHealthPoll = React.useCallback(async () => {
    try {
      const response = await fetch(ENGINE_HEALTH_URL, { cache: "no-store" })
      if (response.ok && !connectedRef.current) {
        connectSocketRef.current()
      }
    } catch {
      onStatusChangeRef.current("offline")
    }
  }, [])

  React.useEffect(() => {
    connectSocketRef.current = () => {
      if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return

      onStatusChangeRef.current("standby")

      try {
        const socket = new WebSocket(ENGINE_WEBSOCKET_URL)
        socketRef.current = socket

        socket.onopen = () => {
          setConnected(true)
          onStatusChangeRef.current("live")
          startFramePump()
        }

        socket.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data) as { type?: string; observations?: RawObservation[] }
            if (parsed.type === "frame_result") {
              rawFramePayloadRef.current = parsed
            }
            const now = performance.now()
            const latencyMs = lastFrameSentAtRef.current ? Math.max(1, Math.round(now - lastFrameSentAtRef.current)) : snapshot.latencyMs
            const fps =
              lastFrameReceivedAtRef.current && now > lastFrameReceivedAtRef.current
                ? Number((1000 / (now - lastFrameReceivedAtRef.current)).toFixed(1))
                : snapshot.fps

            lastFrameReceivedAtRef.current = now
            frameInFlightRef.current = false
            setSnapshot(readSnapshot(parsed, { fps, latencyMs }) || FALLBACK_SNAPSHOT)
          } catch {
            frameInFlightRef.current = false
            setSnapshot(FALLBACK_SNAPSHOT)
          }
        }

        socket.onerror = () => {
          socket.close()
        }

        socket.onclose = () => {
          socketRef.current = null
          setConnected(false)
          stopFramePump()
          if (shuttingDownRef.current) return
          onStatusChangeRef.current("offline")
          scheduleReconnect()
        }
      } catch {
        setConnected(false)
        stopFramePump()
        onStatusChangeRef.current("offline")
        scheduleReconnect()
      }
    }
  }, [scheduleReconnect, snapshot.fps, snapshot.latencyMs, startFramePump, stopFramePump])

  React.useEffect(() => {
    shuttingDownRef.current = false
    connectSocketRef.current()

    pollTimer.current = window.setInterval(() => {
      void runHealthPoll()
    }, 6000)

    return () => {
      shuttingDownRef.current = true
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current)
      if (pollTimer.current !== null) window.clearInterval(pollTimer.current)
      stopFramePump()
      socketRef.current?.close()
    }
  }, [runHealthPoll, stopFramePump])

  React.useEffect(() => {
    if (connected && webcameraReady) {
      startFramePump()
      return
    }

    stopFramePump()
  }, [connected, startFramePump, stopFramePump, webcameraReady])

  async function copyCommand() {
    setIsCopying(true)
    try {
      await navigator.clipboard.writeText(ENGINE_DOCKER_COMMAND)
      push({ title: "Launch command copied", detail: ENGINE_DOCKER_COMMAND, tone: "success" })
    } catch {
      push({ title: "Copy failed", detail: ENGINE_DOCKER_COMMAND, tone: "danger" })
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <>
      <Card className="relative overflow-hidden">
        <CardBody
          className={`grid items-start gap-6 pt-5 transition-[filter,opacity] duration-300 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch ${
            engineOverlayActive ? "pointer-events-none select-none blur-xl opacity-35" : ""
          }`}
        >
          <div className="flex min-h-[640px] flex-col gap-6 xl:h-full">
            <div>
              <CardTitle>Live Capture Hub</CardTitle>
            </div>

            <div className="glass-inset relative flex min-h-[420px] flex-1 flex-col overflow-hidden p-3">
              <div className="absolute left-5 top-5 z-20 flex gap-3">
                <div className="glass-panel px-3 py-2 text-xs uppercase tracking-[0.24em] text-white/60">
                  FPS <span className="ml-2 text-sm text-white">{snapshot.fps.toFixed(1)}</span>
                </div>
                <div className="glass-panel px-3 py-2 text-xs uppercase tracking-[0.24em] text-white/60">
                  Latency <span className="ml-2 text-sm text-white">{snapshot.latencyMs} ms</span>
                </div>
              </div>

              <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-glass bg-black">
                <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover bg-black" />
                <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                <div className="absolute bottom-4 left-4 z-20 rounded-full bg-black/60 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/70">
                  WebCamera
                </div>
                {!videoPlaying && !webcameraError ? (
                  <div className="absolute bottom-4 right-4 z-20 rounded-full bg-black/60 px-3 py-1 text-xs text-white/70">
                    {webcameraReady ? "Starting WebCamera preview..." : "Waiting for WebCamera permission..."}
                  </div>
                ) : null}
                {webcameraError ? (
                  <div className="absolute inset-x-6 bottom-6 z-30 rounded-[20px] border border-rose-300/20 bg-black/70 p-4 text-sm text-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl">
                    {webcameraError}
                  </div>
                ) : null}
                <div className="pointer-events-none absolute inset-0">
                  {snapshot.boxes.map((box) => (
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
                        {box.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 xl:w-[360px]">
            <div className="glass-inset flex items-center gap-3 px-4 py-3 text-sm text-white/65">
              <span className={connected ? "status-dot-live" : "status-dot-down"} />
              {connected ? "Streaming from engine" : "Waiting for engine"}
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
              <div className="mt-3 text-lg font-semibold">{connected ? snapshot.frameLabel : FALLBACK_SNAPSHOT.frameLabel}</div>
              <p className="mt-2 text-sm text-white/55">
                The preview should stay visible even while the local engine is reconnecting or warming up.
              </p>
            </div>
            <div className="glass-inset p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-white/45">Reconnect policy</div>
              <ul className="mt-3 space-y-3 text-sm text-white/65">
                <li>WebSocket reconnect every {reconnectCadenceSeconds} seconds after disconnect.</li>
                <li>Background health probe every 6 seconds against the local engine.</li>
                <li>Overlay prompts the operator until the stream comes back online.</li>
              </ul>
            </div>
            <div className="glass-inset p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-white/45">Detection summary</div>
              <div className="mt-3 space-y-2 text-sm text-white/70">
                {snapshot.boxes.length > 0 ? (
                  snapshot.boxes.map((box) => (
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
                  ? `${visibleLandmarks.length} landmark points rendered from MediaPipe holistic output.`
                  : "No holistic landmark points rendered yet."}
              </div>
            </div>
            {!connected ? (
              <div className="glass-inset space-y-3 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-white/45">Engine status</div>
                <p className="text-sm text-white/60">
                  The local engine is offline. Use the launch command shown over the preview to bring detections online.
                </p>
              </div>
            ) : null}
          </div>
        </CardBody>
        {engineOverlayActive ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(3,5,10,0.84)] px-4 backdrop-blur-[22px]">
            <div className="w-full max-w-3xl border border-white/12 bg-[rgba(6,8,14,0.92)] shadow-[0_30px_120px_rgba(0,0,0,0.6)] glass-panel-strong ring-accent">
              <div className="px-6 pb-4 pt-6">
                <div className="text-base font-semibold tracking-tight">Start local capture engine</div>
              </div>
              <div className="space-y-4 px-6 pb-6">
                <p className="text-sm text-white/75">
                  Bring the local engine online to unlock live detections and holistic overlays for capture. You can still move to the
                  dashboard or analytics pages while this prompt stays active here.
                </p>
                <div className="overflow-x-auto rounded-glass bg-black/30 p-4 font-mono text-sm text-white/85">
                  {ENGINE_DOCKER_COMMAND}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="primary" onClick={copyCommand} loading={isCopying}>
                    Copy launch command
                  </Button>
                  <div className="text-sm text-white/45">This prompt closes automatically as soon as the local engine reconnects.</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </>
  )
}
