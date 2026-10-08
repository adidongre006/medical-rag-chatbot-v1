from __future__ import annotations

from fastapi import HTTPException, Request

from app.services.rag import RAGService


def get_rag(request: Request) -> RAGService:
    rag: RAGService | None = getattr(request.app.state, "rag", None)
    if rag is None:
        raise HTTPException(status_code=503, detail="The knowledge base is still loading. Try again shortly.")
    return rag
