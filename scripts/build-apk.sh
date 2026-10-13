#!/usr/bin/env bash
# Offline-release signing for a locally installed Android SDK.
# Never generates a substitute key: changing the key can strand installed wallets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${ANDROID_HOME:?Install the Android SDK and set ANDROID_HOME}"
: "${NP_KEYSTORE:?Set NP_KEYSTORE to your existing signing keystore}"
: "${NP_KEYSTORE_PASSWORD:?Set NP_KEYSTORE_PASSWORD}"
: "${NP_KEY_ALIAS:?Set NP_KEY_ALIAS}"
KEY_PASSWORD="${NP_KEY_PASSWORD:-$NP_KEYSTORE_PASSWORD}"
test -f "$NP_KEYSTORE"
test -x "$ANDROID_HOME/build-tools/36.0.0/apksigner"

cd "$ROOT"
pnpm --filter @netproof/hardware build
pnpm --filter @netproof/hardware exec cap sync android
cd "$ROOT/apps/hardware/android"
./gradlew --no-daemon testDebugUnitTest assembleDebug assembleRelease

mkdir -p "$ROOT/artifacts"
UNSIGNED="app/build/outputs/apk/release/app-release-unsigned.apk"
ALIGNED="$ROOT/artifacts/netproof-air-aligned.apk"
RELEASE="$ROOT/artifacts/netproof-air-0.2.0.apk"
test -f "$UNSIGNED"
"$ANDROID_HOME/build-tools/36.0.0/zipalign" -f -p 4 "$UNSIGNED" "$ALIGNED"
NP_SIGN_PASSWORD="$NP_KEYSTORE_PASSWORD" NP_SIGN_KEY_PASSWORD="$KEY_PASSWORD" \
  "$ANDROID_HOME/build-tools/36.0.0/apksigner" sign \
  --ks "$NP_KEYSTORE" --ks-key-alias "$NP_KEY_ALIAS" \
  --ks-pass env:NP_SIGN_PASSWORD --key-pass env:NP_SIGN_KEY_PASSWORD \
  --out "$RELEASE" "$ALIGNED"
rm -f "$ALIGNED"
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose "$RELEASE"
PERMISSIONS="$("$ANDROID_HOME/build-tools/36.0.0/aapt" dump permissions "$RELEASE")"
echo "$PERMISSIONS" | grep -q 'android.permission.CAMERA'
if echo "$PERMISSIONS" | grep -q 'android.permission.INTERNET'; then
  echo "ERROR: release APK requests INTERNET" >&2
  exit 1
fi
cp app/build/outputs/apk/debug/app-debug.apk "$ROOT/artifacts/netproof-air-0.2.0-debug.apk"
printf 'Signed APK: %s\n' "$RELEASE"
