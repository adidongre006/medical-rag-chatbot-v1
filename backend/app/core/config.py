"""Typed application settings, loaded from environment variables / `.env`."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration lives here. Required secrets fail fast at startup."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Required secrets -------------------------------------------------
    pinecone_api_key: SecretStr = Field(description="Pinecone API key")
    hf_token: SecretStr = Field(description="Hugging Face access token")

    # --- Optional / legacy ------------------------------------------------
    # Present in the original project but never actually used. Kept optional
    # so existing .env files do not break.
    openai_api_key: SecretStr | None = None

    # --- RAG --------------------------------------------------------------
    pinecone_index: str = "medical-chatbot"
    hf_repo_id: str = "openai/gpt-oss-120b"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    max_new_tokens: int = Field(default=512, ge=64, le=4096)
    retriever_k: int = Field(default=3, ge=1, le=10)

    # --- HTTP -------------------------------------------------------------
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    rate_limit: str = "20/minute"
    max_request_bytes: int = 64 * 1024
    log_level: str = "INFO"
    environment: str = "development"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Accept `a,b,c` as well as a JSON list."""
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                import json

                return json.loads(stripped)
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return value

    @field_validator("rate_limit")
    @classmethod
    def _validate_rate_limit(cls, value: str) -> str:
        parse_rate_limit(value)
        return value


_UNITS = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}


def parse_rate_limit(spec: str) -> tuple[int, int]:
    """Parse `"20/minute"` into `(20, 60)` -> (max requests, window seconds)."""
    try:
        count_raw, unit_raw = spec.strip().lower().split("/", 1)
        count = int(count_raw)
        unit = unit_raw.strip().rstrip("s")
        if count < 1 or unit not in _UNITS:
            raise ValueError
    except ValueError as exc:
        raise ValueError(f"Invalid RATE_LIMIT {spec!r}; expected '<count>/<second|minute|hour|day>'") from exc
    return count, _UNITS[unit]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
