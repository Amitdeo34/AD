#!/usr/bin/env bash
# Builds the signed Android App Bundle for Easy Hotel Booking.
#
#   npm run build:android
#
# The Android app is a shell around the deployed site, so the one value you must
# set for a real release is EHB_APP_URL — the public URL the app should load.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

: "${EHB_VERSION_CODE:=1}"
: "${EHB_VERSION_NAME:=1.0.0}"
export EHB_VERSION_CODE EHB_VERSION_NAME

if [ -z "${EHB_APP_URL:-}" ]; then
  echo "WARNING: EHB_APP_URL is not set."
  echo "         The bundle will install and run, but it will show the offline"
  echo "         screen until it is rebuilt with the deployed site's URL."
fi
export EHB_APP_URL="${EHB_APP_URL:-}"

# --- 1. Android SDK ----------------------------------------------------------
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}"
if [ ! -d "$sdk/platforms" ]; then
  echo "ERROR: no Android SDK at $sdk. Install the command-line tools and the" >&2
  echo "       android-35 platform, then set ANDROID_HOME." >&2
  exit 1
fi
echo "sdk.dir=$sdk" > mobile/android/local.properties

# --- 2. Shell assets and configuration ---------------------------------------
echo "==> Syncing the Android shell${EHB_APP_URL:+ (loading $EHB_APP_URL)}"
npm run sync --workspace mobile

# --- 3. Signing key ----------------------------------------------------------
if [ ! -f mobile/android/keystore.properties ] && [ -z "${EHB_KEYSTORE_PASSWORD:-}" ]; then
  echo "==> No signing key configured; generating an upload keystore"
  bash mobile/scripts/make-keystore.sh
fi

# --- 4. The bundle -----------------------------------------------------------
echo "==> Assembling the release bundle (version $EHB_VERSION_NAME, code $EHB_VERSION_CODE)"
(cd mobile/android && ./gradlew --no-daemon bundleRelease)

aab="$repo/mobile/android/app/build/outputs/bundle/release/app-release.aab"
[ -f "$aab" ] || { echo "ERROR: the build finished but $aab is missing." >&2; exit 1; }

echo
echo "Android App Bundle: $aab"
echo "Size: $(du -h "$aab" | cut -f1)"
if command -v jarsigner >/dev/null 2>&1; then
  if jarsigner -verify "$aab" >/dev/null 2>&1; then
    echo "Signature: verified"
  else
    echo "Signature: UNSIGNED — configure a keystore before uploading to Play"
  fi
fi
