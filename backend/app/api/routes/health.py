from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.schemas.chat import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, summary="Liveness probe")
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/ready", response_model=HealthResponse, summary="Readiness probe (checks the vector index)")
async def ready(request: Request) -> HealthResponse:
    rag = getattr(request.app.state, "rag", None)
    if rag is None or not await rag.ping():
        raise HTTPException(status_code=503, detail="Not ready")
    return HealthResponse(status="ready", index=rag.index_name)
