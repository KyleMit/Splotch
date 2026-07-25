#!/bin/bash
# SessionStart (matcher: compact) — point the post-compaction session at the
# snapshot its predecessor left behind.
#
# This exists because PreCompact cannot do it. PreCompact is in the hook group
# with no `additionalContext` support, so its stdout goes to the transcript and
# never into the model's context — the one session that needs to be told the
# snapshot exists is precisely the one that cannot see the message. SessionStart
# stdout IS injected, and its `compact` matcher fires on automatic and manual
# compaction alike, so the nudge lands here instead.
#
# Same two rules as its PreCompact sibling: never fail the session, never write
# inside the repo's tracked tree. This one only reads.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

SNAPSHOT=".audit-work/compact-snapshot.md"

[ -r "$SNAPSHOT" ] || exit 0

# Existence alone is not evidence a burndown is relevant. The driver deletes this
# file when it finishes, but a hard kill (or a run that halts mid-flight) leaves it
# behind — and without a second gate every post-compaction session on this machine,
# forever after, would be told a burndown was in progress. That is the same class of
# harm the snapshot exists to prevent: an authoritative-sounding record that is false.
#
# So: a live driver makes it relevant at any age; otherwise it has to be recent. A
# day is comfortably longer than any real burndown gap between compactions, and short
# enough that residue from a killed run stops speaking within one working day.
MAX_AGE_SECONDS=$((24 * 60 * 60))

driver_pid="$(pgrep -f '^node scripts/audit-burndown/burndown.mjs' 2>/dev/null | head -1)"

# BSD stat (macOS) and GNU stat (Linux) disagree on the flag; try each.
mtime="$(stat -f %m "$SNAPSHOT" 2>/dev/null || stat -c %Y "$SNAPSHOT" 2>/dev/null)"
age=""
[ -n "$mtime" ] && age=$(($(date +%s) - mtime))

if [ -z "$driver_pid" ] && [ -n "$age" ] && [ "$age" -gt "$MAX_AGE_SECONDS" ]; then
  exit 0
fi

written="$(date -r "$SNAPSHOT" '+%Y-%m-%d %H:%M' 2>/dev/null)"
echo "An audit burndown left a state snapshot${written:+ from $written} at \`$SNAPSHOT\`. Read it before acting on any burndown supervision task — it holds the relaunch command, run state, and log tail as of the last compaction. It is a point-in-time record, not a live one: check its timestamp, and confirm any pid it names is still alive, before trusting the in-flight claim. See the \`burn-down-audits\` skill, \"Surviving the context window\"."
exit 0
