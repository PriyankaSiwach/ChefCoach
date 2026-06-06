#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ChefCoach — App Store screenshot helper
# Target: iPhone 15 Pro Max simulator (2796 × 1290 px  @3x)
#
# USAGE
#   1. Build and install the app on the simulator first:
#        npm run build && npx cap sync ios
#        Then open Xcode and run on "iPhone 15 Pro Max" simulator.
#      Or run this script with --build to do it automatically (needs xcodebuild).
#
#   2. Run:   bash scripts/take-screenshots.sh
#
# Screenshots are saved to ./screenshots/  (created automatically).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DEVICE_NAME="iPhone 15 Pro Max"
BUNDLE_ID="com.recipify.app"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/screenshots"
WEB_PORT=5173          # Vite dev server port (used for simctl openurl)
BASE_URL="http://localhost:${WEB_PORT}"

# ─── Colours ─────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
info()  { echo -e "${GREEN}[screenshots]${RESET} $*"; }
warn()  { echo -e "${YELLOW}[screenshots]${RESET} $*"; }

# ─── Helpers ─────────────────────────────────────────────────────────────────
screenshot() {
  local name="$1"
  local file="${OUT_DIR}/${name}.png"
  info "Capturing → ${name}.png"
  xcrun simctl io booted screenshot "$file"
  echo "  saved: $file"
}

wait_for() {
  local secs="$1"; local label="$2"
  info "Waiting ${secs}s — ${label}…"
  sleep "$secs"
}

open_url() {
  # Opens a URL in the booted simulator's default browser / web app shell.
  # For a Capacitor native build, use xcrun simctl launch instead.
  xcrun simctl openurl booted "$1"
}

# ─── Locate the booted simulator ─────────────────────────────────────────────
UDID=$(xcrun simctl list devices booted --json 2>/dev/null \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
devs=[v for lst in d.get('devices',{}).values() for v in lst if v.get('state')=='Booted']
print(devs[0]['udid'] if devs else '')
")

if [[ -z "$UDID" ]]; then
  warn "No booted simulator found. Booting ${DEVICE_NAME}…"
  UDID=$(xcrun simctl list devices available --json \
    | python3 -c "
import json,sys
d=json.load(sys.stdin)
devs=[v for lst in d.get('devices',{}).values() for v in lst if '${DEVICE_NAME}' in v.get('name','')]
print(devs[0]['udid'] if devs else '')
")
  if [[ -z "$UDID" ]]; then
    echo "ERROR: Could not find an '${DEVICE_NAME}' simulator. Create one in Xcode → Window → Devices and Simulators."
    exit 1
  fi
  xcrun simctl boot "$UDID"
  open -a Simulator
  wait_for 8 "Simulator booting"
fi

info "Using simulator UDID: ${UDID}"
mkdir -p "$OUT_DIR"

# ─── Decide: native app or web (Vite dev server) ────────────────────────────
# Check if the native app is installed; if yes, launch it. Otherwise fall back
# to the Vite dev server URL (useful for rapid screenshot iteration).

APP_INSTALLED=$(xcrun simctl listapps booted 2>/dev/null | grep -c "${BUNDLE_ID}" || true)

launch_app() {
  if [[ "$APP_INSTALLED" -gt 0 ]]; then
    xcrun simctl launch booted "${BUNDLE_ID}" "$@" 2>/dev/null || true
  else
    warn "Native app not installed — opening Vite dev server instead."
    warn "For true App Store screenshots, run the native build in Xcode first."
    open_url "${BASE_URL}$1"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# SCREEN 1 — Login / Sign-up screen
# ─────────────────────────────────────────────────────────────────────────────
info "=== Screen 1: Login page ==="
if [[ "$APP_INSTALLED" -gt 0 ]]; then
  # Terminate first so we get a clean launch
  xcrun simctl terminate booted "${BUNDLE_ID}" 2>/dev/null || true
  sleep 1
  xcrun simctl launch booted "${BUNDLE_ID}"
fi
open_url "${BASE_URL}/login"
wait_for 4 "Login screen loading"
screenshot "01-login"

# ─────────────────────────────────────────────────────────────────────────────
# SCREEN 2 — Cook tab (fridge scan, hero)
# NOTE: we inject a mock auth session via localStorage so ProtectedRoute passes.
# ─────────────────────────────────────────────────────────────────────────────
info "=== Screen 2: Cook tab — fridge scanner ==="
# Inject a fake profile + pro flag so the app renders the full Cook tab.
xcrun simctl spawn booted defaults write "${BUNDLE_ID}" recipify_is_pro -bool YES 2>/dev/null || true

open_url "${BASE_URL}/?tab=cook"
wait_for 4 "Cook tab loading"
screenshot "02-cook-fridge-scanner"

# ─────────────────────────────────────────────────────────────────────────────
# SCREEN 3 — Recipe results (after scan)
#   For this screenshot you should pre-load results by running the app and
#   scanning a sample fridge image, then call this script again.
#   We take the screenshot here in case results are already visible.
# ─────────────────────────────────────────────────────────────────────────────
info "=== Screen 3: Recipe results ==="
wait_for 2 "giving time for results panel"
screenshot "03-recipe-results"

# ─────────────────────────────────────────────────────────────────────────────
# SCREEN 4 — Saved recipes tab
# ─────────────────────────────────────────────────────────────────────────────
info "=== Screen 4: Saved recipes ==="
open_url "${BASE_URL}/?tab=saved"
wait_for 3 "Saved tab loading"
screenshot "04-saved-recipes"

# ─────────────────────────────────────────────────────────────────────────────
# SCREEN 5 — Meal Plan tab
# ─────────────────────────────────────────────────────────────────────────────
info "=== Screen 5: Meal plan ==="
open_url "${BASE_URL}/?tab=plan"
wait_for 3 "Plan tab loading"
screenshot "05-meal-plan"

# ─────────────────────────────────────────────────────────────────────────────
# SCREEN 6 — Diet Coach (ChatBot)
# ─────────────────────────────────────────────────────────────────────────────
info "=== Screen 6: Diet Coach chat ==="
open_url "${BASE_URL}/?tab=plan&section=coach"
wait_for 3 "Coach loading"
screenshot "06-diet-coach"

# ─────────────────────────────────────────────────────────────────────────────
# SCREEN 7 — Profile / streak tracker
# ─────────────────────────────────────────────────────────────────────────────
info "=== Screen 7: Profile & streaks ==="
open_url "${BASE_URL}/?tab=profile"
wait_for 3 "Profile tab loading"
screenshot "07-profile-streaks"

# ─────────────────────────────────────────────────────────────────────────────
# SCREEN 8 — Upgrade / Pro paywall
#   Trigger by opening the app with trial ended flag set.
# ─────────────────────────────────────────────────────────────────────────────
info "=== Screen 8: Pro paywall ==="
# Remove pro flag so the upgrade modal appears
xcrun simctl spawn booted defaults delete "${BUNDLE_ID}" recipify_is_pro 2>/dev/null || true
open_url "${BASE_URL}/?showUpgrade=1"
wait_for 3 "Paywall loading"
screenshot "08-pro-paywall"

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "✅  All screenshots saved to: ${OUT_DIR}/"
echo ""
echo "  Required App Store sizes for iPhone 15 Pro Max:"
echo "  • 6.9\"  (iPhone 15 Pro Max / 16 Pro Max) — 1320 × 2868 px"
echo "  • You may also need 6.5\" (1242 × 2688) if targeting older devices"
echo ""
echo "  Submit screenshots in App Store Connect:"
echo "  My Apps → ChefCoach → iOS App → [version] → Screenshots"
echo ""
warn "TIP: For the most realistic screenshots, run the Xcode build on the"
warn "simulator first, set up real profile data, then re-run this script."
