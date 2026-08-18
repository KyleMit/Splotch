#!/usr/bin/env bash
# Turn a bounded Playwright setup step's failure into a labelled annotation, then re-exit
# with the original status so a caller can still branch on it.
#
# `timeout` reports expiry two ways and both have to be recognised: 124 when the command
# died to the initial SIGTERM, and 128+SIGKILL when it had to be escalated by --kill-after.
# Reading only 124 would classify precisely the stubborn case — the one --kill-after exists
# for — as an ordinary command failure.
set -uo pipefail

readonly TIMEOUT_EXIT_STATUS=124
readonly KILLED_EXIT_STATUS=137

status=$1
bound_seconds=$2
label=$3

if [ "$status" = "$TIMEOUT_EXIT_STATUS" ] || [ "$status" = "$KILLED_EXIT_STATUS" ]; then
  echo "::error title=Playwright ${label} timed out::Exceeded ${bound_seconds}s." \
    'Network starvation on this runner, not a test failure — a different machine is the' \
    'remedy, and nothing inside a job can change runners. rerun-setup-timeouts.yml re-runs' \
    'the failed jobs once automatically; a check that stays red has spent that re-run, so' \
    're-run the job by hand.'
else
  echo "::error title=Playwright ${label} failed::Exit status ${status}."
fi

exit "$status"
