#!/usr/bin/env bash
# Deterministic enforcement of the triage verdict Claude wrote to
# triage-verdict.json. This is the ONLY thing that mutates the issue in
# observe/assist mode. Because Claude runs read-only, every guard here is
# defense against a prompt-injected verdict:
#   - the issue number comes from the workflow env (the event), never the model
#   - only labels on the hardcoded allowlist are ever applied
#   - the model's free-text comment is length-capped and #-number-escaped
# See .github/workflows/issue-triage.yml for the full security model.
set -euo pipefail

VERDICT="triage-verdict.json"
MODE="${TRIAGE_MODE:-observe}"
: "${ISSUE_NUMBER:?ISSUE_NUMBER is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"

# The complete set of labels the bot may ever apply. The allowlist is the
# capability boundary — not the model's judgement.
ALLOWED_LABELS=(
  bug enhancement question
  needs-repro needs-info
  triage/duplicate-suspected triage/spam-suspected triage/reviewed
)

if [[ ! -f "$VERDICT" ]]; then
  echo "No verdict file produced by the analysis step; nothing to apply."
  exit 0
fi

# Fail closed on a malformed verdict rather than acting on garbage.
if ! jq empty "$VERDICT" 2>/dev/null; then
  echo "triage-verdict.json is not valid JSON; refusing to act." >&2
  exit 1
fi

comment=$(jq -r '.comment_markdown // ""' "$VERDICT")
mapfile -t suggested < <(jq -r '.suggested_labels[]? // empty' "$VERDICT")

# Escape every bare #<digits> in model free-text so an auto-triage comment can't
# silently cross-link unrelated issues/PRs (repo convention).
sanitize() { sed -E 's/#([0-9]+)/\\#\1/g'; }

# Intersect the model's suggestions with the allowlist.
apply_labels=()
for l in "${suggested[@]}"; do
  for a in "${ALLOWED_LABELS[@]}"; do
    [[ "$l" == "$a" ]] && apply_labels+=("$l") && break
  done
done

# Cap length, then sanitize.
body=$(printf '%s' "$comment" | head -c 6000 | sanitize)
if [[ -z "${body//[[:space:]]/}" ]]; then
  body="Thanks for opening this — a maintainer will take a look."
fi

# In observe mode, surface what *would* have been applied without touching the
# issue's labels.
if [[ "$MODE" == "observe" && ${#apply_labels[@]} -gt 0 ]]; then
  joined=$(IFS=', '; echo "${apply_labels[*]}")
  body+=$'\n\n---\n'"_Triage is running in **observe** mode — no labels applied. Suggested: ${joined}._"
fi

# Post the comment. Targets the current issue only; the number is from the event
# payload, so a hijacked verdict cannot retarget another issue.
printf '%s\n' "$body" | gh issue comment "$ISSUE_NUMBER" --body-file -
echo "Posted triage comment on issue #${ISSUE_NUMBER} (mode: ${MODE})."

if [[ "$MODE" == "assist" || "$MODE" == "autonomous" ]] && [[ ${#apply_labels[@]} -gt 0 ]]; then
  add_args=()
  for l in "${apply_labels[@]}"; do add_args+=(--add-label "$l"); done
  # Best-effort: a missing label in the repo shouldn't fail the whole run.
  if gh issue edit "$ISSUE_NUMBER" "${add_args[@]}"; then
    echo "Applied labels: ${apply_labels[*]}"
  else
    echo "Warning: some labels could not be applied (create them per .github/labels.md)." >&2
  fi
fi
