"""Chat endpoints: JSON, Server-Sent Events, and the deprecated Flask-style `/get`."""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Form
from fastapi.responses import PlainTextResponse, StreamingResponse

from app.api.deps import get_rag
from app.core.logging import log_event
from app.core.rate_limit import enforce_rate_limit
from app.schemas.chat import ChatRequest, ChatResponse, ErrorResponse
from app.services.rag import RAGService

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(enforce_rate_limit)])

_ERRORS = {
    422: {"description": "Validation error"},
    429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    502: {"model": ErrorResponse, "description": "Upstream model / vector store failure"},
    503: {"model": ErrorResponse, "description": "Service still starting"},
}


def _new_conversation_id() -> str:
    return "c_" + uuid.uuid4().hex[:12]


def sse(event: str, data: dict[str, Any]) -> str:
    """Format one Server-Sent Event frame."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post(
    "/chat",
    response_model=ChatResponse,
    responses=_ERRORS,
    summary="Ask a question (single JSON response)",
)
async def chat(body: ChatRequest, rag: Annotated[RAGService, Depends(get_rag)]) -> ChatResponse:
    started = time.perf_counter()
    answer, sources = await rag.answer(body.message, body.history)
    latency_ms = int((time.perf_counter() - started) * 1000)
    log_event(
        logger, "chat_completed", latency_ms=latency_ms, sources=len(sources), history=len(body.history)
    )
    return ChatResponse(
        answer=answer,
        sources=sources,
        conversation_id=body.conversation_id or _new_conversation_id(),
        latency_ms=latency_ms,
    )


@router.post(
    "/chat/stream",
    responses={
        **_ERRORS,
        200: {
            "description": "Server-Sent Events stream",
            "content": {
                "text/event-stream": {
                    "example": (
                        "event: sources\n"
                        'data: {"sources":[{"source":"Medical_book.pdf","page":42,"snippet":"..."}]}\n\n'
                        'event: token\ndata: {"text":"Diabetes "}\n\n'
                        'event: done\ndata: {"conversation_id":"c_8f2a1b","latency_ms":1830}\n\n'
                    )
                }
            },
        },
    },
    summary="Ask a question (streamed as Server-Sent Events)",
)
async def chat_stream(body: ChatRequest, rag: Annotated[RAGService, Depends(get_rag)]) -> StreamingResponse:
    conversation_id = body.conversation_id or _new_conversation_id()

    async def event_stream() -> AsyncIterator[str]:
        started = time.perf_counter()
        source_count = 0
        # An SSE comment frame flushes the headers to the client immediately.
        yield ": connected\n\n"
        try:
            async for _kind, payload in rag.stream(body.message, body.history):
                if isinstance(payload, str):
                    yield sse("token", {"text": payload})
                else:
                    source_count = len(payload)
                    yield sse("sources", {"sources": [s.model_dump() for s in payload]})
        except asyncio.CancelledError:
            # Starlette cancels the generator when the client disconnects; this also
            # stops the upstream LLM stream because the `async for` is torn down.
            log_event(logger, "chat_stream_client_disconnected")
            raise
        except Exception:
            logger.exception("chat_stream_failed")
            yield sse(
                "error",
                {
                    "code": "upstream_error",
                    "message": "The assistant is unavailable right now. Please try again.",
                },
            )
            return
        latency_ms = int((time.perf_counter() - started) * 1000)
        log_event(logger, "chat_stream_completed", latency_ms=latency_ms, sources=source_count)
        yield sse("done", {"conversation_id": conversation_id, "latency_ms": latency_ms})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


legacy_router = APIRouter(dependencies=[Depends(enforce_rate_limit)])


@legacy_router.api_route(
    "/get",
    methods=["GET", "POST"],
    deprecated=True,
    response_class=PlainTextResponse,
    summary="Deprecated Flask-compatible endpoint (form field `msg`, plain-text reply)",
)
async def legacy_get(
    rag: Annotated[RAGService, Depends(get_rag)],
    msg: Annotated[str, Form(min_length=1, max_length=2000)],
) -> PlainTextResponse:
    answer, _ = await rag.answer(msg.strip(), [])
    return PlainTextResponse(answer)
