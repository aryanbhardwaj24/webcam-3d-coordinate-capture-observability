import { BROWSER_OTLP_PROXY_ENDPOINTS } from "@/lib/observability/shared"

export function hasBrowserTelemetryConfig() {
  return true
}

export function getBrowserTelemetryTraceUrl() {
  return BROWSER_OTLP_PROXY_ENDPOINTS.traces
}

export function getBrowserTelemetryLogsUrl() {
  return BROWSER_OTLP_PROXY_ENDPOINTS.logs
}

export function getBrowserTelemetryMetricsUrl() {
  return BROWSER_OTLP_PROXY_ENDPOINTS.metrics
}
