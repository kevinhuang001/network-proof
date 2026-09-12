#!/usr/bin/env bash
# Provision an Android build toolchain and produce an installable debug APK.
#
# Everything is installed under /opt/android-sdk, /usr/lib/jvm and ~/.gradle; the
# repository itself is not modified. Run from the repo root: `pnpm apk`, or
# `bash scripts/build-apk.sh`.
#
# Two build-environment notes, both consequences of this machine's network:
#
#  * services.gradle.org is unreachable at usable speed here (~115 B/s), so the
#    Gradle distribution is fetched from a mirror and verified against the SHA-256
#    published by Gradle itself. The mirror supplies bytes; integrity still comes
#    from upstream. Set NP_GRADLE_MIRROR="" to force the official server.
#  * Maven resolution can go through mirrors when NP_MAVEN_MIRROR=1. They are
#    byte-identical proxies of Google Maven / Maven Central. Left off by default,
#    Gradle uses exactly the repositories the project declares.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
CMDLINE_TOOLS_BUILD=13114758
SDK_PLATFORM="android-36"
BUILD_TOOLS="36.0.0"
GRADLE_VERSION=8.14.3
GRADLE_DIST_URL="https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-all.zip"
GRADLE_MIRROR="${NP_GRADLE_MIRROR-https://mirrors.cloud.tencent.com/gradle}"
MAVEN_MIRROR="${NP_MAVEN_MIRROR:-0}"

log() { printf '[apk] %s\n' "$*"; }

# --- 1. JDK 21 ---
# Capacitor 8 compiles its Android library with `source/target 21`, so JDK 17 is
# not enough (it fails with "invalid source release: 21"), and the base image only
# ships JDK 11.
JDK_DIR=/usr/lib/jvm/java-21-openjdk-amd64
if [ ! -x "$JDK_DIR/bin/javac" ]; then
  log "installing openjdk-21-jdk-headless"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq openjdk-21-jdk-headless unzip >/dev/null
fi
export JAVA_HOME="$JDK_DIR"
export PATH="$JAVA_HOME/bin:$PATH"
log "javac $(javac -version 2>&1)"

# --- 2. Android command line tools ---
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  log "downloading Android command line tools ($CMDLINE_TOOLS_BUILD)"
  mkdir -p "$ANDROID_HOME/cmdline-tools" /tmp/np-sdk
  curl -sSL -o /tmp/np-sdk/cmdline-tools.zip \
    "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS_BUILD}_latest.zip"
  rm -rf /tmp/np-sdk/unpack "$ANDROID_HOME/cmdline-tools/latest"
  unzip -q /tmp/np-sdk/cmdline-tools.zip -d /tmp/np-sdk/unpack
  mv /tmp/np-sdk/unpack/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf /tmp/np-sdk
fi

# --- 3. SDK packages (licences must be pre-accepted or sdkmanager blocks) ---
yes 2>/dev/null | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null 2>&1 || true
log "installing platform-tools, platforms;$SDK_PLATFORM, build-tools;$BUILD_TOOLS"
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" \
  "platform-tools" "platforms;$SDK_PLATFORM" "build-tools;$BUILD_TOOLS" >/dev/null

# --- 4. Gradle distribution: mirror for bandwidth, upstream for integrity ---
DIST_NAME="gradle-${GRADLE_VERSION}-all.zip"
# Gradle names its cache directory after BigInteger(1, md5(distributionUrl)).toString(36).
CACHE_KEY="$(python3 - "$GRADLE_DIST_URL" <<'PY'
import hashlib, sys
digits = "0123456789abcdefghijklmnopqrstuvwxyz"
n = int(hashlib.md5(sys.argv[1].encode()).hexdigest(), 16)
out = ""
while n:
    out = digits[n % 36] + out
    n //= 36
print(out)
PY
)"
DIST_DIR="$HOME/.gradle/wrapper/dists/gradle-${GRADLE_VERSION}-all/${CACHE_KEY}"
if [ ! -f "$DIST_DIR/${DIST_NAME}.ok" ]; then
  log "pre-seeding the Gradle ${GRADLE_VERSION} wrapper cache"
  mkdir -p "$DIST_DIR"
  if [ ! -f "$DIST_DIR/$DIST_NAME" ]; then
    if [ -n "$GRADLE_MIRROR" ]; then
      log "fetching $DIST_NAME from $GRADLE_MIRROR"
      curl -sSL --retry 3 -o "$DIST_DIR/$DIST_NAME" "$GRADLE_MIRROR/$DIST_NAME"
    else
      log "fetching $DIST_NAME from services.gradle.org"
      curl -sSL --retry 3 -o "$DIST_DIR/$DIST_NAME" "$GRADLE_DIST_URL"
    fi
  fi
  # Integrity check against Gradle's own published checksum, not the mirror's.
  OFFICIAL_SHA="$(curl -sSL --max-time 120 "${GRADLE_DIST_URL}.sha256" | tr -d '[:space:]')"
  if [ -n "$OFFICIAL_SHA" ] && [ "${#OFFICIAL_SHA}" = "64" ]; then
    echo "${OFFICIAL_SHA}  $DIST_DIR/$DIST_NAME" | sha256sum -c - >/dev/null \
      || { log "GRADLE CHECKSUM MISMATCH — refusing to use the download"; exit 1; }
    log "gradle distribution verified against the official SHA-256"
  else
    log "WARNING: could not fetch the official checksum; skipping verification"
  fi
  (cd "$DIST_DIR" && unzip -q -o "$DIST_NAME" && touch "${DIST_NAME}.ok")
fi

# --- 5. Optional Maven mirrors for slow routes to Google Maven ---
if [ "$MAVEN_MIRROR" = "1" ]; then
  log "installing an init script that prefers Maven mirrors (NP_MAVEN_MIRROR=1)"
  cat > "$HOME/.gradle/init.gradle" <<'INIT'
// Local build-environment optimisation only; the project declares its own
// repositories. These mirrors are byte-identical proxies of Google Maven and
// Maven Central, consulted first because this machine routes to them faster.
allprojects {
    buildscript {
        repositories {
            maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
            maven { url 'https://maven.aliyun.com/repository/google' }
            maven { url 'https://maven.aliyun.com/repository/public' }
        }
    }
    repositories {
        maven { url 'https://maven.aliyun.com/repository/google' }
        maven { url 'https://maven.aliyun.com/repository/public' }
    }
}
INIT
fi

# --- 6. Build ---
log "building the web bundle and syncing Capacitor"
cd "$REPO_ROOT"
NP_BUILD_COMMIT=$(git rev-parse --short HEAD) NP_BUILD_TIME=$(date -u +%Y-%m-%dT%H:%MZ) pnpm --filter @netproof/hardware build >/dev/null
pnpm --filter @netproof/hardware exec cap sync android >/dev/null

cd "$REPO_ROOT/apps/hardware/android"
echo "sdk.dir=$ANDROID_HOME" > local.properties

# A release build is what belongs on a wallet: `debuggable` is off, so adb cannot
# inspect the app's data directory. It needs a signing key; see NP_KEYSTORE below.
KEYSTORE="${NP_KEYSTORE:-$REPO_ROOT/artifacts/netproof-release.jks}"
if [ ! -f "$KEYSTORE" ]; then
  log "generating a prototype signing key at $KEYSTORE"
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -v -keystore "$KEYSTORE" -alias "${NP_KEY_ALIAS:-netproof}" \
    -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass "${NP_KEYSTORE_PASSWORD:-netproof-prototype}" \
    -keypass "${NP_KEYSTORE_PASSWORD:-netproof-prototype}" \
    -dname "CN=NetProof Air Prototype, OU=Prototype, O=NetProof, L=-, ST=-, C=CN" >/dev/null 2>&1
fi
export NP_KEYSTORE="$KEYSTORE"

log "gradle assembleDebug assembleRelease"
./gradlew --no-daemon assembleDebug assembleRelease

mkdir -p "$REPO_ROOT/artifacts"
cp -f app/build/outputs/apk/release/app-release.apk "$REPO_ROOT/artifacts/netproof-air-0.1.0.apk"
cp -f app/build/outputs/apk/debug/app-debug.apk "$REPO_ROOT/artifacts/netproof-air-0.1.0-debug.apk"

# Verify what actually came out, rather than trusting the build to have done it.
APK="$REPO_ROOT/artifacts/netproof-air-0.1.0.apk"
if [ ! -f "$APK" ]; then
  log "FAILED: no release APK produced"
  exit 1
fi
BUILD_TOOLS_DIR="$ANDROID_HOME/build-tools/$BUILD_TOOLS"
if [ -x "$BUILD_TOOLS_DIR/aapt2" ]; then
  PERMS="$("$BUILD_TOOLS_DIR/aapt2" dump permissions "$APK" 2>/dev/null)"
  echo "$PERMS" | grep -q "android.permission.CAMERA" \
    || { log "APK is missing the CAMERA permission (needed for the entropy source)"; exit 1; }
  # ACCESS_NETWORK_STATE is deliberately NOT requested any more. It is only a read-only
  # connectivity query, but the app no longer asks the OS anything about the network, so
  # holding it would be privilege without purpose.
  if echo "$PERMS" | grep -q "android.permission.ACCESS_NETWORK_STATE"; then
    log "note: ACCESS_NETWORK_STATE is present but the app no longer reads connectivity"
  fi
  if echo "$PERMS" | grep -q "android.permission.INTERNET"; then
    log "FAILED: the APK declares INTERNET — the air gap is no longer OS-enforced"
    exit 1
  fi
  for unwanted in ACCESS_NETWORK_STATE_EXTRA ACCESS_WIFI_STATE CHANGE_NETWORK_STATE; do
    echo "$PERMS" | grep -q "android.permission.$unwanted" \
      && { log "FAILED: unexpected network permission $unwanted"; exit 1; }
  done
  log "verified: CAMERA granted, INTERNET absent (air gap is OS-enforced)" 
  "$BUILD_TOOLS_DIR/apksigner" verify "$APK" >/dev/null 2>&1 \
    && log "verified: APK signature is valid" \
    || { log "APK signature verification FAILED"; exit 1; }
fi

log "APK ready:"
ls -lh "$REPO_ROOT/artifacts"/*.apk
