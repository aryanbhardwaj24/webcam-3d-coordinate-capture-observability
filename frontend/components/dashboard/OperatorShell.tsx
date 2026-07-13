"use client"

import Link from "next/link"
import * as React from "react"

import { operatorNav } from "@/lib/navigation"
import { ProfileMenu } from "@/components/dashboard/ProfileMenu"
import { TelemetryBadge } from "@/components/dashboard/TelemetryBadge"
import { Card } from "@/components/ui/Card"

const telemetryEndpoint = process.env.NEXT_PUBLIC_SIGNOZ_OTLP_ENDPOINT || "env placeholder"

export function OperatorShell({
  title,
  description,
  status,
  children,
}: {
  title: string
  description: string
  status: "live" | "standby" | "offline"
  children: React.ReactNode
}) {
  return (
    <main className="app-shell px-6 py-6 md:px-8">
      <div className="absolute left-0 top-0 h-96 w-96 bg-[radial-gradient(circle,rgba(34,211,238,0.16),transparent_62%)]" />
      <div className="absolute right-0 top-16 h-[32rem] w-[32rem] bg-[radial-gradient(circle,rgba(167,139,250,0.16),transparent_62%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6">
        <Card variant="strong" className="px-5 py-4">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-white/40">Capture dashboard</div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
                <p className="mt-2 max-w-3xl text-sm text-white/60">{description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <TelemetryBadge
                  tone={status}
                  label={
                    status === "live" ? "Engine stream live" : status === "standby" ? "Reconnect in progress" : "Engine offline"
                  }
                />
                <div className="glass-inset px-3 py-2 text-sm text-white/65">
                  OTLP <span className="ml-2 font-mono text-xs text-white/45">{telemetryEndpoint}</span>
                </div>
                <ProfileMenu />
              </div>
            </div>

            <nav className="flex flex-wrap gap-3">
              {operatorNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-glass border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </Card>

        {children}
      </div>
    </main>
  )
}

