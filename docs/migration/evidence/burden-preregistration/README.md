# Burden preregistration evidence

This documentation unit implements the revised [decision policy](../../BURDEN.md), not a framework
choice or measured saving. The exact implementation base is
e7413bf92066fcf45967cf04241a513fd48d49ff. Original Claude conversation
9bbc9f6a-7cff-4a23-aa31-35e18feec8f0 completed actual PR-keyed round two on
f6901a62b8abd742f2d5003a88c4d25695d4186d, resumed under wrapper
d474e648-81c8-410c-9f15-de76c559f4be. Two substantive rounds are used; one remains for the final
executed revision.
[Review 5431273305](https://github.com/KyleMit/Splotch/pull/2704#pullrequestreview-5431273305)
contains three nonblocking findings. Its complete technical metadata is preserved here; the combined
repair restores paper's original tools/bindings floors, defines the exact recurring comparison, and
requires explicit script output paths. Its original wrapper was
1d47c6e5-c469-4852-b53e-7004ebbfc71f. The original proposal and three complete technical metadata
receipts preserve that review's inputs and findings. Raw conversations and authentication remain
host-local.

The old proposal left selection arithmetic ambiguous and used incomplete source-change subsets. The
revised policy fixes absolute initial cost, one combined reserve without reducing either old
reserve, upper-bound retirement delay and an explicit charge for maintaining a second owner during
transition. It names actual potential retirement/addition obligations and treats retirement as
reviewed feasibility before selection. Revised lower endpoints allow plausible savings; none is
measured. Candidate materiality still requires later physical calibration and extra-owner
compensation before comparative results.

`source-facts.py` reads local Git at the pinned full main SHA, window and finite path definitions.
`source-facts.json.txt` records compact counts, complete commit/path-set hashes and exact examples;
`source-facts-disposition.json.txt` records every old-to-new classification reason. These are
explicitly overlapping source-change subsets, including feature work and tests, not complete
maintenance incidents or effort. The script runs without the original 2.3 MB host-local dump. Its
optional original-input verification was exercised separately and the dump remained unchanged.
`source-facts-verification.json.txt` records the historical pre-round-two script verification at
f6901a62b8abd742f2d5003a88c4d25695d4186d, including three independent callers, boundary controls and
original-overwrite refusal. The repair verification records changed script bytes, regenerated
receipts and actual missing-output refusal; no historical script identity is promoted to the
repaired source. Receipt `.json.txt` filenames preserve exact machine bytes;
`original-proposal.md.txt` preserves the actual unformatted plan input.

Reproduce from the checkout without overwriting committed receipts:

```sh
python3 docs/migration/evidence/burden-preregistration/source-facts.py   --output /private/tmp/splotch-burden-facts.json   --disposition-output /private/tmp/splotch-burden-facts-disposition.json
```

Both output paths are required, so a bare invocation refuses before writing into the tracked
evidence directory. The pinned history must exist locally; the script performs no fetch, checkout or
install. Compare both outputs byte-for-byte with their committed `.json.txt` counterparts. The
original proposal is historical and unaccepted; its old counts and separate reserves are superseded
by the revised policy. The original full raw factual dump and earlier artifact variants remain
durably local under `/Users/kylemit/Code/Splotch/logs/migration-resumption-01a111b0/` and do not
need to be trusted to reproduce the accepted compact inputs.

`records-ci-source-attribution.json.txt` distinguishes registered PR 2701 head from actual GitHub CI
test-merge source. Their trees and final integration tree are equal; commit identities and
Git-derived build metadata remain distinct. This does not accept a migration implementation.

The live register's transition snapshot is observational. Pending units remain unaccepted, and there
is no remedy, comparative timing or owner retirement in this unit. Review and final-head CI are
required before this policy makes those dependent executions eligible.
