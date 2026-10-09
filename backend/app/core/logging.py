"""Structured JSON logging, request-id propagation and secret redaction."""

from __future__ import annotations

import json
import logging
import re
import sys
import time
import uuid
from contextvars import ContextVar
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

# Patterns for credentials that must never reach a log line.
_SECRET_PATTERNS = [
    re.compile(r"pcsk_[A-Za-z0-9_\-]+"),
    re.compile(r"hf_[A-Za-z0-9]{16,}"),
    re.compile(r"sk-[A-Za-z0-9]{16,}"),
    re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._\-]+"),
]


def redact(text: str) -> str:
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub(lambda m: (m.group(1) if m.groups() else "") + "[REDACTED]", text)
    return text


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "request_id": request_id_var.get(),
            "message": redact(record.getMessage()),
        }
        extra = getattr(record, "extra_fields", None)
        if isinstance(extra, dict):
            payload.update(extra)
        if record.exc_info:
            payload["exc"] = redact(self.formatException(record.exc_info))
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # uvicorn's access log would duplicate our request log line.
    logging.getLogger("uvicorn.access").disabled = True


def log_event(logger: logging.Logger, message: str, **fields: Any) -> None:
    """Log an INFO line with structured fields (never pass message bodies)."""
    logger.info(message, extra={"extra_fields": fields})


_SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    (b"cross-origin-resource-policy", b"same-site"),
]


class _BodyTooLarge(Exception):
    """Raised internally when a request body exceeds the configured limit."""


class RequestContextMiddleware:
    """Pure-ASGI middleware (safe for streaming responses).

    * assigns / propagates `X-Request-ID`
    * rejects oversized bodies with 413 (by `Content-Length`)
    * adds security headers
    * emits one structured access-log line per request
    """

    def __init__(self, app: ASGIApp, max_request_bytes: int = 64 * 1024) -> None:
        self.app = app
        self.max_request_bytes = max_request_bytes
        self.logger = logging.getLogger("app.access")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        incoming = headers.get(b"x-request-id", b"").decode("latin-1")[:64]
        request_id = incoming if re.fullmatch(r"[A-Za-z0-9_\-]{8,64}", incoming) else uuid.uuid4().hex
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        status_holder = {"status": 500}

        response_started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                status_holder["status"] = message["status"]
                response_headers = list(message.get("headers", []))
                response_headers.append((b"x-request-id", request_id.encode()))
                response_headers.extend(_SECURITY_HEADERS)
                message["headers"] = response_headers
            await send(message)

        async def too_large() -> None:
            body = b'{"error":{"code":"payload_too_large","message":"Request body is too large."}}'
            await send_wrapper(
                {
                    "type": "http.response.start",
                    "status": 413,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                    ],
                }
            )
            await send_wrapper({"type": "http.response.body", "body": body})

        received = 0

        async def limited_receive() -> Message:
            # Counts bytes as they arrive, so chunked requests (no Content-Length) are capped too.
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_request_bytes:
                    raise _BodyTooLarge
            return message

        try:
            declared = headers.get(b"content-length")
            if declared is not None and declared.isdigit() and int(declared) > self.max_request_bytes:
                await too_large()
                return
            try:
                await self.app(scope, limited_receive, send_wrapper)
            except _BodyTooLarge:
                if not response_started:
                    await too_large()
        finally:
            log_event(
                self.logger,
                "request",
                method=scope.get("method"),
                path=scope.get("path"),
                status=status_holder["status"],
                duration_ms=round((time.perf_counter() - started) * 1000, 1),
            )
            request_id_var.reset(token)