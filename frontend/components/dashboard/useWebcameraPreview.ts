"use client"

import * as React from "react"

let sharedWebcameraStream: MediaStream | null = null
let sharedWebcameraRequest: Promise<MediaStream> | null = null
let sharedWebcameraConsumers = 0
let sharedWebcameraReleaseTimer: number | null = null

function clearSharedWebcameraReleaseTimer() {
  if (sharedWebcameraReleaseTimer !== null) {
    window.clearTimeout(sharedWebcameraReleaseTimer)
    sharedWebcameraReleaseTimer = null
  }
}

function stopSharedWebcameraStream() {
  sharedWebcameraStream?.getTracks().forEach((track) => track.stop())
  sharedWebcameraStream = null
  sharedWebcameraRequest = null
}

async function getSharedWebcameraStream() {
  clearSharedWebcameraReleaseTimer()
  const activeTracks = sharedWebcameraStream?.getTracks().filter((track) => track.readyState === "live") || []
  if (sharedWebcameraStream && activeTracks.length > 0) {
    return sharedWebcameraStream
  }

  if (!sharedWebcameraRequest) {
    sharedWebcameraRequest = (async () => {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        })
      } catch {
        return navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        })
      }
    })()
  }

  sharedWebcameraStream = await sharedWebcameraRequest
  sharedWebcameraRequest = null
  return sharedWebcameraStream
}

function acquireSharedWebcamera() {
  clearSharedWebcameraReleaseTimer()
  sharedWebcameraConsumers += 1
}

function releaseSharedWebcamera() {
  sharedWebcameraConsumers = Math.max(0, sharedWebcameraConsumers - 1)

  if (sharedWebcameraConsumers > 0) {
    return
  }

  clearSharedWebcameraReleaseTimer()
  sharedWebcameraReleaseTimer = window.setTimeout(() => {
    if (sharedWebcameraConsumers === 0) {
      stopSharedWebcameraStream()
    }
    sharedWebcameraReleaseTimer = null
  }, 350)
}

export function useWebcameraPreview() {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const [webcameraReady, setWebcameraReady] = React.useState(false)
  const [videoPlaying, setVideoPlaying] = React.useState(false)
  const [webcameraError, setWebcameraError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    const videoElement = videoRef.current

    async function startWebcamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setWebcameraError("Browser camera APIs are not available in this environment.")
        return
      }

      try {
        acquireSharedWebcamera()
        const stream = await getSharedWebcameraStream()

        if (!active) {
          return
        }

        if (!videoElement) {
          window.setTimeout(() => {
            if (!active) return
            setWebcameraError("Camera preview could not attach to the page.")
          }, 250)
          return
        }

        const markPreviewReady = () => {
          if (!active) return
          if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
            setVideoPlaying(true)
            setWebcameraReady(true)
            setWebcameraError(null)
          }
        }

        const markPreviewStopped = () => {
          if (!active) return
          setVideoPlaying(false)
        }

        videoElement.muted = true
        videoElement.autoplay = true
        videoElement.playsInline = true
        videoElement.onloadedmetadata = markPreviewReady
        videoElement.onloadeddata = markPreviewReady
        videoElement.oncanplay = markPreviewReady
        videoElement.onplaying = markPreviewReady
        videoElement.onpause = markPreviewStopped
        videoElement.onended = markPreviewStopped
        videoElement.srcObject = stream

        const attemptPlay = async () => {
          try {
            await videoElement.play()
            markPreviewReady()
          } catch {
            window.setTimeout(() => {
              void videoElement
                .play()
                .then(() => {
                  markPreviewReady()
                })
                .catch(() => undefined)
            }, 300)
          }
        }

        void attemptPlay()
        window.setTimeout(markPreviewReady, 800)
        setWebcameraReady(true)
        setWebcameraError(null)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to read camera stream."
        setWebcameraError(message)
      }
    }

    void startWebcamera()

    return () => {
      active = false
      setVideoPlaying(false)
      if (videoElement) {
        videoElement.onloadedmetadata = null
        videoElement.onloadeddata = null
        videoElement.oncanplay = null
        videoElement.onplaying = null
        videoElement.onpause = null
        videoElement.onended = null
        videoElement.srcObject = null
      }
      releaseSharedWebcamera()
    }
  }, [])

  return {
    videoRef,
    webcameraReady,
    videoPlaying,
    webcameraError,
    hasWebcameraAccess: webcameraReady && !webcameraError,
  }
}
