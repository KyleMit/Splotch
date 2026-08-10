#!/usr/bin/env bash
set -euo pipefail

# Cloud (Claude Code on the web) only — a local session's shell outlives the
# conversation and its work survives on the developer's disk, so none of the
# bounds below apply there. On a cloud session, SessionStart stdout is injected
# into Claude's context, so this prints the rules that keep an unbounded command
# from outliving the turn that started it. See docs/CLOUD/Claude.md, "Bounding
# long-running work".
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cat <<'EOF'
Long-running work (Claude Code on the web):

1. Bound the command, not just the tool call: `timeout 600 <cmd>`. A command the
   harness moves to the background carries no harness bound at all, and runs
   until it finishes or the container is reclaimed.
2. "Moved to the background" is a decision point, not progress — it means the
   foreground timeout stopped applying. Decide: wait, re-run bounded, or stop.
3. A background task's reported exit code is its wrapper shell's, not the
   command's; a killed command can surface as `exit code 0`. Read the output
   file before reporting success.
4. Run test suites, builds and perf runs in this session, where their output is
   visible. Subagents are for reading and research, not for driving processes.
5. Stop a subagent that has produced nothing for ten minutes rather than waiting
   on it further.
6. Commit and push at the first commit, not the last. Only pushed branches
   survive the container being reclaimed.

See docs/CLOUD/Claude.md, "Bounding long-running work" and "Session lifecycle
and what persists", for the mechanisms behind each of these.
EOF
