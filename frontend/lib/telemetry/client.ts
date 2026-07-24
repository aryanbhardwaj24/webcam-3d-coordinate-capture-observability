import { metrics, trace } from "@opentelemetry/api"
import type { Counter } from "@opentelemetry/api"
import { logs as otelLogs, SeverityNumber } from "@opentelemetry/api-logs"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { registerInstrumentations } from "@opentelemetry/instrumentation"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { LoggerProvider, BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web"
import { SEMRESATTRS_SERVICE_NAME } from "@opentelemetry/semantic-conventions"
import { getWebAutoInstrumentations } from "@opentelemetry/auto-instrumentations-web"

import { OBSERVABILITY_SERVICE_NAME } from "@/lib/observability/shared"
import {
  getBrowserTelemetryLogsUrl,
  getBrowserTelemetryMetricsUrl,
  getBrowserTelemetryTraceUrl,
  hasBrowserTelemetryConfig,
} from "@/lib/telemetry/config"

type AttributeValue = string | number | boolean

type BrowserTelemetryState = {
  started: boolean
  loggerProvider: LoggerProvider | null
  meterProvider: MeterProvider | null
  pageViewsTotal: Counter | null
  telemetryEventsTotal: Counter | null
}

declare global {
  interface Window {
    __browserAnalyticsTelemetryState?: BrowserTelemetryState
  }
}

function getState(): BrowserTelemetryState {
  if (!window.__browserAnalyticsTelemetryState) {
    window.__browserAnalyticsTelemetryState = {
      started: false,
      loggerProvider: null,
      meterProvider: null,
      pageViewsTotal: null,
      telemetryEventsTotal: null,
    }
  }

  return window.__browserAnalyticsTelemetryState
}

function cleanAttributes(attributes: Record<string, AttributeValue | undefined> = {}) {
  return Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== undefined))
}

function createIgnoreUrlPatterns() {
  return [/\/otel\/v1\/(?:traces|logs|metrics)$/]
}

export function startBrowserTelemetry() {
  if (typeof window === "undefined") {
    return false
  }

  const state = getState()
  if (state.started || !hasBrowserTelemetryConfig()) {
    return state.started
  }

  const resource = resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: OBSERVABILITY_SERVICE_NAME,
  })

  const traceExporter = new OTLPTraceExporter({
    url: getBrowserTelemetryTraceUrl(),
  })

  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
  })

  tracerProvider.register()

  registerInstrumentations({
    instrumentations: [
      getWebAutoInstrumentations({
        "@opentelemetry/instrumentation-fetch": {
          ignoreUrls: createIgnoreUrlPatterns(),
          propagateTraceHeaderCorsUrls: [new RegExp(`^${window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)],
        },
        "@opentelemetry/instrumentation-xml-http-request": {
          ignoreUrls: createIgnoreUrlPatterns(),
          propagateTraceHeaderCorsUrls: [new RegExp(`^${window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)],
        },
      }),
    ],
  })

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: getBrowserTelemetryLogsUrl(),
        }),
      }),
    ],
  })

  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: getBrowserTelemetryMetricsUrl(),
        }),
        exportIntervalMillis: 15000,
        exportTimeoutMillis: 5000,
      }),
    ],
  })

  otelLogs.setGlobalLoggerProvider(loggerProvider)
  metrics.setGlobalMeterProvider(meterProvider)

  const meter = meterProvider.getMeter(OBSERVABILITY_SERVICE_NAME)

  state.started = true
  state.loggerProvider = loggerProvider
  state.meterProvider = meterProvider
  state.pageViewsTotal = meter.createCounter("browser_page_views_total", {
    description: "Counts browser page views emitted by the client telemetry layer.",
  })
  state.telemetryEventsTotal = meter.createCounter("browser_telemetry_events_total", {
    description: "Counts custom browser telemetry events emitted by the client telemetry layer.",
  })

  return true
}

export function recordBrowserEvent(name: string, attributes: Record<string, AttributeValue | undefined> = {}) {
  if (typeof window === "undefined") return

  const state = getState()
  if (!state.started || !state.loggerProvider) return

  const logger = state.loggerProvider.getLogger(OBSERVABILITY_SERVICE_NAME)
  const spanContext = trace.getActiveSpan()?.spanContext()

  state.telemetryEventsTotal?.add(1, cleanAttributes({ eventName: name, ...attributes }))

  logger.emit({
    body: name,
    severityNumber: SeverityNumber.INFO,
    severityText: "INFO",
    attributes: cleanAttributes({
      ...attributes,
      traceId: spanContext?.traceId,
      spanId: spanContext?.spanId,
    }),
  })
}

export function recordBrowserPageView(pathname: string) {
  if (typeof window === "undefined") return

  const state = getState()
  if (!state.started) return

  state.pageViewsTotal?.add(1, { pathname })
  recordBrowserEvent("browser.page_view", {
    pathname,
  })
}

export async function flushBrowserTelemetry() {
  if (typeof window === "undefined") return

  const state = getState()
  await Promise.allSettled([
    state.loggerProvider?.forceFlush(),
    state.meterProvider?.forceFlush(),
  ])
}
