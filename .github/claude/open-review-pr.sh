#!/usr/bin/env bash
# Deterministic push + PR for the review agent. If the agent committed concrete
# suggestions, open a PR from claude/review-<pr> INTO the fix branch. If it found
# nothing worth changing, leave an approving review note on the fix PR instead of
# an empty PR.
set -euo pipefail

: "${PR_NUMBER:?PR_NUMBER is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${FIX_BRANCH:?FIX_BRANCH is required}"
: "${REVIEW_BRANCH:?REVIEW_BRANCH is required}"

git config user.name "splotch-review-agent" 2>/dev/null || true
git config user.email "actions@users.noreply.github.com" 2>/dev/null || true

if ! git diff --quiet || ! git diff --cached --quiet; then
  git add -A
  git commit -m "review: suggestions for PR #${PR_NUMBER} (agent leftovers)" || true
fi

# Any commits beyond the fix branch we started from?
if [[ "$(git rev-list --count "origin/${FIX_BRANCH}..HEAD")" -eq 0 ]]; then
  echo "No suggestions to propose; leaving a review note."
  gh pr comment "$PR_NUMBER" --body "🤖 Adversarial review: no blocking issues found — the change looks reasonable. (Automated review; a human should still confirm.)"
  exit 0
fi

git push -u origin "$REVIEW_BRANCH"

gh pr create --base "$FIX_BRANCH" --head "$REVIEW_BRANCH" \
  --title "Review suggestions for PR #${PR_NUMBER}" \
  --body "Adversarial-review suggestions for PR #${PR_NUMBER}, targeting its \`${FIX_BRANCH}\` branch. Merge the ones you agree with into the fix, then merge the fix.

Automated — a human should confirm before merging."

echo "Opened suggestions PR into ${FIX_BRANCH} for PR #${PR_NUMBER}."
