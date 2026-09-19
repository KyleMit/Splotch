#!/bin/zsh
out=$PWD/runs-confirm
for block in control treatment treatment control; do
  rm -f "$BUILDS_DIR/installed-arm.txt"
  n=$((n+1))
  for kind in warm s1 s2; do
    OUT_DIR=$out node native-run-session.mjs "b${n}-${kind}-${block}" $block '{}' 2>&1 | grep -v '^\s*\[iPad\]' | sed -E 's/[0-9A-F]{8}-[0-9A-F]{16}/<udid>/g'
    sleep 5
  done
done
echo SERIES-DONE
