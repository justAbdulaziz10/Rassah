#!/usr/bin/env bash
# verify-rassah control script. Usage:
#   verify.sh local   - build, start `next start` (DATA_BACKEND=memory) on a free port, drive, stop
#   verify.sh prod    - read-only GET smoke against BASE_URL (default https://rassah.vercel.app)
#   verify.sh --help
# Exit 0 only if every check passes. Evidence: artifacts/verify/rassah/<timestamp>/
set -u
MODE="${1:-}"
case "$MODE" in local|prod) ;; *) sed -n '2,6p' "$0"; [ "$MODE" = "--help" ] && exit 0; exit 2;; esac

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT" || exit 2
OUT="$ROOT/artifacts/verify/rassah/$(date +%Y%m%dT%H%M%S)-$MODE"
mkdir -p "$OUT"
FAIL=0
SERVER_PID=""

cleanup() {
  # Stop only the server this run started, by PID (and its children).
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    pkill -P "$SERVER_PID" 2>/dev/null; kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
    echo "stopped server pid $SERVER_PID"
  fi
}
trap cleanup EXIT INT TERM

pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAIL=1; }

# expect_status NAME METHOD PATH EXPECTED [BODY]
expect_status() {
  local name="$1" method="$2" path="$3" want="$4" body="${5:-}" f="$OUT/$(echo "$1" | tr -c 'A-Za-z0-9\n' _).body" code
  if [ "$method" = POST ]; then
    code=$(curl -s -o "$f" -w '%{http_code}' --max-time 60 -X POST -H 'content-type: application/json' -d "$body" "$BASE$path")
  else
    code=$(curl -s -o "$f" -w '%{http_code}' --max-time 60 "$BASE$path")
  fi
  [ "$code" = "$want" ] && pass "$name ($method $path -> $code)" || fail "$name ($method $path -> $code, want $want)"
}

# expect_json NAME FILE-FROM-LAST-CALL JS-EXPRESSION (node, `j` = parsed body)
expect_json() {
  local name="$1" file="$OUT/$(echo "$2" | tr -c 'A-Za-z0-9\n' _).body" expr="$3"
  if node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(eval(process.argv[2])?0:1)' "$file" "$expr" 2>/dev/null; then
    pass "$name"; else fail "$name: $(head -c 300 "$file")"; fi
}

if [ "$MODE" = local ]; then
  PORT=$(node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})')
  BASE="http://127.0.0.1:$PORT"
  echo "== build (DATA_BACKEND=memory)"
  DATA_BACKEND=memory npm run build >"$OUT/build.log" 2>&1 || { echo "FAIL build (see $OUT/build.log)"; tail -20 "$OUT/build.log"; exit 1; }
  pass "npm run build"
  echo "== start on $BASE"
  DATA_BACKEND=memory npx next start -H 127.0.0.1 -p "$PORT" >"$OUT/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    curl -s -o /dev/null --max-time 2 "$BASE/api/health" && break
    kill -0 "$SERVER_PID" 2>/dev/null || { echo "FAIL server died"; tail -20 "$OUT/server.log"; exit 1; }
    sleep 1
  done
  # Doctor: the port must answer from our PID.
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | grep -q . || { echo "FAIL doctor: nothing listening on $PORT"; exit 1; }
  pass "doctor: server up on $PORT (pid $SERVER_PID)"

  expect_status health GET /api/health 200
  # Memory backend is offline by design, so health reports "degraded" (offline_memory_backend); app/database must be ok.
  expect_json "health app ok, memory backend, database ok" health 'j.app==="ok"&&j.backend==="memory"&&j.database==="ok"&&["ok","degraded"].includes(j.status)'
  expect_status orders GET /orders 200
  expect_status order-1001 GET /orders/1001 200
  expect_status order-9999-unknown GET /orders/9999 404
  expect_status pack-1001 POST /api/orders/1001/pack 200 '{}'
  expect_json "pack 1001 returns a carton" pack-1001 'JSON.stringify(j).includes("carton")&&!JSON.stringify(j).includes("no_box")'
  expect_status pack-1020 POST /api/orders/1020/pack 200 '{}'
  expect_json "pack 1020 is no_box" pack-1020 'JSON.stringify(j).includes("no_box")'
  expect_status monitoring GET /monitoring 200
  expect_status evaluation GET /evaluation 200
else
  BASE="${BASE_URL:-https://rassah.vercel.app}"
  echo "== production read-only smoke against $BASE (GET only, no packs)"
  expect_status health GET /api/health 200
  expect_json "health status ok" health 'j.status==="ok"'
  expect_status orders GET /orders 200
  expect_status order-1001 GET /orders/1001 200
  expect_status order-9999-unknown GET /orders/9999 404
  expect_status monitoring GET /monitoring 200
  expect_status evaluation GET /evaluation 200
fi

echo "evidence: $OUT"
[ "$FAIL" = 0 ] && echo "RESULT ok" || echo "RESULT FAILED"
exit "$FAIL"
