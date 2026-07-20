"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cx } from "@/utils/cx"

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  dismissible = true,
  closeLabel = "Close",
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
  dismissible?: boolean
  closeLabel?: string
}) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!open || !dismissible) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [dismissible, open, onClose])

  React.useEffect(() => {
    if (!open || typeof document === "undefined") return

    const { body } = document
    const previousOverflow = body.style.overflow

    body.style.overflow = "hidden"

    return () => {
      body.style.overflow = previousOverflow
    }
  }, [open])

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-black/72 backdrop-blur-2xl"
        onClick={dismissible ? onClose : undefined}
      />
      <div className={cx("relative w-full max-w-2xl glass-panel-strong ring-accent", className)}>
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div className="min-w-0">
            {title ? <div className="text-base font-semibold tracking-tight">{title}</div> : null}
          </div>
          {dismissible ? (
            <button
              type="button"
              aria-label={closeLabel}
              className="rounded-glass bg-white/5 px-3 py-2 text-lg leading-none text-white/70 hover:bg-white/10 hover:text-white"
              onClick={onClose}
            >
              &times;
            </button>
          ) : null}
        </div>
        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>,
    document.body
  )
}
