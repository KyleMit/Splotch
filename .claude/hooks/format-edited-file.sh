#!/bin/bash
set -euo pipefail

# PostToolUse hook: format the single file Claude just edited.
#
# Reads the tool payload on stdin and pulls the edited path from
# .tool_input.file_path (present for Edit, Write, and MultiEdit).
#
# Two formatters own disjoint slices of the repo, so the hook routes by
# extension to match `npm run format`:
#   * Markdown is dprint's (dprint.json, ADR-0057) and is in .prettierignore, so
#     Prettier silently skips it — every edited .md must go through `dprint fmt`
#     or it lands unformatted and fails CI's `dprint check`.
#   * Everything else goes to Prettier. `--ignore-unknown` skips files it has no
#     parser for, and Prettier honors .prettierignore, so its scope tracks the
#     repo config automatically — no duplicated extension list to keep in sync.
#
# Non-blocking by design: a mid-edit file that doesn't parse yet shouldn't fail
# the edit or nag Claude, so any formatter error is swallowed and we exit 0.

file="$(jq -r '.tool_input.file_path // empty')"
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

cd "$CLAUDE_PROJECT_DIR"
case "$file" in
  *.md) npx dprint fmt "$file" >/dev/null 2>&1 || true ;;
  *) npx prettier --write --ignore-unknown "$file" >/dev/null 2>&1 || true ;;
esac

exit 0
