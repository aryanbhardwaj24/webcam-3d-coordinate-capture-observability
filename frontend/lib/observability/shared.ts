export const OBSERVABILITY_SERVICE_NAME = "browser-analytics-dashboard"

export const BROWSER_OTLP_PROXY_ENDPOINTS = {
  traces: "/otel/v1/traces",
  logs: "/otel/v1/logs",
  metrics: "/otel/v1/metrics",
} as const

export type OtlpSignal = keyof typeof BROWSER_OTLP_PROXY_ENDPOINTS

const WRAPPING_QUOTES = /^["'`]+|["'`]+$/g

function normalizeEnvironmentValue(value: string | undefined) {
  if (!value) return ""
  return value.trim().replace(WRAPPING_QUOTES, "").trim()
}

function withSignalSuffix(baseUrl: string, signal: OtlpSignal) {
  return `${baseUrl.replace(/\/+$/, "")}/v1/${signal}`
}

export function getOtelProtocol() {
  return normalizeEnvironmentValue(process.env.OTEL_EXPORTER_OTLP_PROTOCOL) || "http/protobuf"
}

export function getOtlpEndpoint(signal: OtlpSignal) {
  const specific =
    signal === "traces"
      ? normalizeEnvironmentValue(process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT)
      : signal === "logs"
        ? normalizeEnvironmentValue(process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT)
        : normalizeEnvironmentValue(process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT)

  if (specific) return specific

  const shared = normalizeEnvironmentValue(process.env.OTEL_EXPORTER_OTLP_ENDPOINT)
  if (!shared) return ""

  return withSignalSuffix(shared, signal)
}

export function hasServerOtlpEndpoint(signal: OtlpSignal) {
  return Boolean(getOtlpEndpoint(signal))
}

export function hasAnyServerOtlpEndpoint() {
  return ["traces", "logs", "metrics"].some((signal) => hasServerOtlpEndpoint(signal as OtlpSignal))
}
