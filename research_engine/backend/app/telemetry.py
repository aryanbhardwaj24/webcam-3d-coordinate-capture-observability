from __future__ import annotations

import os

from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def configure_telemetry(app: FastAPI) -> bool:
    endpoint = os.getenv("SIGNOZ_OTLP_ENDPOINT", "").strip()
    headers = os.getenv("SIGNOZ_OTLP_HEADERS", "").strip()

    if not endpoint or not headers:
        return False

    trace_endpoint = f"{endpoint.rstrip('/')}/v1/traces"
    resource = Resource.create(
        {
            "service.name": "cv-engine-local",
            "service.version": "0.1.0",
            "deployment.environment": "local",
        }
    )

    provider = TracerProvider(resource=resource)
    provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(
                endpoint=trace_endpoint,
                headers=_parse_headers(headers),
            )
        )
    )
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
    return True


def _parse_headers(raw_headers: str) -> dict[str, str]:
    parsed: dict[str, str] = {}

    for entry in raw_headers.split(","):
        item = entry.strip()
        if not item:
            continue
        key, _, value = item.partition("=")
        if key:
            parsed[key.strip()] = value.strip()

    return parsed

