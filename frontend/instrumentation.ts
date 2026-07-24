import { registerOTel } from "@vercel/otel"

import { OBSERVABILITY_SERVICE_NAME } from "@/lib/observability/shared"
import { initializeNodeObservability } from "@/lib/observability/server"

export function register() {
  registerOTel({
    serviceName: OBSERVABILITY_SERVICE_NAME,
  })

  if (process.env.NEXT_RUNTIME === "nodejs") {
    initializeNodeObservability()
  }
}
