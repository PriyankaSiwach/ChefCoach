#!/usr/bin/env bash
set -u

# Stage 1 check for supabase/migrations/006_subscriptions_lockdown.sql.
# Creates a throwaway anonymous user, tries to give it Pro, prints the results,
# then deletes the user. Prints only HTTP codes, the user ID, and four profile
# fields — never keys or tokens.

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

cleanup() {
  if [[ -n "$TOKEN" ]]; then
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -X POST "$URL/rest/v1/rpc/delete_own_account" -d '{}')
    echo "cleanup delete_own_account HTTP $code (expect 204)"
  fi
  TOKEN=""
  unset ANON_KEY SERVICE_KEY
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

show() {
  user_curl "$URL/rest/v1/profiles?id=eq.$USER_ID&select=profile_data" | python3 -c '
import sys, json
try:
    r = json.load(sys.stdin)
except Exception:
    r = None
d = r[0].get("profile_data", {}) if isinstance(r, list) and r else {}
if not isinstance(d, dict):
    d = {}
print("   ", {k: d.get(k, "<missing>") for k in ("isPro", "subscriptionExpiresAt", "freeScansUsed", "name")})
'
}

# ── Throwaway anonymous user ─────────────────────────────────────────────────
RESP=$(anon_curl -w $'\n%{http_code}' -X POST "$URL/auth/v1/signup" -d '{}')
CODE="${RESP##*$'\n'}"
BODY="${RESP%$'\n'*}"
unset RESP
echo "signup HTTP $CODE (expect 200)"
TOKEN=$(printf '%s' "$BODY" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("access_token") or "")
except Exception: print("")')
USER_ID=$(printf '%s' "$BODY" | python3 -c 'import sys,json
try: print((json.load(sys.stdin).get("user") or {}).get("id") or "")
except Exception: print("")')
unset BODY
if [[ -z "$TOKEN" || -z "$USER_ID" ]]; then
  echo "Anonymous sign-up failed; nothing to test." >&2
  exit 1
fi
echo "test user: $USER_ID"

# ── A: create a profile claiming Pro with 5 scans ────────────────────────────
CODE=$(user_curl -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/profiles" \
  -d "{\"id\":\"$USER_ID\",\"profile_data\":{\"name\":\"probe\",\"isPro\":true,\"subscriptionExpiresAt\":\"2099-01-01T00:00:00Z\",\"freeScansUsed\":5}}")
echo "A insert HTTP $CODE (expect 201; after 006: isPro False, expiry None, scans 0)"
show

# ── B: upsert the way the app does, claiming Pro with 3 scans ───────────────
CODE=$(user_curl -o /dev/null -w "%{http_code}" -H "Prefer: resolution=merge-duplicates" \
  -X POST "$URL/rest/v1/profiles?on_conflict=id" \
  -d "{\"id\":\"$USER_ID\",\"profile_data\":{\"name\":\"probe\",\"isPro\":true,\"freeScansUsed\":3}}")
echo "B upsert HTTP $CODE (expect 201 or 200; after 006: isPro False, scans 3)"
show

# ── C: try to reset scans to 0 and set Pro ───────────────────────────────────
CODE=$(user_curl -o /dev/null -w "%{http_code}" -X PATCH "$URL/rest/v1/profiles?id=eq.$USER_ID" \
  -d '{"profile_data":{"name":"probe","isPro":true,"freeScansUsed":0}}')
echo "C patch HTTP $CODE (expect 204; after 006: isPro False, scans 3)"
show

# ── D: try to write the subscriptions table ──────────────────────────────────
CODE=$(user_curl -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/subscriptions" \
  -d "{\"user_id\":\"$USER_ID\",\"is_pro\":true,\"source\":\"comp\"}")
echo "D subscriptions insert HTTP $CODE (expect 401 or 403)"

# ── E: read own subscription row ─────────────────────────────────────────────
CODE=$(user_curl -o /dev/null -w "%{http_code}" "$URL/rest/v1/subscriptions?select=user_id")
echo "E subscriptions read HTTP $CODE (expect 200)"

# ── F: old unsafe RPC still absent ───────────────────────────────────────────
CODE=$(user_curl -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/rpc/update_profile_subscription" -d '{}')
echo "F update_profile_subscription HTTP $CODE (expect 404)"

# ── G: server key can still set Pro (needed for Stage 2) ─────────────────────
if [[ -n "$SERVICE_KEY" ]]; then
  CODE=$(service_curl -o /dev/null -w "%{http_code}" -X PATCH "$URL/rest/v1/profiles?id=eq.$USER_ID" \
    -d '{"profile_data":{"name":"probe","isPro":true,"freeScansUsed":3}}')
  echo "G service-role patch HTTP $CODE (expect 204; isPro True)"
  show
else
  echo "G skipped (SUPABASE_SERVICE_ROLE_KEY not set)"
fi
