#!/usr/bin/env bash
# Applies each alternative in turn on a clean tree, runs the asset-gen tier, records the verdict.
set -u
cd "$(git rev-parse --show-toplevel)"
for p in spike-837/*.patch; do
  git checkout --quiet -- tools/asset-gen
  echo "=== $p ==="
  git apply --unidiff-zero "$p" 2>&1 || git apply "$p" 2>&1 || { echo "APPLY FAILED"; continue; }
  git diff --stat -- tools/asset-gen | tail -1
  node --check tools/asset-gen/legacy/retouch-line-art.mjs 2>&1 && echo "node --check retouch: ok"
  node --check tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.client.js 2>&1 && echo "node --check client: ok"
  timeout 600 npm run test:asset-gen 2>&1 | grep -E "Test Files|Tests |FAIL|Error" | head -8
done
git checkout --quiet -- tools/asset-gen
