#!/usr/bin/env bash
# Deterministic enforcement of the intake verdict Claude wrote to
# triage-verdict.json. This is the ONLY thing that mutates the issue. Because
# Claude runs read-only, every guard here defends against a prompt-injected
# verdict:
#   - the issue number comes from the workflow env (the event), never the model
#   - only labels on the hardcoded allowlist are applied
#   - the only destructive action (close+lock) targets THIS issue, so a hijacked
#     verdict can at worst close the attacker's own report
#   - `backlog` is NOT in the allowlist: intake can never promote to the
#     high-autonomy zone; only a human does that.
set -euo pipefail

VERDICT="triage-verdict.json"
: "${ISSUE_NUMBER:?ISSUE_NUMBER is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"

# Labels intake may apply. Deliberately excludes `backlog` (human-only gate) and
# `user-report` (the trigger, not something we re-apply).
ALLOWED_LABELS=(bug enhancement question needs-repro needs-info needs-triage spam)

if [[ ! -f "$VERDICT" ]]; then
  echo "No verdict file produced by the analysis step; nothing to apply."
  exit 0
fi

# Fail closed on a malformed verdict rather than acting on garbage.
if ! jq empty "$VERDICT" 2>/dev/null; then
  echo "triage-verdict.json is not valid JSON; refusing to act." >&2
  exit 1
fi

is_spam=$(jq -r '.spam // false' "$VERDICT")
comment=$(jq -r '.comment_markdown // ""' "$VERDICT")
mapfile -t suggested < <(jq -r '.suggested_labels[]? // empty' "$VERDICT")

# Escape every bare #<digits> in model free-text so an auto-triage comment can't
# silently cross-link unrelated issues/PRs (repo convention).
sanitize() { sed -E 's/#([0-9]+)/\\#\1/g'; }

body=$(printf '%s' "$comment" | head -c 6000 | sanitize)
[[ -z "${body//[[:space:]]/}" ]] && body="Thanks for the report — taking a look."

# Post the findings comment. Targets the current issue only; the number is from
# the event payload, so a hijacked verdict cannot retarget another issue.
printf '%s\n' "$body" | gh issue comment "$ISSUE_NUMBER" --body-file -
echo "Posted intake comment on issue #${ISSUE_NUMBER}."

if [[ "$is_spam" == "true" ]]; then
  # Destroy: label for the record, then close as not planned and lock.
  gh issue edit "$ISSUE_NUMBER" --add-label spam || true
  gh issue close "$ISSUE_NUMBER" --reason "not planned" || true
  gh issue lock "$ISSUE_NUMBER" --reason spam || true
  echo "Closed + locked issue #${ISSUE_NUMBER} as spam/prompt-injection."
  exit 0
fi

# Valid report: intersect suggestions with the allowlist and always mark it
# needs-triage so it surfaces for human review.
apply_labels=(needs-triage)
for l in "${suggested[@]}"; do
  [[ "$l" == "spam" || "$l" == "needs-triage" ]] && continue
  for a in "${ALLOWED_LABELS[@]}"; do
    [[ "$l" == "$a" ]] && apply_labels+=("$l") && break
  done
done

add_args=()
for l in "${apply_labels[@]}"; do add_args+=(--add-label "$l"); done
if gh issue edit "$ISSUE_NUMBER" "${add_args[@]}"; then
  echo "Applied labels: ${apply_labels[*]}"
else
  echo "Warning: some labels could not be applied (create them per .github/labels.md)." >&2
fi
