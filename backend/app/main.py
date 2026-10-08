"""FastAPI application factory."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import chat, health
from app.core.config import Settings, get_settings
from app.core.logging import RequestContextMiddleware, configure_logging
from app.core.rate_limit import RateLimiter
from app.services.rag import RAGService

logger = logging.getLogger(__name__)

API_PREFIX = "/api/v1"


def _error(status: int, code: str, message: str, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status, headers=headers)


def create_app(settings: Settings | None = None, rag: RAGService | None = None) -> FastAPI:
    """Build the app. `settings` / `rag` can be injected (used by the tests)."""
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if app.state.rag is None:
            logger.info("Building RAG chain (first start downloads the embedding model)...")
            app.state.rag = await run_in_threadpool(RAGService.build, settings)
        yield
        app.state.rag = None

    app = FastAPI(
        title="Medical RAG Chatbot API",
        version="2.0.0",
        description=(
            "Retrieval-augmented medical Q&A over indexed PDFs.\n\n"
            "**Educational use only - not medical advice.**"
        ),
        lifespan=lifespan,
    )
    app.state.rag = rag
    app.state.settings = settings
    app.state.limiter = RateLimiter(settings.rate_limit)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Retry-After"],
        max_age=600,
    )
    # Added last => outermost: request-id/security headers apply to every response.
    app.add_middleware(RequestContextMiddleware, max_request_bytes=settings.max_request_bytes)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        codes = {404: "not_found", 405: "method_not_allowed", 429: "rate_limited", 503: "unavailable"}
        return _error(
            exc.status_code,
            codes.get(exc.status_code, "http_error"),
            str(exc.detail),
            headers=dict(exc.headers) if exc.headers else None,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        location = ".".join(str(part) for part in first.get("loc", []) if part != "body")
        message = f"Invalid request: {location or 'body'} - {first.get('msg', 'validation failed')}"
        return _error(422, "validation_error", message)

    @app.exception_handler(Exception)
    async def unhandled_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_exception", exc_info=exc)
        return _error(500, "internal_error", "Something went wrong on our side.")

    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(chat.router, prefix=API_PREFIX, tags=["chat"])
    app.include_router(chat.legacy_router, tags=["legacy"])
    return app
