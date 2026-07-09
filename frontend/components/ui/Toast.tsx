"use client"

import * as React from "react"

import { cx } from "@/utils/cx"

type ToastItem = {
  id: string
  title: string
  detail?: string
  tone?: "default" | "success" | "danger"
}

type ToastContextValue = {
  push: (toast: Omit<ToastItem, "id">) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

function toneClass(tone: ToastItem["tone"]) {
  if (tone === "success") return "border-emerald-400/30 bg-emerald-500/10"
  if (tone === "danger") return "border-red-400/30 bg-red-500/10"
  return "border-white/10 bg-white/6"
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])

  const push = React.useCallback((toast: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`
    setToasts((prev) => [...prev, { ...toast, id }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3800)
  }, [])

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[60] flex w-[360px] max-w-[calc(100vw-2.5rem)] flex-col gap-3">
        {toasts.map((toast) => (
          <div key={toast.id} className={cx("rounded-glass border p-4 shadow-glass backdrop-blur", toneClass(toast.tone))}>
            <div className="text-sm font-semibold">{toast.title}</div>
            {toast.detail ? <div className="mt-1 text-sm text-muted">{toast.detail}</div> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast must be used inside ToastProvider")
  }
  return ctx
}
