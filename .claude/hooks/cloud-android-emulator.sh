#!/usr/bin/env bash
set -uo pipefail

# Cloud (Claude Code on the web) only, and only on an environment whose
# SPLOTCH_CLOUD_PROFILE lists `android`. Starts the emulator's cold boot in the
# background at session start and tells Claude how to wait for it.
#
# The boot is started here rather than left to the agent because it takes ~20
# minutes: there is no accelerator (a Firecracker microVM exposes no /dev/kvm and
# no vmx/svm), so every guest instruction is interpreted by QEMU's TCG, and an AVD
# snapshot cannot be restored under TCG to skip it. Starting at t=0 is the only
# "ready at launch" available. See .claude/cloud/ANDROID-EMULATOR.md.
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
       "the environment's setup script did not finish. See .claude/cloud/ANDROID-EMULATOR.md."
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

# Provisioning symlinks adb into /usr/local/bin, but that step is best-effort like every other
# one, so resolve it here rather than printing a command that might not exist.
if command -v adb >/dev/null 2>&1; then
  ADB=adb
else
  ADB="$ANDROID_SDK_ROOT/platform-tools/adb"
fi

# Under the environment's 600 s foreground Bash limit, so the wait always ends as a bounded
# foreground command. Past that limit Claude detaches rather than kills, which would leave exactly
# the unbounded background task this deadline exists to prevent.
BOOT_WAIT_SECONDS=540

cat <<EOF
Android emulator (Claude Code on the web, android profile):

1. A cold boot of AVD ${AVD_NAME} was started in the background on port ${EMULATOR_PORT}.
   Expect ~20 minutes, and treat that as variable, not a deadline — there is no KVM in
   this container, so QEMU interprets every guest instruction on one core.
   Boot log: ${BOOT_LOG}
2. Do NOT poll it with sleep. Do other work first, then block on it once, bounded:
     timeout ${BOOT_WAIT_SECONDS} bash -c '${ADB} -s emulator-${EMULATOR_PORT} wait-for-device && until [ "\$(${ADB} -s emulator-${EMULATOR_PORT} shell getprop sys.boot_completed 2>/dev/null | tr -d "\r")" = 1 ]; do sleep 10; done' \\
       && echo "emulator ready" \\
       || echo "not ready in ${BOOT_WAIT_SECONDS}s — read ${BOOT_LOG}; if it is still booting, run this again"
   Both stages hang forever on a dead emulator, so run them under that one deadline, never bare.
   Expiry is expected, not failure: ~20 min of boot against a ${BOOT_WAIT_SECONDS}s bound takes two
   or three rounds. Before re-running, check the guest is still moving, not wedged:
     ${ADB} -s emulator-${EMULATOR_PORT} logcat -d -t 5
3. The emulated device is roughly 50-100x slower than hardware. Treat "isn't responding"
   dialogs as expected, and never read a performance number off it — see the
   \`profiling\` skill for targets that can be scored.

.claude/cloud/ANDROID-EMULATOR.md has the capability limits, including which parts of
Splotch will not render here.
EOF
