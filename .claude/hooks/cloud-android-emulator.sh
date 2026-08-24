#!/usr/bin/env bash
set -uo pipefail

# Cloud (Claude Code on the web) only, and only on an environment whose
# SPLOTCH_CLOUD_PROFILE lists `android`. Starts the emulator's cold boot in the
# background at session start and tells Claude how to wait for it.
#
# The boot is started here rather than left to the agent because it takes 6-8
# minutes: there is no accelerator (a Firecracker microVM exposes no /dev/kvm and
# no vmx/svm), so every guest instruction is interpreted by QEMU's TCG, and an AVD
# snapshot cannot be restored under TCG to skip it. Starting at t=0 is the only
# "ready at launch" available. See docs/CLOUD/ANDROID-EMULATOR.md and ADR-0141.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

case ",${SPLOTCH_CLOUD_PROFILE:-}," in
  *,android,*) ;;
  *) exit 0 ;;
esac

ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/opt/android-sdk}"
AVD_NAME="${SPLOTCH_AVD_NAME:-splotch_cloud}"
EMULATOR_PORT="${SPLOTCH_EMULATOR_PORT:-5554}"
BOOT_LOG=/tmp/splotch-emulator-boot.log

if [ ! -x "$ANDROID_SDK_ROOT/emulator/emulator" ]; then
  echo "Android profile is on but $ANDROID_SDK_ROOT/emulator/emulator is missing —" \
       "the environment's setup script did not finish. See docs/CLOUD/ANDROID-EMULATOR.md."
  exit 0
fi

# Idempotent: a SessionStart that fires again (resume, compact) must not launch a second emulator
# onto the same port.
if pgrep -f "qemu-system-${AVD_NAME}|-avd ${AVD_NAME}" >/dev/null 2>&1; then
  echo "Android emulator for AVD ${AVD_NAME} is already running on port ${EMULATOR_PORT}."
  exit 0
fi

ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-/root/.android/avd}" \
ANDROID_SDK_ROOT="$ANDROID_SDK_ROOT" \
ANDROID_HOME="$ANDROID_SDK_ROOT" \
nohup "$ANDROID_SDK_ROOT/emulator/emulator" -avd "$AVD_NAME" \
  -no-window -no-audio -no-boot-anim -no-snapshot -no-metrics \
  -gpu swiftshader_indirect \
  -accel off \
  -memory 4096 -cores 4 \
  -netdelay none -netspeed full \
  -port "$EMULATOR_PORT" \
  >"$BOOT_LOG" 2>&1 &

cat <<EOF
Android emulator (Claude Code on the web, android profile):

1. A cold boot of AVD ${AVD_NAME} was started in the background on port ${EMULATOR_PORT}.
   It takes 6-8 minutes — there is no KVM in this container, so QEMU interprets every
   guest instruction. Boot log: ${BOOT_LOG}
2. Do NOT poll it with sleep. Do other work first, then block on it once:
     adb -s emulator-${EMULATOR_PORT} wait-for-device
     until [ "\$(adb -s emulator-${EMULATOR_PORT} shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 10; done
3. The emulated device is roughly 50-100x slower than hardware. Treat "isn't responding"
   dialogs as expected, and never read a performance number off it — see the
   \`profiling\` skill for targets that can be scored.

docs/CLOUD/ANDROID-EMULATOR.md has the capability limits, including which parts of
Splotch will not render here.
EOF
