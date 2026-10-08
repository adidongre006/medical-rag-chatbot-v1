from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.config import parse_rate_limit
from app.core.logging import redact
from app.core.rate_limit import RateLimiter
from app.services.rag import to_sources
from tests.conftest import make_settings


def test_parse_rate_limit() -> None:
    assert parse_rate_limit("20/minute") == (20, 60)
    assert parse_rate_limit("5/seconds") == (5, 1)
    assert parse_rate_limit("100/hour") == (100, 3600)
    for bad in ("", "x/minute", "0/minute", "5/decade", "5"):
        with pytest.raises(ValueError):
            parse_rate_limit(bad)


def test_rate_limiter_window() -> None:
    now = [0.0]
    limiter = RateLimiter("2/minute", clock=lambda: now[0])
    assert limiter.check("ip") is None
    assert limiter.check("ip") is None
    retry = limiter.check("ip")
    assert retry is not None and 1 <= retry <= 61
    assert limiter.check("other") is None  # keys are independent
    now[0] = 61.0
    assert limiter.check("ip") is None  # window slid


def test_redact_secrets() -> None:
    text = "token hf_abcdefghijklmnopqrstuv and pcsk_abc_DEF123 and Bearer abc.def-ghi"
    out = redact(text)
    assert "hf_abcdefghijklmnopqrstuv" not in out
    assert "pcsk_abc_DEF123" not in out
    assert "abc.def-ghi" not in out
    assert "Bearer [REDACTED]" in out


def test_to_sources_dedupes_and_truncates() -> None:
    doc = SimpleNamespace(page_content="a " * 500, metadata={"source": "C:\\books\\m.pdf", "page": 0})
    sources = to_sources([doc, doc])
    assert len(sources) == 1
    assert sources[0].source == "m.pdf"
    assert sources[0].page == 1
    assert len(sources[0].snippet) <= 280


def test_settings_cors_parsing_and_secrets() -> None:
    s = make_settings(cors_origins="http://a.com, http://b.com")
    assert s.cors_origins == ["http://a.com", "http://b.com"]
    assert "test-hf" not in repr(s)  # SecretStr never leaks in repr
    assert make_settings(cors_origins='["http://c.com"]').cors_origins == ["http://c.com"]


def test_settings_missing_required_fails_fast(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import Settings

    monkeypatch.delenv("PINECONE_API_KEY", raising=False)
    monkeypatch.delenv("HF_TOKEN", raising=False)
    with pytest.raises(ValueError):
        Settings(_env_file=None)  # type: ignore[call-arg]
