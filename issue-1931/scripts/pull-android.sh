#!/bin/sh
# pull-android.sh <outdir> : snapshot no_backup/coloring with inode+mtime listing
export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
out=$1; rm -rf "$out"; mkdir -p "$out"
adb exec-out run-as art.splotch.app tar -cf - -C no_backup coloring 2>/dev/null | tar -xf - -C "$out" 2>/dev/null
adb shell "run-as art.splotch.app find no_backup/coloring -type f -exec stat -c '%i %Y %s %n' {} +" > "$out.stat" 2>/dev/null
