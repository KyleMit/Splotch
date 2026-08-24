#!/usr/bin/env bash
# Android emulator provisioning for a cloud environment (see .claude/cloud/ANDROID-EMULATOR.md).
#
# Sourced by .claude/cloud/setup.sh only when SPLOTCH_CLOUD_PROFILE lists `android`, so the
# ~5 GB this lands stays off the default box. Everything installed here goes into the
# environment snapshot; the per-session cost is the cold boot the SessionStart hook starts
# (.claude/hooks/cloud-android-emulator.sh), because AVD snapshots cannot be restored under
# TCG — .claude/cloud/ANDROID-EMULATOR.md records why.
#
# Best-effort like its caller: a blocked download must warn, never block session startup.
set -uo pipefail

ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/opt/android-sdk}"
export ANDROID_SDK_ROOT
export ANDROID_HOME="$ANDROID_SDK_ROOT"

# Pinned so the snapshot is reproducible and the AVD keeps matching the image it was made from.
CMDLINE_TOOLS_VERSION=11076708
EMULATOR_API=34

# x86_64 is not a preference, it is the only option: emulator 37 refuses a foreign-ABI AVD with
# "Avd's CPU Architecture 'arm64' is not supported by the QEMU2 emulator on x86_64 host", so the
# guest ABI must equal the host's even though every instruction is interpreted anyway.
EMULATOR_ABI=x86_64
EMULATOR_TAG=default

AVD_NAME="${SPLOTCH_AVD_NAME:-splotch_cloud}"
SYSTEM_IMAGE="system-images;android-${EMULATOR_API};${EMULATOR_TAG};${EMULATOR_ABI}"

emulator_warn() {
  if declare -F warn >/dev/null 2>&1; then
    warn "$1"
  else
    echo "⚠️  $1" >&2
  fi
}

# The emulator links against desktop libraries that a headless container image omits. Without
# these, `emulator -version` dies on libpulse.so.0 before it ever reads an AVD.
install_emulator_system_libraries() {
  local packages=(
    libpulse0 libnss3 libnspr4 libxcursor1 libxrandr2 libxi6 libxtst6
    libasound2t64 libgl1 libglu1-mesa libx11-xcb1 libxcomposite1 libxdamage1
    libxfixes3 libxkbcommon0 libdrm2 libgbm1 libatk1.0-0t64 libatk-bridge2.0-0t64
    libcups2t64 libpango-1.0-0 libcairo2 libxslt1.1
  )
  DEBIAN_FRONTEND=noninteractive apt-get update -qq \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "${packages[@]}"
}

install_command_line_tools() {
  local target="$ANDROID_SDK_ROOT/cmdline-tools/latest"
  [ -x "$target/bin/sdkmanager" ] && return 0

  local archive
  archive="$(mktemp -d)/cmdline-tools.zip"
  curl -sSL -o "$archive" \
    "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS_VERSION}_latest.zip" || return 1

  mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools"
  unzip -q "$archive" -d "$ANDROID_SDK_ROOT/cmdline-tools" || return 1
  # The archive always unpacks to `cmdline-tools/`; sdkmanager requires it be named for its channel.
  mv "$ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools" "$target" || return 1
  rm -f "$archive"
}

install_sdk_packages() {
  local sdkmanager="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager"
  yes | "$sdkmanager" --licenses >/dev/null 2>&1
  # build-tools/platforms are what `npm run android:*` needs to assemble an APK to install; the
  # emulator + system image are what runs it. compileSdkVersion lives in android/variables.gradle.
  "$sdkmanager" \
    "platform-tools" \
    "emulator" \
    "platforms;android-36" \
    "build-tools;36.0.0" \
    "$SYSTEM_IMAGE" >/dev/null
}

# Written into the AVD after avdmanager creates it. A stock Pixel profile boots at 1080x2340/440dpi
# with 1536 MB, and under TCG that combination reliably trips the system_server ANR watchdog while
# SwiftShader composites. Fewer pixels and more headroom is the difference between a usable device
# and a wall of "isn't responding" dialogs.
configure_avd_hardware() {
  local config="$1"
  sed -i -E \
    -e 's/^hw\.lcd\.width *=.*/hw.lcd.width = 720/' \
    -e 's/^hw\.lcd\.height *=.*/hw.lcd.height = 1280/' \
    -e 's/^hw\.lcd\.density *=.*/hw.lcd.density = 320/' \
    -e 's/^hw\.ramSize *=.*/hw.ramSize = 4096M/' \
    -e 's/^vm\.heapSize *=.*/vm.heapSize = 512/' \
    "$config"
}

create_avd() {
  local avd_home="${ANDROID_AVD_HOME:-/root/.android/avd}"
  local config="$avd_home/${AVD_NAME}.avd/config.ini"
  [ -f "$config" ] && return 0

  mkdir -p "$avd_home"
  echo no | ANDROID_AVD_HOME="$avd_home" \
    "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/avdmanager" create avd \
    -n "$AVD_NAME" -k "$SYSTEM_IMAGE" -d pixel_5 --force >/dev/null 2>&1 || return 1

  configure_avd_hardware "$config"
}

install_emulator_system_libraries \
  || emulator_warn "android emulator system libraries skipped — the emulator will fail to start on a missing libpulse.so.0"

if install_command_line_tools; then
  install_sdk_packages \
    || emulator_warn "android SDK packages skipped — check dl.google.com egress; no emulator or system image installed"
  create_avd \
    || emulator_warn "AVD '${AVD_NAME}' was not created — create it by hand before starting the emulator"
else
  emulator_warn "android cmdline-tools install skipped — check dl.google.com egress; the whole Android toolchain is absent"
fi
