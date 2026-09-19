#!/usr/bin/env bash
# Recomputes every derived output of this package from its sanitized raw files and diffs each
# against the original written during the session. Run from the repository root:
#   bash docs/scratchpad/perf/2026-09-19-issue-2072-120hz-check/reproduce.sh
set -euo pipefail
P=docs/scratchpad/perf/2026-09-19-issue-2072-120hz-check
H=docs/scratchpad/perf/2026-09-18-issue-2072-android-fold-flush
ORDER=(c1-ctl t1-trt t2-trt c2-ctl c3-ctl t3-trt t4-trt c4-ctl c5-ctl t5-trt)
BY_ARM=(c1-ctl c2-ctl c3-ctl c4-ctl c5-ctl t1-trt t2-trt t3-trt t4-trt t5-trt)
T=$(mktemp -d)
for f in "$P"/runs/scored/*.json.gz "$P"/runs/traced/*.json.gz "$P"/traces/*.json.gz; do gunzip -c "$f" > "$T/$(basename "$f" .gz)"; done
files() { for l in "$@"; do printf '%s ' "$T/$l.json"; done; }
same() { if cmp -s "$1" "$2"; then echo "MATCH  $3"; else echo "DIFFER $3"; diff "$1" "$2" | head -20; fail=1; fi; }
fail=0

node "$H/score.mjs" $(files "${ORDER[@]}") --json="$T/scored-summary.json" > "$T/score.txt"
same "$T/scored-summary.json" "$P/original/scored-summary.json" 'score.mjs summary (per-run rows and arm comparison)'
node "$P/original/phase-cadence.mjs" $(files "${BY_ARM[@]}") --json="$T/scored-cadence.json" > /dev/null
same "$T/scored-cadence.json" "$P/original/scored-cadence.json" 'phase-cadence.mjs (phase medians, beats, >1.5-beat excess)'
node "$P/original/export-compact.mjs" $(files "${ORDER[@]}") > "$T/compact.json"
same "$T/compact.json" "$P/original/compact.json" 'export-compact.mjs (the compact.json embedded in the issue comment)'
node "$P/original/reproduce.mjs" "$T/compact.json" > "$T/reproduce.txt"
echo "--- reproduce.mjs comparison rows"; grep -E '^[a-zA-Z0-9]+ +ctl ' "$T/reproduce.txt"

for a in ctl trt; do
  { echo "## tr-$a trace-hist"; node --max-old-space-size=4000 "$H/trace-hist.mjs" "$T/tr-$a.extract.json"
    echo "## tr-$a trace-folds"; node --max-old-space-size=4000 "$H/trace-folds.mjs" "$T/tr-$a.extract.json"; } >> "$T/trace-analysis.txt" 2>&1
done
grep -vE '^[0-9a-f]{64}  ' "$P/original/trace-analysis.txt" > "$T/trace-analysis.original.txt"
same "$T/trace-analysis.txt" "$T/trace-analysis.original.txt" 'trace-hist.mjs + trace-folds.mjs on the trace extracts vs the full traces'
node "$P/original/phase-cadence.mjs" "$T/tr-ctl.json" "$T/tr-trt.json" | cut -c1-120
rm -rf "$T"
exit "$fail"
