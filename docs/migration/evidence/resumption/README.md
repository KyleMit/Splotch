# Resumption evidence

This records the 2026-10-06 resumption of the full campaign. It verifies preserved bytes and review
provenance, not candidate feasibility, performance, continuity or release acceptance. The
[live register](../../CAMPAIGN.md) owns subsequent status.

The preservation verifier checked checkpoint 63c5f2f45a463774f50455041174f075abaa4af2 and all six
capsules against their complete manifest. Its executable `preservation-verify.py`, structured
`preservation-verification.json.txt`, `preservation-native-intake.json`,
`preservation-extraction.json` and complete native GitHub responses in
`preservation-github-state.json` preserve actual results. The report is formatted prose; structured
receipts preserve their original bytes. Extraction stopped safely at an identical cross-capsule
Android plan and resumed only after byte/mode comparison. That setup outcome is neither a provenance
failure nor a rejecting control.

Claude wrapper cb381ae2-3e6a-4b18-b551-dcededaad4a4 completed question round 1 in conversation
bbe89d5b-644f-4d4f-9366-e5156cebf4ea against the records head. `continuation-claude-session.json`,
`continuation-claude-done.json` and `continuation-claude-findings.json` retain its exact public
technical metadata/findings. Its scope includes continuation and the proposed F1 repair; it is not
an acceptance review of the retained/native source. Four blocking F1 plan amendments remain bound to
the new focused implementation unit and do not reopen PR 2697 or invalidate the preservation
payload. Metro runtime resolution was unverified and is outside the reproduced guard/typecheck
claim. The original GitHub receipt is the 14:51 pre-review observation, not an at-merge receipt. The
unverified live-state item was closed by subsequent native GitHub operations. A post-integration
recheck in `preservation-post-integration-github-state.json.txt` retains merged/head/base and
published review state; Git also verifies aa507 parents dc08/63c5 and tree equality with63c5.

PR 2700 merged unchanged into `codex/native-migration` at aa507a74963adac35baed84c7ab2e13cdc12a946,
with preservation review
[5430346342](https://github.com/KyleMit/Splotch/pull/2700#pullrequestreview-5430346342). That review
separates accepted record preservation from every unfinished implementation. Original raw
conversations, provider state and credentials remain host-local and are absent here.

The original report index maps to committed copies as follows: `verify.py` →
`preservation-verify.py`; `verification.json` → `preservation-verification.json.txt`;
`native-intake.json` → `preservation-native-intake.json`; `github-state.json` →
`preservation-github-state.json`; `extraction.json` → `preservation-extraction.json`. The `.txt`
suffix preserves machine receipt bytes without formatter rewriting. The report's original local
filenames remain historical.

The original native-intake summary remains unchanged. Executed `recheck-native-intake.py` and its
complete `native-intake-recheck.json.txt` independently bind all70 live row bytes, modes, manifest
hash, worktree HEAD and observation time. It checks preservation only.

`unit-source-snapshot.json.txt` binds the retained committed source/tree and pending F1 file/diff
hashes. Retained Quality, Browserless, E2E and release metadata copies are named
`retained-*.json.txt`; complete logs and artifacts are durably mirrored under
`/Users/kylemit/Code/Splotch/logs/migration-resumption-01a111b0/retained` and belong to its PR2702
acceptance unit. These records identify executed source; they do not accept that implementation or
make its unperformed public calls/review/CI pass.
