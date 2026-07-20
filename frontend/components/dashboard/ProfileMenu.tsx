"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { createPortal } from "react-dom"

import { useAuth } from "@/components/providers/AuthProvider"
import { Button } from "@/components/ui/Button"
import { useToast } from "@/components/ui/Toast"

export function ProfileMenu() {
  const router = useRouter()
  const { push } = useToast()
  const { loading, profile, signOut, user } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [signingOut, setSigningOut] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const [menuPosition, setMenuPosition] = React.useState({ top: 0, left: 0 })
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const triggerRef = React.useRef<HTMLDivElement | null>(null)
  const menuRef = React.useRef<HTMLDivElement | null>(null)

  const updateMenuPosition = React.useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const menuWidth = 288
    const viewportPadding = 16
    const left = Math.min(window.innerWidth - menuWidth - viewportPadding, Math.max(viewportPadding, rect.right - menuWidth))

    setMenuPosition({
      top: rect.bottom + 12,
      left,
    })
  }, [])

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!open) return

    updateMenuPosition()

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }

      setOpen(false)
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    function onViewportChange() {
      updateMenuPosition()
    }

    window.addEventListener("mousedown", onPointerDown)
    window.addEventListener("keydown", onEscape)
    window.addEventListener("resize", onViewportChange)
    window.addEventListener("scroll", onViewportChange, true)

    return () => {
      window.removeEventListener("mousedown", onPointerDown)
      window.removeEventListener("keydown", onEscape)
      window.removeEventListener("resize", onViewportChange)
      window.removeEventListener("scroll", onViewportChange, true)
    }
  }, [open, updateMenuPosition])

  const metadata = user?.user_metadata as { full_name?: unknown } | undefined
  const metadataName = typeof metadata?.full_name === "string" ? metadata.full_name : null
  const displayName = profile?.display_name || metadataName || user?.email?.split("@")[0] || "Operator"
  const displayEmail = profile?.email || user?.email || "No active session"
  const initials = displayName
    .split(" ")
    .filter((part): part is string => Boolean(part))
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "OP"

  async function handleSignOut() {
    setSigningOut(true)

    try {
      await signOut()
      router.push("/login")
      router.refresh()
      push({
        title: "Signed out",
        detail: "Hopefully you'll revisit again.",
        tone: "success",
      })
    } catch (error) {
      push({
        title: "Sign-out failed",
        detail: error instanceof Error ? error.message : "Unknown session shutdown error",
        tone: "danger",
      })
    } finally {
      setSigningOut(false)
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div ref={triggerRef}>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            if (!open) {
              updateMenuPosition()
            }
            setOpen((value) => !value)
          }}
          disabled={loading}
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-accent-cyan/80 to-accent-violet/80 text-xs font-semibold text-obsidian-950">
            {initials}
          </span>
          {displayName}
        </Button>
      </div>

      {open && mounted
        ? createPortal(
            <div className="fixed inset-0 z-[110]">
              <div className="absolute inset-0 bg-transparent" />
              <div
                ref={menuRef}
                className="absolute z-[120] min-w-72 rounded-[24px] border border-white/15 bg-[rgba(7,10,17,0.96)] p-2 shadow-[0_28px_90px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
                style={{
                  top: menuPosition.top,
                  left: menuPosition.left,
                }}
              >
                <div className="border-b border-white/10 px-4 py-4">
                  <div className="text-sm font-semibold">{displayName}</div>
                  <div className="mt-1 text-xs text-white/45">{displayEmail}</div>
                </div>
                <div className="p-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-center rounded-glass border border-white/12 bg-white/12 px-4 py-2.5 font-medium text-white shadow-[0_18px_40px_rgba(0,0,0,0.32)] hover:bg-white/18"
                    onClick={handleSignOut}
                    loading={signingOut}
                  >
                    Log out
                  </Button>
                </div>
              </div>
            </div>
            ,
            document.body
          )
        : null}
    </div>
  )
}
