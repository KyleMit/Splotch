#!/bin/bash
# PreCompact — snapshot audit-burndown run state before the conversation is summarized.
#
# Compaction replaces the verbatim conversation with prose. Prose is a poor
# carrier for the things a supervising session cannot re-derive — above all the
# exact launch command, with every non-default env override, of a run that is
# still going. This writes those facts to disk at the moment they are about to
# get lossy, so a post-compaction context (or an entirely fresh session) reads
# them instead of trusting a summary that was written before it knew what
# mattered. See the `burn-down-audits` skill, "Surviving the context window".
#
# Two rules this file must keep:
#   * Never block compaction. Every path exits 0, even on error.
#   * Never write inside the repo's tracked tree. The driver's rollback path runs
#     `git reset -q --hard`, which would silently eat a tracked snapshot mid-run;
#     .audit-work/ is gitignored, so reset leaves it alone.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

WORK=".audit-work"
SNAPSHOT="$WORK/compact-snapshot.md"
BRANCH="${BRANCH:-audit/burndown}"

[ -d "$WORK" ] || exit 0

# `pgrep -f` also matches the caffeinate wrapper, whose command line embeds the
# same script path — match the node line so the pid is the driver itself.
driver_pid="$(pgrep -f 'node scripts/audit-burndown/burndown.mjs' 2>/dev/null | head -1)"

# Unpushed fixes or an undrained comment store mean a run left work owed even if
# nothing is executing now — worth snapshotting for the same reason.
#
# The branch equality is load-bearing, not belt-and-braces: `origin/<branch>..HEAD`
# counts every commit reachable from HEAD but not from the burndown branch, which
# is simply "this branch's own commits" when you are standing anywhere else. Without
# it the hook fired on every unrelated feature branch in the repo.
unpushed=0
current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
if [ "$current_branch" = "$BRANCH" ] &&
  git rev-parse --verify --quiet "refs/remotes/origin/$BRANCH" >/dev/null 2>&1; then
  unpushed="$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0)"
fi
owed_comments=0
[ -s "$WORK/pending-comments.jsonl" ] && owed_comments=1

if [ -z "$driver_pid" ] && [ "$unpushed" = "0" ] && [ "$owed_comments" = "0" ]; then
  exit 0
fi

reason="unknown"
if command -v jq >/dev/null 2>&1; then
  reason="$(cat 2>/dev/null | jq -r '.compaction_reason // "unknown"' 2>/dev/null || echo unknown)"
fi

{
  echo "# Burndown state at compaction"
  echo
  echo "> Written by \`.claude/hooks/precompact-burndown-snapshot.sh\` at $(date '+%Y-%m-%d %H:%M:%S')"
  echo "> (compaction_reason: $reason). Regenerated on every compaction — read it, don't edit it."
  echo

  if [ -n "$driver_pid" ]; then
    echo "## A run is IN FLIGHT (pid $driver_pid)"
    echo
    echo "Do not launch a second driver, and do not edit any tracked file until it exits —"
    echo "its rollback path hard-resets the working tree. Pause with \`touch $WORK/STOP\`."
  else
    echo "## No driver running"
    echo
    echo "Unpushed commits on \`$BRANCH\`: $unpushed. Undrained comment store: $owed_comments."
  fi
  echo

  echo '## Relaunch command'
  echo
  if [ -n "$driver_pid" ]; then
    echo 'Reconstructed from the live process — every non-default env override, verbatim.'
    echo 'The caffeinate line is the useful one: tmux does not inherit arbitrary env, so the'
    echo 'launcher bakes each knob into the command itself.'
    echo
    echo '```'
    ps -ax -o command= 2>/dev/null | grep 'burndown\.mjs' | grep -v grep | head -3
    echo '```'
  else
    echo 'No live process to reconstruct from. The overrides are per-machine and not in the repo'
    echo '(the push-test script is gitignored), so recover them from the durable checkpoint —'
    echo 'the `audit-burndown-relaunch-command` memory — not by guessing at defaults.'
  fi
  echo

  echo '## Status'
  echo
  echo '```'
  npm run audit:status --silent 2>&1 | head -12
  echo '```'
  echo

  echo '## Live run-log monitors (ps, not TaskList)'
  echo
  echo 'TaskList has been observed empty while a monitor was still alive, so trust ps.'
  echo 'Stop a stale one before arming a replacement, or every event double-reports.'
  echo
  echo '```'
  ps -ax -o pid=,command= 2>/dev/null | grep 'tail -f.*run\.log' | grep -v grep || echo '(none running — a quiet run and a dead monitor look identical)'
  echo '```'
  echo

  echo '## Tail of the current run'
  echo
  echo '```'
  awk '/\] starting —/{buf=""} {buf = buf $0 "\n"} END{printf "%s", buf}' "$WORK/logs/run.log" 2>/dev/null | tail -15
  echo '```'
} >"$SNAPSHOT" 2>/dev/null

echo "Burndown run state snapshotted to $SNAPSHOT — read it before acting on any burndown supervision task."
exit 0
