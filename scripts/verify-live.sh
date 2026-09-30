#!/usr/bin/env bash
set -u

# Live smoke test against a deployed API (e.g. Render). Tiny cost:
#   - 40 bad-body requests are rejected before OpenAI (free).
#   - The same recipe request is sent N times (default 2, count=1 recipe). Only the
#     first should reach OpenAI; the rest should be cache hits. The script refuses
#     to send more than 10 requests that could reach OpenAI.
# Creates a throwaway anonymous user and deletes it at the end. Prints only HTTP
# codes, counts and timings — never keys, tokens, or user IDs.
#
# Usage: scripts/verify-live.sh https://your-api.onrender.com [repeats 2-10]

cd "$(dirname "$0")/.." || exit 1

MAX_OPENAI_REQUESTS=10
BASE="${1:-}"
REPEATS="${2:-2}"
BASE="${BASE%/}"

if [[ ! "$BASE" =~ ^https?://[^[:space:]]+$ ]]; then
  echo "Usage: scripts/verify-live.sh https://your-api.onrender.com [repeats 2-10]" >&2
  echo "RESULT: FAILED (could not run)"
  exit 1
fi
if [[ ! "$REPEATS" =~ ^[0-9]+$ ]] || (( REPEATS < 2 )); then
  echo "repeats must be a whole number of at least 2." >&2
  echo "RESULT: FAILED (could not run)"
  exit 1
fi
if (( REPEATS > MAX_OPENAI_REQUESTS )); then
  echo "Refusing: $REPEATS recipe requests could each reach OpenAI; the limit is $MAX_OPENAI_REQUESTS." >&2
  echo "RESULT: FAILED (could not run)"
  exit 1
fi

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local in the project root." >&2
  echo "RESULT: FAILED (could not run)"
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env.local
set +a

URL="${VITE_SUPABASE_URL:-}"
ANON_KEY="${VITE_SUPABASE_ANON_KEY:-}"
if [[ -z "$URL" || -z "$ANON_KEY" ]]; then
  echo "VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set in .env.local." >&2
  echo "RESULT: FAILED (could not run)"
  exit 1
fi

TOKEN=""
USER_ID=""
FAILURES=0
CHECKS_RAN=0
OPENAI_REQUESTS_SENT=0
SIGNUP_CODE=""
SIGNUP_REASON=""
TMP=$(mktemp -d)
chmod 700 "$TMP"

cleanup() {
  if [[ -n "$TOKEN" ]]; then
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -X POST "$URL/rest/v1/rpc/delete_own_account" -d '{}')
    echo "cleanup delete_own_account HTTP $code (expect 204)"
  fi
  TOKEN=""
  rm -rf "$TMP"
  unset ANON_KEY
  if [[ "$CHECKS_RAN" -eq 0 ]]; then
    echo "RESULT: FAILED (could not run)"
    exit 1
  elif [[ "$FAILURES" -eq 0 ]]; then
    echo "RESULT: all checks passed"
  else
    echo "RESULT: $FAILURES check(s) FAILED"
    exit 1
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

pass() { CHECKS_RAN=$((CHECKS_RAN + 1)); echo "PASS $*"; }
fail() { CHECKS_RAN=$((CHECKS_RAN + 1)); FAILURES=$((FAILURES + 1)); echo "FAIL $*"; }

# Same approach as test-pro-lockdown.sh: parse the sign-up response in THIS shell
# (never inside $( )), or the token is lost.
signup() {
  local resp body
  resp=$(curl -s -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
    -w $'\n%{http_code}' -X POST "$URL/auth/v1/signup" -d '{}')
  SIGNUP_CODE="${resp##*$'\n'}"
  body="${resp%$'\n'*}"
  unset resp
  TOKEN=$(printf '%s' "$body" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("access_token") or "")
except Exception: print("")')
  USER_ID=$(printf '%s' "$body" | python3 -c 'import sys,json
try: print((json.load(sys.stdin).get("user") or {}).get("id") or "")
except Exception: print("")')
  SIGNUP_REASON=$(printf '%s' "$body" | python3 -c '
import sys, json
try:
    r = json.load(sys.stdin)
except Exception:
    print("response was not JSON"); sys.exit()
if not isinstance(r, dict):
    print("response was not a JSON object"); sys.exit()
parts = [f"{k}={str(r[k])[:200]}" for k in ("error_code", "msg", "error_description") if r.get(k)]
if not parts and not r.get("access_token"):
    parts = ["missing access_token"]
print("; ".join(parts))
')
  unset body
}

# The token goes in a private file so it never appears on a command line.
AUTH_HEADER_FILE="$TMP/auth-header"

# api_post PATH BODY [extra curl args...] → prints "<code> <seconds>"
api_post() {
  local path="$1" body="$2"
  shift 2
  curl -s -o /dev/null -w "%{http_code} %{time_total}" --max-time 90 \
    -H "@$AUTH_HEADER_FILE" -H "Content-Type: application/json" \
    "$@" -X POST "$BASE$path" -d "$body"
}

explain_code() {
  case "$1" in
    400) echo "rejected for a bad body before OpenAI" ;;
    401) echo "login rejected (is the server using the same Supabase project as .env.local?)" ;;
    402) echo "free scans used up" ;;
    429) echo "rate limited" ;;
    500) echo "server error (often OPENAI_API_KEY missing on the server)" ;;
    503) echo "busy or can't check free scans (SUPABASE_SERVICE_ROLE_KEY missing on the server, or migration 007 not run)" ;;
    000) echo "no response (timeout or network)" ;;
    *) echo "unexpected" ;;
  esac
}

echo "Target: $BASE"

# ── 1. Throwaway anonymous user ──────────────────────────────────────────────
signup
echo "signup HTTP $SIGNUP_CODE (expect 200)"
if [[ -z "$TOKEN" || -z "$USER_ID" ]]; then
  echo "Anonymous sign-up failed (HTTP $SIGNUP_CODE${SIGNUP_REASON:+: $SIGNUP_REASON}); nothing to test." >&2
  exit 1
fi
( umask 077; printf 'Authorization: Bearer %s\n' "$TOKEN" > "$AUTH_HEADER_FILE" )

# ── 2. Warm up (free-plan servers sleep; the first request can take ~1 minute) ─
echo
echo "Warming up the server (GET, no login, never reaches OpenAI)…"
AWAKE=0
for attempt in 1 2 3 4 5 6; do
  read -r CODE SECS < <(curl -s -o /dev/null -w "%{http_code} %{time_total}" --max-time 90 "$BASE/api/cook-recipes")
  echo "  attempt $attempt: HTTP $CODE after ${SECS}s"
  if [[ "$CODE" =~ ^[234][0-9][0-9]$ ]]; then
    AWAKE=1
    break
  fi
  sleep 5
done
if [[ "$AWAKE" -eq 1 ]]; then
  pass "server is awake (expect any 2xx–4xx answer; 404 is normal for GET)"
else
  fail "server did not wake up"
  exit 1
fi

# ── 3. 40 bad-body requests at once (rejected before OpenAI) ─────────────────
echo
echo "Sending 40 requests at once with an empty ingredient list…"
for i in $(seq 1 40); do
  curl -s -o /dev/null -D "$TMP/h$i" -w "%{http_code}" --max-time 60 \
    -H "@$AUTH_HEADER_FILE" -H "Content-Type: application/json" \
    -X POST "$BASE/api/cook-recipes" -d '{"ingredients":[]}' > "$TMP/c$i" &
done
wait

N400=0; N429=0; N429_RETRY=0; OTHER=""
for i in $(seq 1 40); do
  c=$(cat "$TMP/c$i" 2>/dev/null || echo 000)
  case "$c" in
    400) N400=$((N400 + 1)) ;;
    429)
      N429=$((N429 + 1))
      grep -qi '^retry-after:' "$TMP/h$i" && N429_RETRY=$((N429_RETRY + 1))
      ;;
    *) OTHER="$OTHER $c" ;;
  esac
done
echo "  400 (bad body, rejected before OpenAI): $N400"
echo "  429 (rate limited):                     $N429   (with Retry-After: $N429_RETRY)"
echo "  Default limits are 10 per user and 30 per IP, so expect about 10 × 400 and 30 × 429."
if [[ -n "$OTHER" ]]; then
  for c in $(printf '%s\n' $OTHER | sort | uniq); do
    n=$(printf '%s\n' $OTHER | grep -c "^$c$")
    echo "  $c × $n: $(explain_code "$c")"
  done
fi
if [[ -z "$OTHER" && "$N400" -ge 1 && "$N429" -ge 1 && "$N429_RETRY" -eq "$N429" ]]; then
  pass "burst: $N400 × 400 and $N429 × 429, every 429 has Retry-After, nothing else"
else
  fail "burst: expected only 400s and 429s (with Retry-After) — see above"
fi

# ── 4. Same recipe request N times: first should miss, the rest hit ──────────
WAIT=$(( REPEATS * 4 + 4 ))
echo
echo "Waiting ${WAIT}s for the rate-limit buckets to refill…"
sleep "$WAIT"

PANTRY=(eggs spinach tomato rice chicken onion garlic pasta cheese beans carrot potato)
PICK=()
while (( ${#PICK[@]} < 3 )); do
  item="${PANTRY[RANDOM % ${#PANTRY[@]}]}"
  [[ " ${PICK[*]:-} " == *" $item "* ]] || PICK+=("$item")
done
RECIPE_BODY=$(printf '{"ingredients":["%s","%s","%s"],"dietaryPreference":"None","maxCookTime":"any","count":1}' "${PICK[@]}")
echo "Recipe request (count=1): ${PICK[*]}  — sent $REPEATS times"
echo "(A free account gets 3 free Cook scans, and cache hits count, so request 4+ should be 402.)"

CODES=()
TIMES=()
for n in $(seq 1 "$REPEATS"); do
  OPENAI_REQUESTS_SENT=$((OPENAI_REQUESTS_SENT + 1))
  if (( OPENAI_REQUESTS_SENT > MAX_OPENAI_REQUESTS )); then
    fail "safety stop: would exceed $MAX_OPENAI_REQUESTS OpenAI-capable requests"
    exit 1
  fi
  read -r CODE SECS < <(api_post /api/cook-recipes "$RECIPE_BODY")
  CODES+=("$CODE")
  TIMES+=("$SECS")
  label="hit expected"
  [[ "$n" -eq 1 ]] && label="miss expected"
  echo "  request $n: HTTP $CODE in ${SECS}s ($label)$([[ "$CODE" != 200 ]] && echo " — $(explain_code "$CODE")")"
done

FIRST="${TIMES[0]}"
SECOND="${TIMES[1]}"
if [[ "${CODES[0]}" == 200 && "${CODES[1]}" == 200 ]]; then
  if python3 -c "import sys; sys.exit(0 if float('$SECOND') < float('$FIRST') else 1)"; then
    SPEEDUP=$(python3 -c "print(f'{float(\"$FIRST\") / max(float(\"$SECOND\"), 0.001):.1f}')")
    pass "cache: first (miss) ${FIRST}s, second (hit) ${SECOND}s — ${SPEEDUP}× faster"
    if python3 -c "import sys; sys.exit(0 if float('$FIRST') < 1.0 else 1)"; then
      echo "  note: the first request was already fast; it may have been cached by an earlier run."
    fi
  else
    fail "cache: second request (${SECOND}s) was not faster than the first (${FIRST}s)"
  fi
else
  fail "cache: first two recipe requests returned ${CODES[0]} and ${CODES[1]} (expected 200 and 200)"
fi

if (( REPEATS >= 4 )); then
  if [[ "${CODES[3]}" == 402 ]]; then
    pass "free-scan quota: request 4 returned 402"
  else
    fail "free-scan quota: request 4 returned ${CODES[3]} (expected 402)"
  fi
fi

echo "Requests that could reach OpenAI: $OPENAI_REQUESTS_SENT (limit $MAX_OPENAI_REQUESTS; with the cache, only the first should)."
