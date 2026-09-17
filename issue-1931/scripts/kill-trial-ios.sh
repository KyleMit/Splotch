#!/bin/bash
# kill-trial-ios.sh <delay> <outdir>
EV=$(cd "$(dirname "$0")" && pwd); E=$EV/ios; U=B53CD359-403E-4E7C-8889-3CD5F360557E
delay=$1; out=$2; mkdir -p "$out"
D="$(cat $EV/ios-data-path.txt)/Library/Application Support"
xcrun simctl terminate $U art.splotch.app 2>/dev/null
rm -rf "$D/coloring"/*; cp -Rp "$E/s0-old-installed/coloring/." "$D/coloring/"
pid=$(xcrun simctl launch $U art.splotch.app | awk '{print $2}')
sleep "$delay"; kill -9 "$pid"; sleep 0.5
$EV/snap-ios.sh "$out/killed"
node $EV/inspect-store.mjs "$out/killed/coloring" $E/manifest-new.json full "killed-after-${delay}s" > "$out/killed.json"; echo "killed-invariant-exit=$?" >> "$out/killed.json"
xcrun simctl launch $U art.splotch.app >/dev/null; sleep 12; xcrun simctl terminate $U art.splotch.app
$EV/snap-ios.sh "$out/resumed"
node $EV/inspect-store.mjs "$out/resumed/coloring" $E/manifest-new.json full "resumed" > "$out/resumed.json"; echo "resumed-invariant-exit=$?" >> "$out/resumed.json"
python3 $EV/compare-trees.py $E/s0-old-installed/coloring "$out/resumed/coloring" > "$out/resumed-compare.txt"
python3 $EV/compare-inodes.py $E/s0-old-installed.stat "$out/resumed.stat" >> "$out/resumed-compare.txt"
