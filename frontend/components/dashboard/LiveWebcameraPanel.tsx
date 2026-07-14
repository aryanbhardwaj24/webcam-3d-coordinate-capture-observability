"use client"

import * as React from "react"

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card"
import { useWebcameraPreview } from "@/components/dashboard/useWebcameraPreview"

export function LiveWebcameraPanel({
  onAccessChange,
}: {
  onAccessChange?: (hasAccess: boolean) => void
}) {
  const { hasWebcameraAccess, videoPlaying, videoRef, webcameraError, webcameraReady } = useWebcameraPreview()

  React.useEffect(() => {
    onAccessChange?.(hasWebcameraAccess)
  }, [hasWebcameraAccess, onAccessChange])

  return (
    <Card className="relative z-0 overflow-hidden">
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Live WebCamera</CardTitle>
        </div>
        <div className="glass-inset flex items-center gap-3 px-4 py-3 text-sm text-white/65">
          <span className={hasWebcameraAccess ? "status-dot-live" : "status-dot-down"} />
          {hasWebcameraAccess ? "Streaming from WebCamera" : "Waiting for WebCamera access"}
        </div>
      </CardHeader>

      <CardBody>
        <div className="glass-inset relative overflow-hidden p-3">
          <div className="w-full">
            <div className="relative aspect-video overflow-hidden rounded-glass bg-black">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-contain bg-black"
              />
              <div className="absolute bottom-4 left-4 z-20 rounded-full bg-black/60 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/70">
                WebCamera
              </div>
              {!videoPlaying && !webcameraError ? (
                <div className="absolute bottom-4 right-4 z-20 rounded-full bg-black/60 px-3 py-1 text-xs text-white/70">
                  {webcameraReady ? "Starting WebCamera preview..." : "Waiting for WebCamera permission..."}
                </div>
              ) : null}
              {webcameraError ? (
                <div className="absolute inset-x-6 bottom-6 z-30 rounded-[20px] border border-rose-300/20 bg-black/75 p-4 text-sm text-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
                  {webcameraError}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
