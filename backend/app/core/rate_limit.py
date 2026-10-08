"""Small in-process sliding-window rate limiter exposed as a FastAPI dependency.

NOTE: state is per process. With several workers/instances each one enforces
the limit independently; put an API gateway / WAF / Redis limiter in front for
a strict global limit (see guide.md, "Production readiness").
"""

from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable

from fastapi import HTTPException, Request

from app.core.config import parse_rate_limit


class RateLimiter:
    def __init__(self, spec: str, *, clock: Callable[[], float] = time.monotonic) -> None:
        self.limit, self.window = parse_rate_limit(spec)
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}

    def check(self, key: str) -> int | None:
        """Record a hit. Return `None` if allowed, else seconds until retry."""
        now = self._clock()
        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] >= self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return max(1, int(self.window - (now - hits[0])) + 1)
        hits.append(now)
        # opportunistic cleanup so the dict cannot grow without bound
        if len(self._hits) > 10_000:
            for stale in [k for k, v in self._hits.items() if not v or now - v[-1] >= self.window]:
                del self._hits[stale]
        return None


def client_key(request: Request) -> str:
    # Behind a trusted proxy/ALB, run uvicorn with --proxy-headers and
    # --forwarded-allow-ips so request.client reflects the real client IP.
    return request.client.host if request.client else "unknown"


async def enforce_rate_limit(request: Request) -> None:
    limiter: RateLimiter = request.app.state.limiter
    retry_after = limiter.check(client_key(request))
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please slow down and try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )
