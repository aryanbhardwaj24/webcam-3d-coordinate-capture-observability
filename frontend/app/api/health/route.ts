import { NextResponse } from "next/server"

import { flushNodeObservability, incrementApiRequestsTotal, logServerEvent } from "@/lib/observability/server"

export const runtime = "nodejs"

export async function GET() {
  incrementApiRequestsTotal({
    route: "/api/health",
    method: "GET",
  })

  logServerEvent("Health endpoint accessed", {
    attributes: {
      route: "/api/health",
      method: "GET",
    },
  })

  await flushNodeObservability()

  return NextResponse.json({
    ok: true,
    service: "browser-analytics-dashboard",
    route: "/api/health",
  })
}
