"use client"

import Link from "next/link"
import * as React from "react"
import { usePathname } from "next/navigation"

import { operatorNav } from "@/lib/navigation"
import { hasBrowserTelemetryConfig } from "@/lib/telemetry/config"
import { ProfileMenu } from "@/components/dashboard/ProfileMenu"
import { TelemetryBadge } from "@/components/dashboard/TelemetryBadge"
import { Card } from "@/components/ui/Card"

export function OperatorShell({
  title,
  description,
  status,
  badges,
  headerControls,
  allowPageScroll = false,
  plainBackground = false,
  solidHeader = false,
  children,
}: {
  title: string
  description: string
  status: "live" | "standby" | "offline"
  badges?: React.ReactNode
  headerControls?: React.ReactNode
  allowPageScroll?: boolean
  plainBackground?: boolean
  solidHeader?: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <main
      className={`app-shell px-6 py-6 md:px-8 ${allowPageScroll ? "app-shell-scroll" : ""} ${
        plainBackground ? "app-shell-plain" : ""
      }`}
    >
      <div className="absolute left-0 top-0 h-96 w-96 bg-[radial-gradient(circle,rgba(34,211,238,0.16),transparent_62%)]" />
      <div className="absolute right-0 top-16 h-[32rem] w-[32rem] bg-[radial-gradient(circle,rgba(167,139,250,0.16),transparent_62%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6">
        <Card
          variant="strong"
          className={`relative z-30 px-5 py-4 ${solidHeader ? "border-white/12 bg-[rgba(7,10,17,0.94)] backdrop-blur-none shadow-[0_24px_60px_rgba(0,0,0,0.38)]" : ""}`}
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
                <p className="mt-2 max-w-3xl text-sm text-white/60">{description}</p>
              </div>
              {headerControls || (
                <div className="flex flex-wrap items-center gap-3">
                  {badges || (
                    <>
                      <TelemetryBadge
                        tone={status}
                        label={
                          status === "live" ? "Engine stream live" : status === "standby" ? "Reconnect in progress" : "Engine offline"
                        }
                      />
                      <TelemetryBadge
                        tone={hasBrowserTelemetryConfig() ? "live" : "standby"}
                        label={hasBrowserTelemetryConfig() ? "Browser telemetry active" : "Browser telemetry unavailable"}
                      />
                    </>
                  )}
                  <ProfileMenu />
                </div>
              )}
            </div>

            <nav className="flex flex-wrap gap-3">
              {operatorNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-glass px-4 py-2 text-sm transition ${
                    pathname === item.href
                      ? "border border-white/25 bg-white/85 font-medium text-obsidian-950 shadow-[0_14px_40px_rgba(255,255,255,0.18)]"
                      : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </Card>

        <div className="relative z-0">{children}</div>
      </div>
    </main>
  )
}
