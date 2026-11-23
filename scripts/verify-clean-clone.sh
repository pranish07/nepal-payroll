#!/usr/bin/env bash
# Verifies that a fresh checkout installs, builds, migrates, seeds, serves the
# API + web UI, and produces payslips without any manual setup.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
PORT="${VERIFY_PORT:-3210}"
SERVER_PID=""
CLEANED=0

stop_server() {
  if [[ -n "$SERVER_PID" ]]; then
    case "$(uname -s)" in
      MINGW*|MSYS*|CYGWIN*)
        taskkill //PID "$SERVER_PID" //T //F >/dev/null 2>&1 || true
        ;;
      *)
        kill "$SERVER_PID" 2>/dev/null || true
        ;;
    esac
    SERVER_PID=""
    sleep 2
  fi
}

cleanup() {
  if [[ "$CLEANED" -eq 0 ]]; then
    stop_server
    rm -rf "$TMP" 2>/dev/null || true
    CLEANED=1
  fi
}
trap cleanup EXIT

echo "[verify] Preparing clean checkout in $TMP"
if ORIGIN="$(git -C "$ROOT" remote get-url origin 2>/dev/null)"; then
  git clone --depth 1 "$ORIGIN" "$TMP/repo" >/dev/null 2>&1
  echo "[verify] Cloned origin"
else
  mkdir -p "$TMP/repo"
  tar --exclude=node_modules --exclude=dist --exclude=data --exclude=coverage \
      --exclude=.git --exclude=.turbo -C "$ROOT" -cf - . | tar -C "$TMP/repo" -xf -
  echo "[verify] Copied working tree (no git origin configured)"
fi

START_TS=$(date +%s)
cd "$TMP/repo"
if [[ ! -f package-lock.json || ! -f package.json ]]; then
  echo "[verify] Clean checkout is missing package manifests." >&2
  exit 1
fi

echo "[verify] npm ci"
npm ci --no-audit --no-fund >/dev/null

echo "[verify] lint"
npm run lint >/dev/null
echo "[verify] typecheck"
npm run typecheck >/dev/null
echo "[verify] tests"
npm test >/dev/null
echo "[verify] web build"
npm run build >/dev/null

echo "[verify] npm start"
DB_PATH="$TMP/repo/data/verify.db" PORT="$PORT" npm start >"$TMP/server.log" 2>&1 &
SERVER_PID=$!

HEALTH=""
for attempt in $(seq 1 120); do
  if HEALTH="$(curl -fsS "http://localhost:$PORT/api/health" 2>/dev/null)"; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[verify] Server exited early:" >&2
    cat "$TMP/server.log" >&2
    exit 1
  fi
  sleep 1
done

if [[ -z "$HEALTH" ]]; then
  echo "[verify] Server did not become healthy:" >&2
  cat "$TMP/server.log" >&2
  exit 1
fi

ELAPSED=$(( $(date +%s) - START_TS ))
echo "[verify] health: $HEALTH"

WEB_HTML="$(curl -fsS "http://localhost:$PORT/")"
[[ "$WEB_HTML" == *'id="root"'* ]] || { echo "[verify] Web HTML missing root element" >&2; exit 1; }

RUN_JSON="$(curl -fsS -X POST -H 'X-Role: admin' "http://localhost:$PORT/api/periods/p-2083-01/run")"
RUN_ID="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).id)' "$RUN_JSON")"
FINAL_JSON="$(curl -fsS -X POST -H 'X-Role: admin' "http://localhost:$PORT/api/runs/$RUN_ID/finalize")"
PAYSLIP_ID="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).payslips[0].id)' "$FINAL_JSON")"
HTML="$(curl -fsS "http://localhost:$PORT/api/payslips/$PAYSLIP_ID/html")"
[[ "$HTML" == *'payslip'* ]] || { echo "[verify] Payslip HTML looks wrong" >&2; exit 1; }

FORBIDDEN="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/admin/runs/$RUN_ID/cost-view")"
[[ "$FORBIDDEN" == "403" ]] || { echo "[verify] Admin cost view was not protected: $FORBIDDEN" >&2; exit 1; }

ARTIFACTS="$(find "$TMP/repo/samples" -maxdepth 1 -type f | wc -l | tr -d ' ')"
echo "[verify] samples artifacts: $ARTIFACTS"
echo "[verify] CLEAN_CLONE_SECONDS=$ELAPSED"
stop_server
rm -rf "$TMP" 2>/dev/null || true
CLEANED=1
echo "[verify] OK"
