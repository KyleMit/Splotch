#!/usr/bin/env bash
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
LAUNCH_FILE="$WORK/launch-command"

[ -d "$WORK" ] || exit 0

# The driver writes its own launch command at startup (see burndown.mjs). Prefer
# the BRANCH recorded there over this Claude session's environment: a run started
# with a non-default BRANCH would otherwise be measured against the wrong ref, and
# the session that triggers compaction is not the session that launched the run.
BRANCH="${BRANCH:-audit/burndown}"
if [ -r "$LAUNCH_FILE" ]; then
  recorded_branch="$(sed -n "s/.*BRANCH='\([^']*\)'.*/\1/p" "$LAUNCH_FILE" | head -1)"
  [ -n "$recorded_branch" ] && BRANCH="$recorded_branch"
fi

# Anchor the pattern at `node`. `pgrep -f` matches the whole command line, so an
# unanchored pattern also matches the launcher's `env … node …` wrapper (and any
# shell that happens to mention the path), and which pid `head -1` returns is down
# to pid-assignment order rather than anything we control. `^node ` matches the
# driver alone.
driver_pid="$(pgrep -f '^node tools/audit-burndown/burndown.mjs' 2>/dev/null | head -1)"

# Unpushed fixes or an undrained comment store mean a run left work owed even if
# nothing is executing now — worth snapshotting for the same reason.
#
# The branch equality is load-bearing, not belt-and-braces: `origin/<branch>..HEAD`
# counts every commit reachable from HEAD but not from the burndown branch, which
# is simply "this branch's own commits" when you are standing anywhere else. Without
# it the hook fired on every unrelated feature branch in the repo.
unpushed=0
branch_checked=0
current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
if [ "$current_branch" = "$BRANCH" ] &&
  git rev-parse --verify --quiet "refs/remotes/origin/$BRANCH" >/dev/null 2>&1; then
  unpushed="$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0)"
  branch_checked=1
fi
owed_comments=0
[ -s "$WORK/pending-comments.jsonl" ] && owed_comments=1

if [ -z "$driver_pid" ] && [ "$unpushed" = "0" ] && [ "$owed_comments" = "0" ]; then
  exit 0
fi

# PreCompact's payload names this field `source` (values: manual | auto). It is
# not `compaction_reason` and not `trigger` — both of those read back as null, so
# the header silently rendered "unknown" on every single compaction.
reason="unknown"
if command -v jq >/dev/null 2>&1; then
  # On EMPTY stdin jq emits nothing and exits 0, so the `|| echo unknown` never
  # fires and reason ends up the empty string — rendering "(source: )". Only
  # malformed-but-nonempty input takes the fallback. Re-default explicitly.
  reason="$(cat 2>/dev/null | jq -r '.source // "unknown"' 2>/dev/null || echo unknown)"
  reason="${reason:-unknown}"
fi

{
  echo "# Burndown state at compaction"
  echo
  echo "> Written by \`.claude/hooks/precompact-burndown-snapshot.sh\` at $(date '+%Y-%m-%d %H:%M:%S')"
  echo "> (source: $reason). Written only when compaction fires, so treat the timestamp above as"
  echo "> the as-of time — it is a point-in-time record, not a live one. Read it, don't edit it."
  echo

  if [ -n "$driver_pid" ]; then
    echo "## A run was IN FLIGHT (pid $driver_pid) as of the timestamp above"
    echo
    echo "Confirm it is still alive before acting on this — \`ps -p $driver_pid\`. If it is:"
    echo "do not launch a second driver, and do not edit any tracked file until it exits,"
    echo "because its rollback path hard-resets the working tree. Pause with \`touch $WORK/STOP\`."
  else
    echo "## No driver running"
    echo
    if [ "$branch_checked" = "1" ]; then
      echo "Unpushed commits on \`$BRANCH\`: $unpushed. Undrained comment store: $owed_comments."
    else
      # "not checked" and "checked, found none" must not render identically in a
      # file whose whole value is being trusted by a session that cannot verify it.
      echo "Unpushed commits on \`$BRANCH\`: not checked (HEAD was \`$current_branch\`)."
      echo "Undrained comment store: $owed_comments."
    fi
  fi
  echo

  echo '## Relaunch command'
  echo
  if [ -r "$LAUNCH_FILE" ]; then
    echo 'Recorded by the driver itself at startup, from its own environment — every non-default'
    echo 'override, verbatim. This cannot be scraped back from `ps`: the launcher runs'
    echo '`env VAR=… node …`, and `env` execs node, so the overrides never enter its argv.'
    echo
    echo '```bash'
    cat "$LAUNCH_FILE" 2>/dev/null
    echo '```'
    # The driver stamps its pid beside the command, so "is this record the run I
    # can see?" is answerable rather than assumed. They disagree when a second
    # driver started and exited after the one still running recorded itself.
    recorded_pid="$(head -1 "$WORK/launch-pid" 2>/dev/null)"
    if [ -z "$driver_pid" ]; then
      echo
      echo 'That is the *last* run launched on this machine, not necessarily one still going.'
    elif [ -n "$recorded_pid" ] && [ "$recorded_pid" != "$driver_pid" ]; then
      echo
      echo "WARNING: this command was recorded by pid $recorded_pid, but the running driver is pid"
      echo "$driver_pid — different runs, so the overrides above are NOT the live run's. Treat them"
      echo 'as a starting point, not a record.'
    fi
  else
    echo 'No launch record — this run predates `.audit-work/launch-command`, or was started by'
    echo 'hand rather than through `npm run audit:burndown:overnight`. The overrides are'
    echo 'per-machine and not in the repo (the push-test script is gitignored), so recover them'
    echo 'from the durable checkpoint — the `audit-burndown-relaunch-command` project memory or a'
    echo '`docs/handoff/` packet — rather than guessing at defaults.'
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
  # -ww: BSD ps truncates to the terminal width (~80 cols) when piped, which clips
  # exactly the long grep pattern that identifies which monitor this is.
  ps -axww -o pid=,command= 2>/dev/null | grep 'tail -f.*run\.log' | grep -v grep || echo '(none running — a quiet run and a dead monitor look identical)'
  echo '```'
  echo

  echo '## Tail of the current run'
  echo
  echo '```'
  awk '/\] starting —/{buf=""} {buf = buf $0 "\n"} END{printf "%s", buf}' "$WORK/logs/run.log" 2>/dev/null | tail -15
  echo '```'
} >"$SNAPSHOT" 2>/dev/null

# Transcript only — PreCompact has no `additionalContext` support, so nothing
# written here reaches the post-compaction model. The session that needs to know
# the snapshot exists is told by the SessionStart companion hook
# (.claude/hooks/session-start-burndown-snapshot.sh, matcher `compact`), whose
# stdout IS injected into context.
echo "Burndown run state snapshotted to $SNAPSHOT"
exit 0
