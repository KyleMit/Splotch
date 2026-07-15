#!/usr/bin/env bash
# Deterministic push + draft-PR for the fix agent. Keeps branch/title/link
# conventions consistent and guarantees an unfixable issue never yields an empty
# PR: if the agent produced no commits, we comment on the issue instead.
set -euo pipefail

: "${ISSUE_NUMBER:?ISSUE_NUMBER is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${FIX_BRANCH:?FIX_BRANCH is required}"

git config user.name "splotch-fix-agent" 2>/dev/null || true
git config user.email "actions@users.noreply.github.com" 2>/dev/null || true

# Sweep up any changes the agent left uncommitted so nothing is silently dropped.
if ! git diff --quiet || ! git diff --cached --quiet; then
  git add -A
  git commit -m "fix: address issue #${ISSUE_NUMBER} (agent leftovers)" || true
fi

git fetch origin main --quiet
if [[ "$(git rev-list --count origin/main..HEAD)" -eq 0 ]]; then
  echo "Fix agent produced no commits; not opening a PR."
  gh issue comment "$ISSUE_NUMBER" --body "The fix agent ran but couldn't produce a safe change for this one — it likely needs a human. Leaving it in the backlog."
  exit 0
fi

git push -u origin "$FIX_BRANCH"

title=$(gh issue view "$ISSUE_NUMBER" --json title --jq '.title')
# "Fixes #N" is a deliberate reference (auto-closes the issue on merge), so it is
# intentionally left unescaped.
gh pr create --draft --base main --head "$FIX_BRANCH" \
  --title "Fix: ${title}" \
  --body "Automated fix attempt for issue #${ISSUE_NUMBER}. **Draft** — please review before merging.

An adversarial review agent will open a follow-up PR against this branch with suggestions.

Fixes #${ISSUE_NUMBER}"

echo "Opened draft PR for issue #${ISSUE_NUMBER} from ${FIX_BRANCH}."
