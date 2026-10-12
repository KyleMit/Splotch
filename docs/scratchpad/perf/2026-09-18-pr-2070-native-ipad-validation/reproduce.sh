#!/usr/bin/env bash
# Recomputes every published summary from raw/ without a device, then diffs
# against results/. Run from anywhere; needs node and python3.
#   ./reproduce.sh          # verify
#   ./reproduce.sh --write  # regenerate results/
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
analyzer="$here/../2026-09-18-issue-1750-ipad-baseline/analyze.mjs"
(cd "$here/raw" && shasum -a 256 -c ../SHA256SUMS --quiet)
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
for d in "$here"/raw/*/; do
  name="$(basename "$d")"
  mkdir -p "$work/$name"
  for f in "$d"*.json.gz; do gunzip -c "$f" > "$work/$name/$(basename "$f" .gz)"; done
done
out="$work/results"
mkdir -p "$out"
node "$analyzer" "$work/initial" > "$out/initial-analyze.txt"
python3 "$here/score-confirm.py" "$work/initial" | sed "s#$work/##g" > "$out/initial-rescored.txt"
python3 "$here/score-confirm.py" "$work/confirmation" | sed "s#$work/##g" > "$out/confirmation-scored.txt"
python3 "$here/verify-pixels.py" "$work" > "$out/pixels-magic-correctness.txt"
if [[ "${1:-}" == "--write" ]]; then
  rm -rf "$here/results" && cp -R "$out" "$here/results"
  echo "wrote results/"
else
  diff -r "$here/results" "$out" && echo "OK: every summary in results/ reproduces from raw/"
fi
