#!/bin/bash
set -euo pipefail

# PostToolUse hook: format the single file Claude just edited with Prettier.
#
# Reads the tool payload on stdin and pulls the edited path from
# .tool_input.file_path (present for Edit, Write, and MultiEdit).
#
# `--ignore-unknown` skips files Prettier has no parser for, and Prettier always
# honors .prettierignore, so the hook's scope tracks the repo's Prettier config
# automatically — no duplicated extension list to keep in sync.
#
# Non-blocking by design: a mid-edit file that doesn't parse yet shouldn't fail
# the edit or nag Claude, so any Prettier error is swallowed and we exit 0.

file="$(jq -r '.tool_input.file_path // empty')"
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

cd "$CLAUDE_PROJECT_DIR"
npx prettier --write --ignore-unknown "$file" >/dev/null 2>&1 || true

exit 0
