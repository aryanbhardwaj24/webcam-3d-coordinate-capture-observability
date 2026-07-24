import { NextResponse } from "next/server"

import { forwardBrowserTelemetry } from "@/lib/observability/proxy"
import type { OtlpSignal } from "@/lib/observability/shared"

export const runtime = "nodejs"

const ALLOWED_SIGNALS: OtlpSignal[] = ["traces", "logs", "metrics"]

type RouteContext = {
  params: Promise<{
    signal: string
  }>
}

async function resolveSignal(context: RouteContext) {
  const { signal } = await context.params
  return ALLOWED_SIGNALS.includes(signal as OtlpSignal) ? (signal as OtlpSignal) : null
}

export async function POST(request: Request, context: RouteContext) {
  const signal = await resolveSignal(context)
  if (!signal) {
    return NextResponse.json({ error: "Unsupported telemetry signal" }, { status: 404 })
  }

  return forwardBrowserTelemetry(request, signal)
}

export async function GET(_request: Request, context: RouteContext) {
  const signal = await resolveSignal(context)
  if (!signal) {
    return NextResponse.json({ error: "Unsupported telemetry signal" }, { status: 404 })
  }

  return NextResponse.json({ error: "Method not allowed" }, { status: 405 })
}
