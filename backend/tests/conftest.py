from __future__ import annotations

from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI

from app.core.config import Settings
from app.main import create_app
from app.services.rag import RAGService


class FakeChain:
    """Stands in for the LangChain retrieval chain (no network, no models)."""

    def __init__(self, tokens: list[str] | None = None, fail: bool = False) -> None:
        self.tokens = tokens if tokens is not None else ["Diabetes ", "causes ", "high blood sugar."]
        self.fail = fail
        self.calls: list[dict[str, Any]] = []

    @staticmethod
    def _docs() -> list[Any]:
        return [
            SimpleNamespace(
                page_content="Diabetes   mellitus is a metabolic\n disease.",
                metadata={"source": "data/Medical_book.pdf", "page": 41},
            ),
            SimpleNamespace(page_content="No page info here.", metadata={"source": "x.pdf"}),
        ]

    async def ainvoke(self, input: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        self.calls.append(input)
        if self.fail:
            raise RuntimeError("boom")
        return {"answer": "".join(self.tokens), "context": self._docs()}

    async def astream(self, input: dict[str, Any], **kwargs: Any) -> AsyncIterator[dict[str, Any]]:
        self.calls.append(input)
        yield {"input": input["input"]}
        yield {"context": self._docs()}
        for token in self.tokens:
            if self.fail:
                raise RuntimeError("boom")
            yield {"answer": token}


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "pinecone_api_key": "test-pinecone",
        "hf_token": "test-hf",
        "rate_limit": "1000/minute",
        "cors_origins": ["http://localhost:3000"],
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


@pytest.fixture
def chain() -> FakeChain:
    return FakeChain()


@pytest.fixture
def app(chain: FakeChain) -> FastAPI:
    return create_app(make_settings(), RAGService(chain=chain, index_name="test-index"))


@pytest_asyncio.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
