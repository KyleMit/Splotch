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

echo "An audit burndown was in progress before this context was compacted. Read \`$SNAPSHOT\` before acting on any burndown supervision task — it holds the relaunch command, run state, and log tail as of the compaction. It is a point-in-time record: check its timestamp, and confirm any pid it names is still alive, before trusting the in-flight claim. See the \`burn-down-audits\` skill, \"Surviving the context window\"."
exit 0
