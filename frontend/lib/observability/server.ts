import { metrics, trace } from "@opentelemetry/api"
import type { Counter } from "@opentelemetry/api"
import { logs as otelLogs, SeverityNumber } from "@opentelemetry/api-logs"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { LoggerProvider, BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { SEMRESATTRS_SERVICE_NAME } from "@opentelemetry/semantic-conventions"

import { OBSERVABILITY_SERVICE_NAME, hasAnyServerOtlpEndpoint } from "@/lib/observability/shared"

type LogAttributeValue = string | number | boolean

type LogSeverity = "debug" | "info" | "warn" | "error"

type LogOptions = {
  severity?: LogSeverity
  attributes?: Record<string, LogAttributeValue | undefined>
}

type NodeObservabilityState = {
  initialized: boolean
  loggerProvider: LoggerProvider | null
  meterProvider: MeterProvider | null
  apiRequestsTotal: Counter | null
}

declare global {
  var __browserAnalyticsNodeObservability: NodeObservabilityState | undefined
}

function getState(): NodeObservabilityState {
  if (!globalThis.__browserAnalyticsNodeObservability) {
    globalThis.__browserAnalyticsNodeObservability = {
      initialized: false,
      loggerProvider: null,
      meterProvider: null,
      apiRequestsTotal: null,
    }
  }

  return globalThis.__browserAnalyticsNodeObservability
}

function getSeverityNumber(severity: LogSeverity) {
  switch (severity) {
    case "debug":
      return SeverityNumber.DEBUG
    case "warn":
      return SeverityNumber.WARN
    case "error":
      return SeverityNumber.ERROR
    default:
      return SeverityNumber.INFO
  }
}

function cleanAttributes(attributes: Record<string, LogAttributeValue | undefined> = {}) {
  return Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== undefined))
}

export function initializeNodeObservability() {
  const state = getState()

  if (state.initialized || !hasAnyServerOtlpEndpoint()) {
    return state
  }

  const resource = resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: OBSERVABILITY_SERVICE_NAME,
  })

  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: 15000,
        exportTimeoutMillis: 5000,
      }),
    ],
  })

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter(),
      }),
    ],
  })

  metrics.setGlobalMeterProvider(meterProvider)
  otelLogs.setGlobalLoggerProvider(loggerProvider)

  const meter = meterProvider.getMeter(OBSERVABILITY_SERVICE_NAME)
  const apiRequestsTotal = meter.createCounter("api_requests_total", {
    description: "Counts API route requests processed by the Next.js server.",
  })

  state.initialized = true
  state.loggerProvider = loggerProvider
  state.meterProvider = meterProvider
  state.apiRequestsTotal = apiRequestsTotal

  return state
}

export function incrementApiRequestsTotal(attributes: Record<string, LogAttributeValue | undefined> = {}) {
  const state = initializeNodeObservability()
  state.apiRequestsTotal?.add(1, cleanAttributes(attributes))
}

export function logServerEvent(message: string, options: LogOptions = {}) {
  const state = initializeNodeObservability()
  const loggerProvider = state.loggerProvider

  if (!loggerProvider) return

  const logger = loggerProvider.getLogger(OBSERVABILITY_SERVICE_NAME)
  const spanContext = trace.getActiveSpan()?.spanContext()

  logger.emit({
    body: message,
    severityNumber: getSeverityNumber(options.severity ?? "info"),
    severityText: (options.severity ?? "info").toUpperCase(),
    attributes: cleanAttributes({
      ...options.attributes,
      traceId: spanContext?.traceId,
      spanId: spanContext?.spanId,
    }),
  })
}

export async function flushNodeObservability() {
  const state = getState()

  await Promise.allSettled([
    state.loggerProvider?.forceFlush(),
    state.meterProvider?.forceFlush(),
  ])
}
