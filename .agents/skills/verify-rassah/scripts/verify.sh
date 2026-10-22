#!/usr/bin/env bash
# verify-rassah control script. Usage:
#   verify.sh local   - build, start `next start` (DATA_BACKEND=memory) on a free port, drive, stop
#   verify.sh prod    - read-only GET smoke against BASE_URL (default https://rassah.vercel.app)
#   verify.sh --help
# Exit 0 only if every check passes. Evidence: artifacts/verify/rassah/<timestamp>/
set -u
MODE="${1:-}"
case "$MODE" in local|prod) ;; *) sed -n '2,6p' "$0"; [ "$MODE" = "--help" ] && exit 0; exit 2;; esac

# Physical path, so the root is the same whether this runs via .agents/ or the .claude/ symlink.
ROOT="$(cd -P "$(dirname "$0")/../../../.." && pwd)"
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
  if [ "$method" = POST ] || [ "$method" = PATCH ]; then
    code=$(curl -s -o "$f" -w '%{http_code}' --max-time 60 -X "$method" -H 'content-type: application/json' -d "$body" "$BASE$path")
  elif [ "$method" = DELETE ]; then
    code=$(curl -s -o "$f" -w '%{http_code}' --max-time 60 -X DELETE "$BASE$path")
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

# expect_body NAME FILE-FROM-LAST-CALL TEXT: the saved body contains TEXT (fixed string)
expect_body() {
  local name="$1" file="$OUT/$(echo "$2" | tr -c 'A-Za-z0-9\n' _).body"
  grep -qF -- "$3" "$file" && pass "$name" || fail "$name: \"$3\" not in $file"
}

# json_field FILE-FROM-LAST-CALL JS-EXPRESSION: print a value from a saved JSON body (empty on error)
json_field() {
  node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=eval(process.argv[2]);console.log(v??"")' \
    "$OUT/$(echo "$1" | tr -c 'A-Za-z0-9\n' _).body" "$2" 2>/dev/null
}

REPO_LINK='href="https://github.com/justAbdulaziz10/Rassah" target="_blank"'

# footer_checks: every page family carries the footer link to the repo (features/site-footer.md)
footer_checks() {
  expect_body "footer repo link on /" landing "$REPO_LINK"
  expect_body "footer repo link on /orders" orders "$REPO_LINK"
  expect_body "footer repo link on /store" store "$REPO_LINK"
}

if [ "$MODE" = local ]; then
  PORT=$(node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})')
  BASE="http://127.0.0.1:$PORT"
  echo "== build (DATA_BACKEND=memory)"
  DATA_BACKEND=memory DEMO_MODE=true GEMINI_API_KEY= npm run build >"$OUT/build.log" 2>&1 || { echo "FAIL build (see $OUT/build.log)"; tail -20 "$OUT/build.log"; exit 1; }
  pass "npm run build"
  echo "== start on $BASE"
  # Blank Gemini key: nothing paid is called; facts come from data/ground_truth.json (origin "seeded").
  DATA_BACKEND=memory DEMO_MODE=true GEMINI_API_KEY= npx next start -H 127.0.0.1 -p "$PORT" >"$OUT/server.log" 2>&1 &
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
  expect_status landing GET / 200
  expect_status orders GET /orders 200
  expect_status store GET /store 200
  footer_checks
  expect_status order-1001 GET /orders/1001 200
  expect_status order-1021-unknown GET /orders/1021 404

  echo "== packing (features/packing.md)"
  expect_status pack-1001 POST /api/orders/1001/pack 200 '{}'
  expect_json "pack 1001: one book in the FLAT carton" pack-1001 'j.status==="box_found"&&j.carton.id==="FLAT"'
  expect_status pack-1002 POST /api/orders/1002/pack 200 '{}'
  expect_json "pack 1002: perfume p-16 sized by estimate, order packed" pack-1002 'j.status==="box_found"&&j.lines.find(l=>l.productId==="p-16").dimsSource==="inferred"'
  expect_status pack-1017 POST /api/orders/1017/pack 200 '{}'
  expect_json "pack 1017: asks to measure p-29 and p-30" pack-1017 'j.status==="needs_measurement"&&j.productsToMeasure.map(p=>p.productId).sort().join()==="p-29,p-30"'
  expect_status pack-1020 POST /api/orders/1020/pack 200 '{}'
  expect_json "pack 1020: no single carton, split into several" pack-1020 'j.status==="no_box"&&j.split.boxes.length>=2'
  RUN_1001=$(json_field pack-1001 'j.runId')
  expect_status trace-1001 GET "/api/runs/$RUN_1001/trace" 200
  expect_json "trace of the 1001 run names its carton" trace-1001 'j.run.orderId==="1001"&&j.run.cartonId==="FLAT"'

  echo "== confirm and correct (features/corrections.md)"
  expect_status confirm-1001 POST "/api/runs/$RUN_1001/action" 200 '{"action":"confirm"}'
  expect_json "confirm 1001 recorded" confirm-1001 'j.action==="confirmed"'
  RUN_1002=$(json_field pack-1002 'j.runId')
  OLD_H=$(json_field pack-1002 'j.items.find(i=>i.productId==="p-16").facts.heightCm')
  NEW_H=$((OLD_H + 2))
  expect_status correct-1002 POST "/api/runs/$RUN_1002/action" 200 "{\"action\":\"edit\",\"productId\":\"p-16\",\"changes\":{\"heightCm\":$NEW_H}}"
  expect_json "correction recorded for p-16 height" correct-1002 "j.action===\"edited\"&&j.corrections[0].field===\"height_cm\"&&j.corrections[0].newValue===\"$NEW_H\""
  expect_status repack-1002 POST /api/orders/1002/pack 200 '{}'
  expect_json "repack 1002 uses the corrected height (origin manual)" repack-1002 "const f=j.items.find(i=>i.productId===\"p-16\").facts;f.heightCm===$NEW_H&&f.origin===\"manual\""

  echo "== measure the products 1017 asks for (features/corrections.md)"
  expect_status measure-partial PATCH /api/products/p-29/facts 400 '{"changes":{"lengthCm":20}}'
  expect_status measure-p-29 PATCH /api/products/p-29/facts 200 '{"changes":{"lengthCm":20,"widthCm":15,"heightCm":10,"weightG":500}}'
  expect_json "p-29 measured by hand (origin manual)" measure-p-29 'j.facts.dimsSource==="manual"&&j.facts.origin==="manual"&&j.corrections.length===4'
  expect_status measure-p-30 PATCH /api/products/p-30/facts 200 '{"changes":{"lengthCm":12,"widthCm":8,"heightCm":5,"weightG":200}}'
  expect_status repack-1017 POST /api/orders/1017/pack 200 '{}'
  expect_json "repack 1017 packs with the measured sizes" repack-1017 'j.status==="box_found"&&["p-29","p-30"].every(p=>j.items.find(i=>i.productId===p).facts.origin==="manual")'

  echo "== store checkout (features/store-checkout.md)"
  expect_status checkout POST /api/store/checkout 201 '{"customerName":"تحقق رصّة","items":[{"productId":"p-16","qty":1},{"productId":"p-17","qty":1}]}'
  expect_json "checkout returns a store order number (5001+)" checkout 'Number(j.orderId)>=5001'
  STORE_ID=$(json_field checkout 'j.orderId')
  expect_status queue GET /api/orders/queue 200
  expect_json "store order $STORE_ID is new in the packer queue" queue "j.newOrderIds.includes(\"$STORE_ID\")"
  expect_status pack-store POST "/api/orders/$STORE_ID/pack" 200 '{}'
  expect_json "store order $STORE_ID packs" pack-store 'j.status==="box_found"&&j.orderSource!==undefined'
  expect_status store-placed GET "/store/order/$STORE_ID" 200
  expect_body "confirmation page thanks the customer" store-placed "تحقق رصّة"
  expect_body "confirmation page links to packing the order" store-placed "href=\"/orders/$STORE_ID\""
  expect_status checkout-no-name POST /api/store/checkout 400 '{"customerName":"","items":[{"productId":"p-16","qty":1}]}'

  echo "== monitoring and notifications (features/monitoring.md)"
  expect_status metrics GET /api/monitoring/metrics 200
  expect_status monitoring GET /monitoring 200
  expect_status notifications GET /notifications 200
  expect_status catalog GET /catalog 200
  expect_status evaluation GET /evaluation 200

  echo "== catalog demo controls (features/monitoring.md); blank Gemini key, so nothing paid is called"
  expect_status extract-p-01 POST /api/products/p-01/extract 200
  expect_json "re-read p-01 records an admin extraction (config_error without a key)" extract-p-01 'j.events.length===1&&j.events[0].trigger==="admin"&&j.events[0].status==="config_error"'
  expect_status clear-p-02 DELETE /api/products/p-02/facts 200
  expect_json "p-02 facts cleared" clear-p-02 'j.cleared==="p-02"'
  expect_status repack-1001-cleared POST /api/orders/1001/pack 200 '{}'
  expect_json "1001 now needs p-02 measured (its facts are gone, no key to re-read)" repack-1001-cleared 'j.status==="needs_measurement"&&j.productsToMeasure.map(p=>p.productId).join()==="p-02"'
else
  BASE="${BASE_URL:-https://rassah.vercel.app}"
  echo "== production read-only smoke against $BASE (GET only, no packs)"
  expect_status health GET /api/health 200
  expect_json "health status ok" health 'j.status==="ok"'
  expect_status landing GET / 200
  expect_status orders GET /orders 200
  expect_status store GET /store 200
  footer_checks
  expect_status order-1001 GET /orders/1001 200
  expect_status order-1021-unknown GET /orders/1021 404
  expect_status queue GET /api/orders/queue 200
  expect_json "queue answers with counts" queue 'typeof j.counts.total==="number"'
  expect_status monitoring GET /monitoring 200
  expect_status notifications GET /notifications 200
  expect_status catalog GET /catalog 200
  expect_status evaluation GET /evaluation 200
fi

echo "evidence: $OUT"
[ "$FAIL" = 0 ] && echo "RESULT ok" || echo "RESULT FAILED"
exit "$FAIL"
