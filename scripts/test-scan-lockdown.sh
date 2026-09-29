#!/usr/bin/env bash
set -u

# Stage 4 check for supabase/migrations/007_scan_usage.sql.
# Creates a throwaway anonymous user and checks that it cannot write scan_usage,
# cannot call record_scan_usage, and can read only its own rows. Deletes the user
# at the end. Prints only HTTP codes and expected results — never keys, tokens,
# or user IDs.
#
# If SUPABASE_SERVICE_ROLE_KEY is set, a second throwaway user is created and both
# get one server-recorded Cook scan, so the "own rows only" check sees real data.

cd "$(dirname "$0")/.." || exit 1

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local in the project root." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env.local
set +a

URL="${VITE_SUPABASE_URL:-}"
ANON_KEY="${VITE_SUPABASE_ANON_KEY:-}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
if [[ -z "$URL" || -z "$ANON_KEY" ]]; then
  echo "VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set in .env.local." >&2
  exit 1
fi

TOKEN=""
USER_ID=""
OTHER_TOKEN=""
OTHER_ID=""
FAILURES=0
CHECKS_RAN=0
SIGNUP_CODE=""
SIGNUP_REASON=""

delete_user() {
  local label="$1" token="$2" code
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
    -X POST "$URL/rest/v1/rpc/delete_own_account" -d '{}')
  echo "cleanup $label delete_own_account HTTP $code (expect 204)"
}

cleanup() {
  [[ -n "$TOKEN" ]] && delete_user "test user" "$TOKEN"
  [[ -n "$OTHER_TOKEN" ]] && delete_user "second user" "$OTHER_TOKEN"
  TOKEN=""
  OTHER_TOKEN=""
  unset ANON_KEY SERVICE_KEY
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

anon_curl() {
  curl -s -H "apikey: $ANON_KEY" -H "Content-Type: application/json" "$@"
}

user_curl() {
  curl -s -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$@"
}

service_curl() {
  if [[ "$SERVICE_KEY" == sb_* ]]; then
    curl -s -H "apikey: $SERVICE_KEY" -H "Content-Type: application/json" "$@"
  else
    curl -s -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" "$@"
  fi
}

# expect LABEL CODE ALLOWED_CODES... → prints PASS/FAIL for one HTTP code.
expect() {
  local label="$1" code="$2"
  shift 2
  local ok
  CHECKS_RAN=$((CHECKS_RAN + 1))
  for ok in "$@"; do
    if [[ "$code" == "$ok" ]]; then
      echo "PASS $label HTTP $code (expect $*)"
      return
    fi
  done
  echo "FAIL $label HTTP $code (expect $*)"
  FAILURES=$((FAILURES + 1))
}

# signup TOKEN_VAR ID_VAR → creates an anonymous user and sets SIGNUP_CODE and
# SIGNUP_REASON. Must be called directly, not inside $( ): a subshell would drop
# the token and ID it sets.
signup() {
  local resp body tok id
  resp=$(anon_curl -w $'\n%{http_code}' -X POST "$URL/auth/v1/signup" -d '{}')
  SIGNUP_CODE="${resp##*$'\n'}"
  body="${resp%$'\n'*}"
  unset resp
  tok=$(printf '%s' "$body" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("access_token") or "")
except Exception: print("")')
  id=$(printf '%s' "$body" | python3 -c 'import sys,json
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
if not parts:
    missing = [k for k in ("access_token", "user.id") if not (r.get(k) if k == "access_token" else (r.get("user") or {}).get("id"))]
    parts = ["missing " + ", ".join(missing)] if missing else []
print("; ".join(parts))
')
  unset body
  printf -v "$1" '%s' "$tok"
  printf -v "$2" '%s' "$id"
}

# read_own EXPECTED_ROWS → reads scan_usage as the test user; checks the row count
# and that every row belongs to the test user.
read_own() {
  local expected="$1" resp code body summary
  resp=$(user_curl -w $'\n%{http_code}' "$URL/rest/v1/scan_usage?select=user_id,kind,used")
  code="${resp##*$'\n'}"
  body="${resp%$'\n'*}"
  expect "read own scan_usage" "$code" 200
  summary=$(printf '%s' "$body" | ME="$USER_ID" python3 -c '
import os, sys, json
try:
    rows = json.load(sys.stdin)
except Exception:
    rows = None
if not isinstance(rows, list):
    print("bad")
else:
    me = os.environ["ME"]
    own = all(isinstance(r, dict) and r.get("user_id") == me for r in rows)
    print(f"{len(rows)} {own}")
')
  if [[ "$summary" == "$expected True" ]]; then
    echo "PASS read returned $expected row(s), all the test user's own (expect $expected, all own)"
  else
    echo "FAIL read returned [$summary] as 'rows all_own' (expect $expected, all own)"
    FAILURES=$((FAILURES + 1))
  fi
}

# ── Throwaway anonymous user ─────────────────────────────────────────────────
signup TOKEN USER_ID
echo "signup HTTP $SIGNUP_CODE (expect 200)"
if [[ -z "$TOKEN" || -z "$USER_ID" ]]; then
  echo "Anonymous sign-up failed (HTTP $SIGNUP_CODE${SIGNUP_REASON:+: $SIGNUP_REASON}); nothing to test." >&2
  exit 1
fi

# ── 1. Cannot insert, update, or delete scan_usage ───────────────────────────
CODE=$(user_curl -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/scan_usage" \
  -d "{\"user_id\":\"$USER_ID\",\"kind\":\"cook\",\"used\":0}")
expect "1a insert own row" "$CODE" 401 403

CODE=$(user_curl -o /dev/null -w "%{http_code}" -X PATCH "$URL/rest/v1/scan_usage?user_id=eq.$USER_ID" \
  -d '{"used":0}')
expect "1b update own rows" "$CODE" 401 403

CODE=$(user_curl -o /dev/null -w "%{http_code}" -X DELETE "$URL/rest/v1/scan_usage?user_id=eq.$USER_ID")
expect "1c delete own rows" "$CODE" 401 403

# ── 2. Cannot call record_scan_usage ─────────────────────────────────────────
CODE=$(user_curl -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/rpc/record_scan_usage" \
  -d "{\"p_user_id\":\"$USER_ID\",\"p_kind\":\"cook\"}")
expect "2a record_scan_usage as test user" "$CODE" 401 403

CODE=$(anon_curl -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/rpc/record_scan_usage" \
  -d "{\"p_user_id\":\"$USER_ID\",\"p_kind\":\"cook\"}")
expect "2b record_scan_usage with no login" "$CODE" 401 403

# ── 3. Can read only own rows ────────────────────────────────────────────────
# Nothing above may have written a row, so the list must be empty.
read_own 0

if [[ -z "$SERVICE_KEY" ]]; then
  echo "3b skipped (SUPABASE_SERVICE_ROLE_KEY not set; empty-list read above is the only read check)"
  exit 0
fi

signup OTHER_TOKEN OTHER_ID
echo "second user signup HTTP $SIGNUP_CODE (expect 200)"
if [[ -z "$OTHER_TOKEN" || -z "$OTHER_ID" ]]; then
  echo "FAIL second sign-up failed (HTTP $SIGNUP_CODE${SIGNUP_REASON:+: $SIGNUP_REASON}); skipping 3b"
  FAILURES=$((FAILURES + 1))
  exit 1
fi

CODE=$(service_curl -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/rpc/record_scan_usage" \
  -d "{\"p_user_id\":\"$USER_ID\",\"p_kind\":\"cook\"}")
expect "3b server records 1 Cook scan for test user" "$CODE" 200

CODE=$(service_curl -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/rpc/record_scan_usage" \
  -d "{\"p_user_id\":\"$OTHER_ID\",\"p_kind\":\"cook\"}")
expect "3c server records 1 Cook scan for second user" "$CODE" 200

# The second user's row exists but must be invisible to the test user.
read_own 1
