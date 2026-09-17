#!/bin/bash
# snap-ios.sh <outdir> : copy the simulator app's coloring store (mtimes preserved) + inode listing
D="$(cat "$(dirname "$0")/ios-data-path.txt")/Library/Application Support/coloring"
out=$1; rm -rf "$out"; mkdir -p "$out"
[ -d "$D" ] && cp -Rp "$D" "$out/coloring"
( cd "$D/.." 2>/dev/null && find coloring -type f -exec stat -f '%i %m %z %N' {} + ) > "$out.stat"
