"use client"

import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/Button"
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { useToast } from "@/components/ui/Toast"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

export function AuthExperience() {
  const { push } = useToast()
  const [form, setForm] = React.useState({ email: "", password: "" })

  function updateField(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function onEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    push({
      title: "Auth stub is ready",
      detail: "Phase 4 will replace this placeholder with a Supabase session exchange.",
      tone: "success",
    })
  }

  function onGoogleClick() {
    push({
      title: googleClientId && supabaseUrl ? "Google auth placeholder" : "Missing auth env",
      detail:
        googleClientId && supabaseUrl
          ? "UI wiring is in place. Phase 4 will attach the real Supabase OAuth redirect."
          : "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_GOOGLE_CLIENT_ID before enabling OAuth.",
      tone: googleClientId && supabaseUrl ? "success" : "default",
    })
  }

  return (
    <main className="app-shell flex min-h-screen items-center justify-center px-6 py-12">
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_55%)]" />
      <div className="absolute bottom-0 right-0 h-96 w-96 bg-[radial-gradient(circle,rgba(167,139,250,0.18),transparent_60%)]" />
      <div className="relative z-10 grid w-full max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card variant="strong" className="ring-accent overflow-hidden">
          <CardHeader className="pb-5">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              <span className="status-dot-live" />
              Phase 3 frontend control plane
            </div>
            <CardTitle className="max-w-xl text-4xl leading-tight">
              Bring the calibrated multi-cam engine online with a SigNoz-style operator console.
            </CardTitle>
            <CardDescription className="mt-4 max-w-2xl text-base text-white/70">
              Dark obsidian surfaces, telemetry accents, and stub-friendly auth flows keep the frontend ready for
              Supabase integration without blocking the local capture workflow.
            </CardDescription>
          </CardHeader>
          <CardBody className="grid gap-4 md:grid-cols-3">
            {[
              ["Transport", "Future Supabase auth + local engine websocket"],
              ["Telemetry", "Live engine badge, reconnect cues, and HUD overlays"],
              ["Exports", "Browser ZIP bundles with analytics snapshots"],
            ].map(([label, value]) => (
              <div key={label} className="glass-inset p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-white/45">{label}</div>
                <div className="mt-3 text-sm text-white/80">{value}</div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card className="ring-accent">
          <CardHeader>
            <CardTitle className="text-2xl">Authenticate operator</CardTitle>
            <CardDescription>Use email/password today. Google OAuth stays wired for the Supabase handoff.</CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            <form className="space-y-4" onSubmit={onEmailSubmit}>
              <label className="block space-y-2">
                <span className="text-sm text-white/70">Email</span>
                <Input
                  required
                  name="email"
                  type="email"
                  placeholder="operator@capture.local"
                  value={form.email}
                  onChange={updateField}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm text-white/70">Password</span>
                <Input
                  required
                  name="password"
                  type="password"
                  placeholder="Enter your access key"
                  value={form.password}
                  onChange={updateField}
                />
              </label>
              <Button type="submit" variant="primary" size="lg" className="w-full">
                Continue to operator console
              </Button>
            </form>

            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-white/35">
              <div className="h-px flex-1 bg-white/10" />
              Or
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <Button type="button" variant="secondary" size="lg" className="w-full" onClick={onGoogleClick}>
              <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                <path d="M21.8 12.2c0-.74-.07-1.45-.19-2.14H12v4.05h5.5a4.72 4.72 0 0 1-2.04 3.1v2.58h3.3c1.93-1.77 3.04-4.39 3.04-7.59Z" />
                <path d="M12 22c2.76 0 5.08-.92 6.77-2.5l-3.3-2.58c-.92.62-2.08 1-3.47 1-2.67 0-4.94-1.8-5.75-4.22H2.83v2.66A10.22 10.22 0 0 0 12 22Z" />
                <path d="M6.25 13.7A6.08 6.08 0 0 1 5.9 12c0-.6.1-1.18.35-1.7V7.64H2.83A10.18 10.18 0 0 0 1.75 12c0 1.64.39 3.2 1.08 4.36L6.25 13.7Z" />
                <path d="M12 6.08c1.5 0 2.86.52 3.93 1.52l2.95-2.95C17.06 2.96 14.74 2 12 2 7.96 2 4.45 4.3 2.83 7.64L6.25 10.3c.81-2.42 3.08-4.22 5.75-4.22Z" />
              </svg>
              Continue with Google
            </Button>

            <div className="glass-inset space-y-2 p-4 text-sm text-white/65">
              <div className="flex items-center justify-between gap-3">
                <span>Supabase endpoint</span>
                <span className="font-mono text-xs text-white/40">{supabaseUrl || "env placeholder"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Google client</span>
                <span className="font-mono text-xs text-white/40">{googleClientId || "env placeholder"}</span>
              </div>
            </div>

            <p className="text-sm text-white/45">
              The dashboard remains reachable for UI validation while auth is stubbed. <Link href="/dashboard" className="accent-text">Open dashboard preview</Link>.
            </p>
          </CardBody>
        </Card>
      </div>
    </main>
  )
}
