#!/usr/bin/env bash
# One-command verification of the whole project.
#   ./verify.sh            # backend + frontend (skips e2e)
#   ./verify.sh --e2e      # also run Playwright
#   ./verify.sh backend    # only the backend gates
#   ./verify.sh frontend   # only the frontend gates
#
# Writes verify-report.txt (secrets are never printed). If anything fails,
# paste the report back and the failing step's output will be right there.
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
REPORT="$ROOT/verify-report.txt"
E2E=0; SCOPE="all"
for arg in "$@"; do
  case "$arg" in
    --e2e) E2E=1 ;;
    backend|frontend) SCOPE="$arg" ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

: > "$REPORT"
declare -a RESULTS=()
FAILED=0

log() { printf '%s\n' "$*" | tee -a "$REPORT"; }

# step <name> <dir> <command...>
step() {
  local name="$1" dir="$2"; shift 2
  log ""; log "=== $name ==="
  local out status
  out="$(cd "$dir" && "$@" 2>&1)"; status=$?
  if [ $status -eq 0 ]; then
    RESULTS+=("PASS  $name")
    log "(passed)"
    # keep the tail of successful steps short (coverage tables are handy)
    printf '%s\n' "$out" | tail -n 8 >> "$REPORT"
  else
    RESULTS+=("FAIL  $name")
    FAILED=1
    log "(FAILED, exit $status)"
    printf '%s\n' "$out" | tail -n 60 | tee -a "$REPORT"
  fi
}

log "Medical chatbot verification - $(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "python: $(python3 --version 2>&1)   node: $(node --version 2>&1)   npm: $(npm --version 2>&1)"

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "backend" ]; then
  BACK="$ROOT/backend"
  if [ ! -d "$BACK/.venv" ]; then
    step "backend: create venv" "$BACK" python3 -m venv .venv
  fi
  PY="$BACK/.venv/bin/python"; [ -x "$PY" ] || PY="$BACK/.venv/Scripts/python.exe"
  step "backend: install deps" "$BACK" "$PY" -m pip install -q -r requirements-dev.txt
  step "backend: ruff check"   "$BACK" "$PY" -m ruff check .
  step "backend: ruff format"  "$BACK" "$PY" -m ruff format --check .
  step "backend: mypy"         "$BACK" "$PY" -m mypy
  step "backend: pytest (+coverage >= 85%)" "$BACK" "$PY" -m pytest
fi

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "frontend" ]; then
  FRONT="$ROOT/frontend"
  step "frontend: npm install"  "$FRONT" npm install --no-audit --no-fund
  step "frontend: typecheck"    "$FRONT" npm run typecheck
  step "frontend: eslint"       "$FRONT" npm run lint
  step "frontend: vitest"       "$FRONT" npm test
  step "frontend: next build"   "$FRONT" env NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 npm run build
  if [ $E2E -eq 1 ]; then
    step "frontend: playwright install" "$FRONT" npx playwright install chromium
    step "frontend: playwright e2e"     "$FRONT" npm run e2e
  fi
fi

log ""; log "================ SUMMARY ================"
for r in "${RESULTS[@]}"; do log "$r"; done
if [ $FAILED -eq 0 ]; then log "ALL GATES PASSED"; else log "SOME GATES FAILED - see $REPORT"; fi
exit $FAILED
