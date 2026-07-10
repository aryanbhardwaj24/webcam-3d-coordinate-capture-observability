"use client"

import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/Button"

export function ProfileMenu() {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener("mousedown", onPointerDown)
    return () => window.removeEventListener("mousedown", onPointerDown)
  }, [])

  return (
    <div ref={ref} className="relative">
      <Button type="button" variant="secondary" onClick={() => setOpen((value) => !value)}>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-accent-cyan/80 to-accent-violet/80 text-xs font-semibold text-obsidian-950">
          AO
        </span>
        Aryan Operator
      </Button>

      {open ? (
        <div className="glass-panel-strong absolute right-0 top-14 z-30 min-w-64 p-2 ring-accent">
          <div className="border-b border-white/10 px-3 py-3">
            <div className="text-sm font-semibold">Primary capture operator</div>
            <div className="mt-1 text-xs text-white/45">Supabase profile binding will replace this local placeholder.</div>
          </div>
          <div className="p-2 text-sm text-white/70">
            <div className="rounded-glass px-3 py-2 hover:bg-white/5">Session scope: local lab</div>
            <div className="rounded-glass px-3 py-2 hover:bg-white/5">Telemetry route: SigNoz OTLP</div>
            <Link className="block rounded-glass px-3 py-2 hover:bg-white/5" href="/login">
              Switch operator
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
