#!/bin/zsh
# Interleaved perf series; args: out-dir extraJSON arm-sequence...
out=$1; extra=$2; shift 2
i=0
for arm in "$@"; do
  i=$((i+1))
  OUT_DIR=$out node native-run-session.mjs "$(printf '%02d' $i)-$arm" $arm "$extra" 2>&1 | grep -v '^\s*\[iPad\]' | sed -E 's/[0-9A-F]{8}-[0-9A-F]{16}/<udid>/g'
  sleep 5
done
echo SERIES-DONE
