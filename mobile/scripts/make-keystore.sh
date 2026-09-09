#!/usr/bin/env bash
# Generates the upload keystore used to sign release bundles.
#
#   bash scripts/make-keystore.sh
#
# The keystore and the properties file it writes are git-ignored. Keep a backup
# somewhere safe: Play requires the same upload key for every future update.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
keystore_dir="$here/android/keystore"
keystore="$keystore_dir/easy-hotel-booking-release.jks"
alias="${EHB_KEY_ALIAS:-easyhotelbooking}"

if [ -f "$keystore" ]; then
  echo "Keystore already exists at $keystore — leaving it alone."
  exit 0
fi

password="${EHB_KEYSTORE_PASSWORD:-}"
if [ -z "$password" ]; then
  password="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 28)"
  echo "Generated a random keystore password."
fi

mkdir -p "$keystore_dir"
keytool -genkeypair -v \
  -keystore "$keystore" \
  -alias "$alias" \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$password" -keypass "$password" \
  -dname "${EHB_KEY_DNAME:-CN=Easy Hotel Booking, OU=Mobile, O=Easy Hotel Booking, L=Bengaluru, ST=Karnataka, C=IN}" \
  >/dev/null

cat > "$here/android/keystore.properties" <<PROPS
storeFile=keystore/easy-hotel-booking-release.jks
storePassword=$password
keyAlias=$alias
keyPassword=$password
PROPS

echo "Keystore written to $keystore"
echo "Credentials written to $here/android/keystore.properties (git-ignored)."
echo "Back both up — Play Store updates must be signed with this same key."
