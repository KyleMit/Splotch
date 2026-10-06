# Preservation verification

Observed 2026-10-06. This verifies preservation and source continuity, not migration implementation
acceptance.

The main checkout is clean at 63c5f2f45a463774f50455041174f075abaa4af2. Its six stored artifacts and
manifest match the Git checkpoint exactly. All outer hashes and lengths match; all 616 tar member
occurrences match ordered manifest names, hashes, lengths and modes. All members are regular
relative files without traversal, duplicate names inside an archive, symlinks or special files.
Every original local source path for those members remains present and byte-identical.

Both bundles pass `git bundle verify` against the local accepted history. `retained-source.bundle`
advertises exactly refs/heads/codex/migration-retained-web-host at
8ddfc04053ccdf285c2f6fd7c2b75e745a9d2fc6 and prerequisite dc08a90abc67b53124146bf288c80de0f9ffd1dd.
`retained-predecessor.bundle` advertises exactly refs/continuation/migration-retained-predecessor at
63b9b4d19c630b576d13159b49003488454c5071 and prerequisite d1402f6b2bedd2c30cbc88d30597466855b33874.

The live retained and topology worktrees remain clean at 8ddfc04053ccdf285c2f6fd7c2b75e745a9d2fc6
and 9442b27817a61486750b070ff07c880d124571a6. The native intake worktree remains at
dc08a90abc67b53124146bf288c80de0f9ffd1dd with its source-only changes. All 70 intake rows match live
bytes and modes, comprising 60 maintained files and 10 registration snapshots. No dependency
installation, application build, native execution or source modification was performed by this
verifier.

All four tar capsules were extracted into the owned records directory
`/private/tmp/splotch-resume-01a111b0/records`. They contain 615 unique paths:
`native/android-compile-plan.md` occurs in both the native and prepared capsules with identical
bytes and mode. The first exclusive-create extraction safely stopped at that existing path. The
continuation compared existing bytes and modes and wrote only absent paths; the setup failure and
duplicate identity are preserved in `extraction.json`. This is not a provenance failure or an
intended rejecting control.

GitHub MCP reports PR2700 open, draft and mergeable, with head
63c5f2f45a463774f50455041174f075abaa4af2 and base dc08a90abc67b53124146bf288c80de0f9ffd1dd. There
are no submitted GitHub reviews or inline review threads. Its final-head ADR Integrity and Tests
workflow runs are successful; Native topology proof is skipped. Tests includes successful Quality,
Release build smoke, Browserless tests, all eight E2E shards, WebKit and Firefox smoke, and
Page-load performance jobs. Conditional WebKit commit-gate jobs are skipped. The combined-status
endpoint returns no statuses; workflow jobs provide the check evidence. The connector's workflow-run
and job lists are first-page limited; the observed lists contain three runs and eighteen Tests jobs
without any reported continuation.

The PR changes only migration documentation and six preservation artifacts. Its preservation
integrity is reviewable for integration. Independent Claude review remains for the parent
integrator; this receipt does not accept any retained/native/React implementation, reset a rival
round budget, or imply candidate compile/mount/performance.

Receipts:

* `verification.json`: executable manifest/member/bundle/source/worktree checks.
* `native-intake.json`: live source-only 60+10 byte/mode check.
* `github-state.json`: exact structured GitHub MCP responses and observed time.
* `extraction.json`: owned extraction, duplicate equality and setup-failure disposition.
* `verify.py`: executed standard-library verifier.
