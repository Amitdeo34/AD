#!/usr/bin/env bash
# Builds the DareUp Android app from ../index.html:
#   build/DareUp-<version>.apk  - install directly on a phone / upload to APK stores
#   build/DareUp-<version>.aab  - upload to Google Play
#
# No Android Studio or Gradle needed. Tools (Ubuntu/Debian):
#   sudo apt-get install -y aapt apksigner zipalign dalvik-exchange openjdk-17-jdk zip unzip
# The Android framework jar (API 34 resources/classes) is downloaded once from Maven Central.
# The app still declares targetSdk 36, which is what Google Play checks; Ubuntu's aapt2
# cannot read the Android 15/16 resource tables yet, so API 34 is the compile platform.
#
# Settings (environment variables, all optional):
#   APP_ID            Play Store package name          (default app.dareup)
#   APP_NAME          launcher label                   (default DareUp)
#   VERSION_CODE      must go up by 1 for every upload (default 1)
#   VERSION_NAME      shown to users                   (default 1.0.0)
#   API_BASE_REMOTE   your deployed site, e.g. https://dareup.vercel.app
#                     (replaces the placeholder in index.html so premium works in the app)
#   KEYSTORE          signing key (default keystore/dareup-upload.jks, created if missing)
#   KEY_ALIAS         key alias (default dareup)
#   KEYSTORE_PASS     key password (default: read from keystore/keystore.properties)
#   APK_CHANNEL       direct (Razorpay premium, default) or play (buying hidden)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WEB="${WEB_DIR:-$(cd "$HERE/.." && pwd)}"
OUT="$HERE/build"

APP_ID="${APP_ID:-app.dareup}"
APP_NAME="${APP_NAME:-DareUp}"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0.0}"
MIN_SDK=24
TARGET_SDK=36
API_BASE_REMOTE="${API_BASE_REMOTE:-}"
APK_CHANNEL="${APK_CHANNEL:-direct}"
case "$APK_CHANNEL" in direct|play) ;; *) echo "APK_CHANNEL must be direct or play"; exit 1;; esac
KEYSTORE="${KEYSTORE:-$HERE/keystore/dareup-upload.jks}"
KEY_ALIAS="${KEY_ALIAS:-dareup}"
PROPS="$(dirname "$KEYSTORE")/keystore.properties"

PLATFORM_VERSION="14-robolectric-10818077"
PLATFORM_URL="https://repo1.maven.org/maven2/org/robolectric/android-all/$PLATFORM_VERSION/android-all-$PLATFORM_VERSION.jar"
ANDROID_JAR="${ANDROID_JAR:-$HERE/.sdk/android-all-$PLATFORM_VERSION.jar}"

step() { printf '\n== %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing tool: $1 ($2)"; exit 1; }; }

need aapt2 "apt-get install aapt"
need javac "install a JDK"
need jarsigner "install a JDK"
need keytool "install a JDK"
need zipalign "apt-get install zipalign"
need apksigner "apt-get install apksigner"
need zip "apt-get install zip"
need unzip "apt-get install unzip"
need python3 "install python3"
DX="$(command -v dalvik-exchange || command -v dx || true)"
[ -n "$DX" ] || { echo "Missing tool: dx (apt-get install dalvik-exchange)"; exit 1; }

# ---------------------------------------------------------------- platform jar
if [ ! -f "$ANDROID_JAR" ]; then
  step "Downloading the Android 14 framework jar (~140 MB, once)"
  mkdir -p "$(dirname "$ANDROID_JAR")"
  curl -fL --retry 3 -o "$ANDROID_JAR.part" "$PLATFORM_URL"
  want="$(curl -fsSL "$PLATFORM_URL.sha1" | cut -c1-40)"
  have="$(sha1sum "$ANDROID_JAR.part" | cut -c1-40)"
  [ "$want" = "$have" ] || { echo "Checksum mismatch for platform jar"; rm -f "$ANDROID_JAR.part"; exit 1; }
  mv "$ANDROID_JAR.part" "$ANDROID_JAR"
fi

# ---------------------------------------------------------------- signing key
if [ ! -f "$KEYSTORE" ]; then
  step "Creating a new upload key at $KEYSTORE  (BACK IT UP - every update must use it)"
  mkdir -p "$(dirname "$KEYSTORE")"
  KEYSTORE_PASS="${KEYSTORE_PASS:-$(python3 -c 'import secrets;print(secrets.token_urlsafe(18))')}"
  keytool -genkeypair -noprompt -keystore "$KEYSTORE" -storetype PKCS12 -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=$APP_NAME" \
    -storepass "$KEYSTORE_PASS" -keypass "$KEYSTORE_PASS" 2>/dev/null
  printf 'storeFile=%s\nkeyAlias=%s\nstorePassword=%s\n' "$(basename "$KEYSTORE")" "$KEY_ALIAS" "$KEYSTORE_PASS" > "$PROPS"
  chmod 600 "$KEYSTORE" "$PROPS"
fi
if [ -z "${KEYSTORE_PASS:-}" ]; then
  [ -f "$PROPS" ] || { echo "Set KEYSTORE_PASS or create $PROPS"; exit 1; }
  KEYSTORE_PASS="$(sed -n 's/^storePassword=//p' "$PROPS")"
fi

# ---------------------------------------------------------------- assets
step "Copying the web game into the app"
rm -rf "$OUT"
mkdir -p "$OUT/assets/www" "$OUT/gen" "$OUT/classes" "$OUT/res-staging"
[ -f "$WEB/index.html" ] || { echo "Missing $WEB/index.html"; exit 1; }
for f in index.html privacy.html terms.html; do
  [ -f "$WEB/$f" ] && cp "$WEB/$f" "$OUT/assets/www/$f"
done
if [ -n "$API_BASE_REMOTE" ]; then
  API_BASE_REMOTE="${API_BASE_REMOTE%/}"
  python3 - "$OUT/assets/www/index.html" "$API_BASE_REMOTE" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text(encoding="utf-8")
ph = "https://[your-app].vercel.app"
if ph not in s:
    sys.exit("API_BASE_REMOTE placeholder not found in index.html")
p.write_text(s.replace(ph, sys.argv[2]), encoding="utf-8")
PY
  echo "Premium API: $API_BASE_REMOTE"
else
  echo "NOTE: API_BASE_REMOTE not set - free packs work, premium needs the deployed site URL."
fi
# Store channel, read by the app at startup (AndroidBridge.storeChannel()):
#   direct = APK for direct download / Indus / other APK stores -> Razorpay premium on
#   play   = Google Play bundle -> in-app buying hidden (Play requires Play Billing)
mkdir -p "$OUT/assets-play"
cp -R "$OUT/assets/." "$OUT/assets-play/"
printf '%s' "$APK_CHANNEL" > "$OUT/assets/channel.txt"
printf 'play' > "$OUT/assets-play/channel.txt"

# Launcher label from APP_NAME (the source strings.xml stays untouched).
cp -R "$HERE/res/." "$OUT/res-staging/"
python3 - "$OUT/res-staging/values/strings.xml" "$APP_NAME" <<'PY'
import sys, pathlib, re
from xml.sax.saxutils import escape
p = pathlib.Path(sys.argv[1]); s = p.read_text(encoding="utf-8")
p.write_text(re.sub(r'(<string name="app_name">)[^<]*(</string>)', lambda m: m.group(1) + escape(sys.argv[2]).replace("'", "\\'") + m.group(2), s), encoding="utf-8")
PY

# ---------------------------------------------------------------- resources
step "Compiling resources (aapt2)"
aapt2 compile --dir "$OUT/res-staging" -o "$OUT/res.zip"
LINK_ARGS=(-I "$ANDROID_JAR" --manifest "$HERE/AndroidManifest.xml"
  --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK"
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME"
  --rename-manifest-package "$APP_ID" --custom-package app.dareup
  --auto-add-overlay)
aapt2 link "${LINK_ARGS[@]}" -A "$OUT/assets" --java "$OUT/gen" -o "$OUT/res.apk" "$OUT/res.zip"
aapt2 link "${LINK_ARGS[@]}" -A "$OUT/assets-play" --proto-format -o "$OUT/res-proto.apk" "$OUT/res.zip"

# ---------------------------------------------------------------- code
step "Compiling Java and converting to dex"
find "$HERE/src" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
# java.* comes from the JDK's Java 8 API, android.* from the framework jar.
javac -nowarn -Xlint:-options --release 8 -encoding UTF-8 \
  -cp "$ANDROID_JAR" -d "$OUT/classes" @"$OUT/sources.txt"
"$DX" --dex --min-sdk-version="$MIN_SDK" --output="$OUT/classes.dex" "$OUT/classes"

# ---------------------------------------------------------------- APK
step "Packaging and signing the APK"
APK="$OUT/$APP_NAME-$VERSION_NAME.apk"
cp "$OUT/res.apk" "$OUT/unaligned.apk"
(cd "$OUT" && zip -q unaligned.apk classes.dex)
zipalign -f -p 4 "$OUT/unaligned.apk" "$OUT/aligned.apk"
apksigner sign --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$KEYSTORE_PASS" --key-pass "pass:$KEYSTORE_PASS" \
  --min-sdk-version "$MIN_SDK" --out "$APK" "$OUT/aligned.apk"
apksigner verify --min-sdk-version "$MIN_SDK" "$APK"

# ---------------------------------------------------------------- AAB
step "Packaging and signing the app bundle (AAB) for Google Play"
AAB="$OUT/$APP_NAME-$VERSION_NAME.aab"
B="$OUT/aab"
mkdir -p "$B/proto" "$B/bundle/base/manifest" "$B/bundle/base/dex"
(cd "$B/proto" && unzip -q "$OUT/res-proto.apk")
mv "$B/proto/AndroidManifest.xml" "$B/bundle/base/manifest/AndroidManifest.xml"
mv "$B/proto/resources.pb" "$B/bundle/base/resources.pb"
[ -d "$B/proto/res" ] && mv "$B/proto/res" "$B/bundle/base/res"
[ -d "$B/proto/assets" ] && mv "$B/proto/assets" "$B/bundle/base/assets"
cp "$OUT/classes.dex" "$B/bundle/base/dex/classes.dex"
# BundleConfig { bundletool { version: "1.17.2" } }
python3 - "$B/bundle/BundleConfig.pb" <<'PY'
import sys
v = b"1.17.2"
inner = b"\x12" + bytes([len(v)]) + v
open(sys.argv[1], "wb").write(b"\x0a" + bytes([len(inner)]) + inner)
PY
(cd "$B/bundle" && zip -q -r -X -D "$AAB" BundleConfig.pb base)
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$KEYSTORE" \
  -storepass "$KEYSTORE_PASS" -keypass "$KEYSTORE_PASS" "$AAB" "$KEY_ALIAS" >/dev/null
jarsigner -verify "$AAB" >/dev/null && echo "AAB signature OK"

step "Done"
ls -la "$APK" "$AAB"
echo "Package: $APP_ID  version $VERSION_NAME ($VERSION_CODE)  minSdk $MIN_SDK  targetSdk $TARGET_SDK"
echo "APK channel: $APK_CHANNEL.  AAB channel: play (no in-app buying)."
rm -f "$OUT/unaligned.apk" "$OUT/aligned.apk" "$OUT/res.apk" "$OUT/res-proto.apk"
