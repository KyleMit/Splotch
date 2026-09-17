#!/bin/bash
# kill-trial-android.sh <delay-seconds> <outdir>
export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
SP=$(dirname "$0")/..; E=$(cd "$(dirname "$0")" && pwd)/android
delay=$1; out=$2; mkdir -p "$out"
adb shell am force-stop art.splotch.app
adb shell run-as art.splotch.app sh -c "'rm -rf no_backup/coloring && tar -xf /data/local/tmp/s0.tar -C no_backup'"
adb shell am start -n art.splotch.app/.MainActivity >/dev/null
sleep "$delay"
adb shell am force-stop art.splotch.app
rm -rf "$out/killed"; mkdir -p "$out/killed"
adb exec-out run-as art.splotch.app tar -cf - -C no_backup coloring 2>/dev/null | tar -xf - -C "$out/killed"
node "$(dirname "$0")/inspect-store.mjs" "$out/killed/coloring" "$E/manifest-new.json" full "killed-after-${delay}s" > "$out/killed.json"; echo "killed-invariant-exit=$?" >> "$out/killed.json"
# relaunch to completion
adb shell am start -n art.splotch.app/.MainActivity >/dev/null
sleep 15
adb shell am force-stop art.splotch.app
rm -rf "$out/resumed"; mkdir -p "$out/resumed"
adb exec-out run-as art.splotch.app tar -cf - -C no_backup coloring 2>/dev/null | tar -xf - -C "$out/resumed"
node "$(dirname "$0")/inspect-store.mjs" "$out/resumed/coloring" "$E/manifest-new.json" full "resumed-after-${delay}s-kill" > "$out/resumed.json"; echo "resumed-invariant-exit=$?" >> "$out/resumed.json"
python3 "$(dirname "$0")/compare-trees.py" "$E/s0-old-installed/coloring" "$out/resumed/coloring" > "$out/resumed-compare.txt"
