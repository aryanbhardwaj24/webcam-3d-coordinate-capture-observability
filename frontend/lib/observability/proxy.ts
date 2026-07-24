import { NextResponse } from "next/server"

import { getOtlpEndpoint, getOtelProtocol, type OtlpSignal } from "@/lib/observability/shared"

const ALLOWED_CONTENT_TYPES = ["application/json", "application/x-protobuf"]
const FORWARDABLE_HEADERS = ["content-type", "content-encoding"] as const

function buildForwardHeaders(request: Request) {
  const headers = new Headers()

  FORWARDABLE_HEADERS.forEach((headerName) => {
    const headerValue = request.headers.get(headerName)
    if (headerValue) {
      headers.set(headerName, headerValue)
    }
  })

  headers.delete("authorization")
  headers.delete("cookie")

  return headers
}

function isValidContentType(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""
  return ALLOWED_CONTENT_TYPES.some((candidate) => contentType.includes(candidate))
}

export async function forwardBrowserTelemetry(request: Request, signal: OtlpSignal) {
  if (request.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 })
  }

  if (getOtelProtocol() !== "http/protobuf") {
    return new NextResponse(null, { status: 202 })
  }

  if (!isValidContentType(request)) {
    return NextResponse.json({ error: "Unsupported telemetry payload" }, { status: 415 })
  }

  const collectorUrl = getOtlpEndpoint(signal)
  if (!collectorUrl) {
    return new NextResponse(null, { status: 202 })
  }

  const body = await request.arrayBuffer()

  try {
    const upstream = await fetch(collectorUrl, {
      method: "POST",
      headers: buildForwardHeaders(request),
      body,
      cache: "no-store",
    })

    if (upstream.status >= 500) {
      return new NextResponse(null, { status: 202 })
    }

    return new NextResponse(null, { status: upstream.status })
  } catch {
    return new NextResponse(null, { status: 202 })
  }
}
