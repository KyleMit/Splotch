#!/usr/bin/env bash
# Phase-3 destructive actions: closing likely duplicates/spam. This runs ONLY
# when TRIAGE_MODE=autonomous, inside a job bound to the `triage-actions`
# environment, so GitHub pauses for a human "approve" before anything closes —
# the human-gated safe verdict. Closes always target the current issue number
# from the event payload, never the model.
set -euo pipefail

VERDICT="triage-verdict.json"
: "${ISSUE_NUMBER:?ISSUE_NUMBER is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"

if [[ ! -f "$VERDICT" ]]; then
  echo "No verdict file; nothing to enforce."
  exit 0
fi
if ! jq empty "$VERDICT" 2>/dev/null; then
  echo "triage-verdict.json is not valid JSON; refusing to act." >&2
  exit 1
fi

spam=$(jq -r '.spam // false' "$VERDICT")
dup=$(jq -r '.duplicate_of // empty' "$VERDICT")

if [[ "$spam" == "true" ]]; then
  gh issue close "$ISSUE_NUMBER" --reason "not planned" \
    --comment "Closed as likely spam by automated triage (human-approved). If this is a mistake, reopen and a maintainer will take another look."
  echo "Closed issue #${ISSUE_NUMBER} as spam."
elif [[ "$dup" =~ ^[0-9]+$ ]]; then
  # Deliberate reference — left unescaped so it links to the duplicate.
  gh issue close "$ISSUE_NUMBER" --reason "not planned" \
    --comment "Closed as a likely duplicate of #${dup} by automated triage (human-approved). If that's wrong, reopen and let us know."
  echo "Closed issue #${ISSUE_NUMBER} as duplicate of #${dup}."
else
  echo "Verdict flags nothing to close; no action."
fi
