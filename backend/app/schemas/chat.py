"""Pydantic v2 request/response models for the chat API."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Message = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
HistoryContent = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: HistoryContent


class ChatRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "message": "How is it treated?",
                    "conversation_id": "c_8f2a1b",
                    "history": [
                        {"role": "user", "content": "What are the symptoms of diabetes?"},
                        {"role": "assistant", "content": "Common symptoms include increased thirst..."},
                    ],
                }
            ]
        }
    )

    message: Message
    conversation_id: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_\-]+$")
    history: list[ChatTurn] = Field(default_factory=list, max_length=10)


class Source(BaseModel):
    source: str
    page: int | None = None
    snippet: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]
    conversation_id: str
    latency_ms: int


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody


class HealthResponse(BaseModel):
    status: Literal["ok", "ready"]
    index: str | None = None
