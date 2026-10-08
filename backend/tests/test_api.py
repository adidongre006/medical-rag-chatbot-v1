from __future__ import annotations

import json

import httpx
import pytest

from app.main import create_app
from app.services.rag import RAGService
from tests.conftest import FakeChain, make_settings

pytestmark = pytest.mark.asyncio


def parse_sse(text: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for frame in text.split("\n\n"):
        if not frame.strip() or frame.startswith(":"):
            continue
        name = ""
        data = ""
        for line in frame.splitlines():
            if line.startswith("event:"):
                name = line[6:].strip()
            elif line.startswith("data:"):
                data += line[5:].strip()
        events.append((name, json.loads(data)))
    return events


async def test_health(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "index": None}
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-request-id"]


async def test_ready(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/ready")
    assert r.status_code == 200
    assert r.json()["index"] == "test-index"


async def test_ready_503_when_not_loaded() -> None:
    app = create_app(make_settings(), rag=None)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get("/api/v1/ready")
        assert r.status_code == 503
        assert r.json()["error"]["code"] == "unavailable"
        r = await c.post("/api/v1/chat", json={"message": "hi"})
        assert r.status_code == 503


async def test_ready_503_when_probe_fails() -> None:
    def bad_probe() -> None:
        raise RuntimeError("pinecone down")

    app = create_app(make_settings(), RAGService(chain=FakeChain(), probe=bad_probe))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        assert (await c.get("/api/v1/ready")).status_code == 503


async def test_chat_happy_path(client: httpx.AsyncClient, chain: FakeChain) -> None:
    r = await client.post(
        "/api/v1/chat",
        json={
            "message": "  What is diabetes?  ",
            "history": [{"role": "user", "content": "hello"}, {"role": "assistant", "content": "hi"}],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["answer"] == "Diabetes causes high blood sugar."
    assert body["conversation_id"].startswith("c_")
    assert isinstance(body["latency_ms"], int)
    assert body["sources"][0] == {
        "source": "Medical_book.pdf",
        "page": 42,  # 0-indexed page 41 -> human page 42
        "snippet": "Diabetes mellitus is a metabolic disease.",
    }
    assert body["sources"][1]["page"] is None
    # message was stripped and history was converted to LangChain messages
    assert chain.calls[0]["input"] == "What is diabetes?"
    assert len(chain.calls[0]["chat_history"]) == 2


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"message": ""},
        {"message": "   "},
        {"message": "x" * 2001},
        {"message": "hi", "history": [{"role": "system", "content": "x"}]},
        {"message": "hi", "history": [{"role": "user", "content": "x"}] * 11},
        {"message": "hi", "conversation_id": "bad id!"},
    ],
)
async def test_chat_validation_errors(client: httpx.AsyncClient, payload: dict) -> None:
    r = await client.post("/api/v1/chat", json=payload)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


async def test_stream_event_order(client: httpx.AsyncClient) -> None:
    r = await client.post(
        "/api/v1/chat/stream", json={"message": "What is diabetes?", "conversation_id": "c_abc"}
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["x-accel-buffering"] == "no"
    assert "no-cache" in r.headers["cache-control"]
    events = parse_sse(r.text)
    names = [name for name, _ in events]
    assert names == ["sources", "token", "token", "token", "done"]
    assert events[0][1]["sources"][0]["page"] == 42
    assert (
        "".join(data["text"] for name, data in events if name == "token")
        == "Diabetes causes high blood sugar."
    )
    assert events[-1][1]["conversation_id"] == "c_abc"


async def test_stream_error_event() -> None:
    app = create_app(make_settings(), RAGService(chain=FakeChain(fail=True)))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post("/api/v1/chat/stream", json={"message": "hi"})
    events = parse_sse(r.text)
    assert events[-1][0] == "error"
    assert events[-1][1]["code"] == "upstream_error"
    assert "boom" not in r.text  # internals never leak


async def test_chat_internal_error_is_sanitized() -> None:
    app = create_app(make_settings(), RAGService(chain=FakeChain(fail=True)))
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/api/v1/chat", json={"message": "hi"})
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "internal_error"
    assert "boom" not in r.text


async def test_rate_limit() -> None:
    app = create_app(make_settings(rate_limit="2/minute"), RAGService(chain=FakeChain()))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        assert (await c.post("/api/v1/chat", json={"message": "a"})).status_code == 200
        assert (await c.post("/api/v1/chat", json={"message": "b"})).status_code == 200
        r = await c.post("/api/v1/chat", json={"message": "c"})
        assert r.status_code == 429
        assert r.json()["error"]["code"] == "rate_limited"
        assert int(r.headers["retry-after"]) >= 1
        # health is not rate limited
        assert (await c.get("/api/v1/health")).status_code == 200


async def test_payload_too_large(client: httpx.AsyncClient) -> None:
    r = await client.post(
        "/api/v1/chat", content=b"x" * (70 * 1024), headers={"content-type": "application/json"}
    )
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "payload_too_large"


async def test_payload_too_large_when_chunked(client: httpx.AsyncClient) -> None:
    async def chunks():  # no Content-Length -> chunked transfer encoding
        for _ in range(70):
            yield b"x" * 1024

    r = await client.post("/api/v1/chat", content=chunks(), headers={"content-type": "application/json"})
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "payload_too_large"


async def test_legacy_get_endpoint(client: httpx.AsyncClient) -> None:
    r = await client.post("/get", data={"msg": "What is diabetes?"})
    assert r.status_code == 200
    assert r.text == "Diabetes causes high blood sugar."
    assert r.headers["content-type"].startswith("text/plain")


async def test_cors_preflight(client: httpx.AsyncClient) -> None:
    r = await client.options(
        "/api/v1/chat/stream",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"
    r = await client.options(
        "/api/v1/chat",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in r.headers


async def test_unknown_route_uses_error_envelope(client: httpx.AsyncClient) -> None:
    r = await client.get("/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"
