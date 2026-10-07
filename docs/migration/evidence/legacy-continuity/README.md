# Source-built legacy continuity unit

L0 owns finite disposable Capacitor source-fixture preparation and observation tools. It binds
released v1.6.0, later held-picture and accepted-reader owners, then composes a literal observation
route and native observers in owned copies. Replacement services and transactions remain later
units. The [maintained tools](../../../../tools/migration/legacy-continuity/README.md) include their
real guards and all finite templates.

The [resumed ownership repair](ownership-resumption/README.md) preserves the actual pending merge,
intended EPERM refusals, the accidental lint failure and the repaired 60-control/source-gate
results.

The [current accepted composition](composed-resumption/README.md) binds the ordinary cf0 merge, 31
unchanged reader owners and the passing current scoped, full Quality and Browserless gates.

## Complete historical records

The [single capsule](history.tar.gz) contains all 521 packet members: the 474 historical files and
47 complete later success records, including source snapshots, plans, original review
metadata/findings, SDK manifests, complete raw execution channels, intended controls, accidental
failures and resource release. The [full member manifest](history-members.json.txt) records every
safe relative member, byte length, SHA-256, mode and original independent canonical identity. The
[qualification](history-qualification.json.txt) records complete archive/readback, an intended wrong
member-hash refusal and restored positive; these are metadata controls. The
[exact finite producer](history-producer.py.txt) follows the existing continuation capsule pattern.
Historical Markdown is data inside the capsule; its original bytes and original canonical copies
remain unchanged. The prior one-file raw projection retains its explicit path mapping and original
manifest inside the capsule.

The qualified owned extraction is at
`/private/tmp/splotch-resume-01a111b0/records/legacy-continuity-history-521`. These host links open
that exact verified extraction. On another host, verify the outer archive and every member against
the manifest before extraction into a newly owned empty records directory. Never overlay the records
onto product source or execute their captured scripts as part of recovery. The archive member field
in the manifest is the portable lookup identity; absolute original paths and host links are
provenance and local reading aids.

| Record                                        | Verified owned copy                                                                                                                                         | Scope                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Repaired plan and twelve finding dispositions | [PLAN](/private/tmp/splotch-resume-01a111b0/records/legacy-continuity-history-521/plan-repairs/PLAN.md)                                                     | Controls the source fixture; original review identity remains intact                             |
| Original independent review                   | [findings](/private/tmp/splotch-resume-01a111b0/records/legacy-continuity-history-521/plan-review/findings.json.txt)                                        | Original Claude round one; no new review inferred                                                |
| Accepted-reader composition                   | [README](/private/tmp/splotch-resume-01a111b0/records/legacy-continuity-history-521/accepted-composition-709/README.md)                                     | Exact roles/configuration/Git source bytes at accepted 709                                       |
| SDK binary owner                              | [amendment](/private/tmp/splotch-resume-01a111b0/records/legacy-continuity-history-521/sdk-binary-owner/sdk-binary-owner-amendment/TRUST-PLAN-AMENDMENT.md) | App source build links pinned precompiled SDK binaries; compiled-source association remains open |
| Original source-only composition controls     | [README](/private/tmp/splotch-resume-01a111b0/records/legacy-continuity-history-521/source-composition/README.md)                                           | Nine historical controls retain their original source inputs                                     |
| Own installation and first scoped failure     | [README](/private/tmp/splotch-resume-01a111b0/records/legacy-continuity-history-521/tools-gates-20261006200650/README.md)                                   | Complete frozen install/JS graph; accidental lint failure preserved                              |
| Scoped follow-up                              | [README](/private/tmp/splotch-resume-01a111b0/records/legacy-continuity-history-521/tools-followup-20261006203134/README.md)                                | Eleven guards/checklint/role/flag controls passed at their recorded source                       |
| First full Quality failure                    | [README](/private/tmp/splotch-resume-01a111b0/records/legacy-continuity-history-521/full-final-gates-20261006204640/README.md)                              | Three accidental findings; Browserless not run                                                   |
| Later Quality pass/Browserless failure        | [README](/private/tmp/splotch-resume-01a111b0/records/legacy-continuity-history-521/full-final-gates-retry-20261006210624/README.md)                        | All fifteen Quality stages passed; Browserless reached all five stages, with two tools failures  |

A portable standard-library verification reads stored data without executing any captured source:

```sh
python3 - <<'PYVERIFY'
import hashlib, json, pathlib, tarfile
root = pathlib.Path('docs/migration/evidence/legacy-continuity')
manifest = json.loads((root / 'history-members.json.txt').read_text())
archive = root / manifest['file']
assert archive.stat().st_size == manifest['archive']['bytes']
assert hashlib.sha256(archive.read_bytes()).hexdigest() == manifest['archive']['sha256']
with tarfile.open(archive, 'r:gz') as stored:
    members = stored.getmembers()
    rows = manifest['entries']
    assert len(members) == len(rows) == manifest['memberCount']
    assert len({member.name for member in members}) == len(members)
    for member, row in zip(members, rows):
        relative = pathlib.PurePosixPath(member.name)
        assert not relative.is_absolute() and '..' not in relative.parts
        assert '\\' not in member.name and '\x00' not in member.name
        assert member.isreg() and not member.linkname and member.name == row['member']
        assert member.size == row['bytes'] and member.mode == int(row['mode'], 8)
        assert hashlib.sha256(stored.extractfile(member).read()).hexdigest() == row['sha256']
print('Complete archive and member identities match')
PYVERIFY
```

The
[complete successful invocation](/private/tmp/splotch-resume-01a111b0/records/legacy-continuity-history-521/full-final-gates-compact-20261006212026/README.md)
contains all current source/tool local gate channels and independently checked release. The full
manifest also preserves the exact success mirror receipt bytes as base64 metadata. The exact
474-member capsule/member manifest/qualification tested by those gates remains unchanged in the
canonical compact-history records. Appending evidence does not change that tested-source identity.
The original 261-file question intake is a separately qualified source packet; it is not part of
these 521 archive members. The original review's input manifests state its exact scope.

The [evidence-only composition receipt](success-composition.json.txt) binds unchanged code inputs
and all actual command channels. It preserves the failed metadata preflight separately from its
repair: raw index length/digest/inode values changed, while every other actual snapshot field and
graph reuse matched. Raw binary index contents were not captured. The successful original receipts
are unchanged.

## Current frontier

The successful compact invocation tested staged tree 9724d3af35f1169ab52a438c2799c3cecae2ea17 on
709fadd68ecb802aa2c9daa3fc197ce8d072b23c, with all 65 input rows bound to source manifest
5c7a3112cd9df66cabe69d1769c314136f8262d987765e48a1100cc1b7421c20. All fifteen Quality stages passed
in 50.788 seconds; all five Browserless stages passed in 80.177 seconds. Each of the three role
inspections matched its prior positive output exactly. Complete final hashing finished within
133.828 seconds of the granted 900-second deadline. Source/runtime/semantic index and qualified own
install reuse stayed equal. All seven owned groups and producer 56798 were independently absent, no
signals were sent, and port 5386 was free before/after. The complete original receipt is
c7dcf4b88cc8faab8ef10abbc3be137ee05a67e126bbbfd33ef929a75d9ee004.

Earlier Quality/Browserless failures retain their exact accidental reasons and tested input scopes
inside the capsule. The later evidence-only publication preserved those code inputs and produced
[draft PR2708](https://github.com/KyleMit/Splotch/pull/2708) at
b3b16831557dd894186574b9ce3b0c1184b2aab7, tree 5af98ec42058a181191ddf2676c915d474d60f52. Historical
full gates remain bound to their actual staged tree and cannot qualify the source repairs that
follow.

The original Claude conversation 1b406e61-641e-4cf8-86fb-2b1cd7548469 actually resumed for round
two, reviewing 709..b3 and posting
[eight findings](https://github.com/KyleMit/Splotch/pull/2708#pullrequestreview-5435044842). All
eight were validated against that source. Complete structured findings/session/continuation, actual
PR ledger and release receipts are preserved in the existing durable
[round-two records](/Users/kylemit/Code/Splotch/logs/migration-resumption-01a111b0/legacy-continuity/review-round2-execution/findings.json.txt).
Two substantive rounds are used; one remains for executed native evidence and final acceptance. The
fixed original continuation and unrelated ledgers remain intact. No fresh conversation or
review-budget reset occurred.

The finite
[source repair plan](/Users/kylemit/Code/Splotch/logs/migration-resumption-01a111b0/legacy-continuity/source-repairs-round2/REPAIR-PLAN.md)
binds the exact reviewed owners and separates source controls from native gates. All eight source
repairs are applied. An independent finite source challenge found three additional refusal-path
defects: unsettled output hashing, a zero-timeout recomputation edge and an unconsumed transaction
rejection. The parent approved the narrow source/control delta; all thirty-one scoped host tests
passed at the recorded repaired source. Only actually closed output destinations receive hashes, and
transaction completion is joined with request settlement. Stable gate OS identity and target
source/PID/exit claims remain distinct.

Accepted78d is composed into the owned b3 branch with its exact19 accepted bindings and the explicit
23-path recovery stash retained. Reader role now binds78d; released/held roles remain fixed. The
existing proof-input generator ran once at the qualified own Node identity and produced the exact
expected current-root contract, preserving candidate artifact bytes. Complete source/Git/generator
records and limited historical709 JS graph reuse are in the existing durable
[composition records](/Users/kylemit/Code/Splotch/logs/migration-resumption-01a111b0/legacy-continuity/accepted-composition-78d/execution/composition.json.txt).
The prior installed receipt keeps its709 execution scope; unchanged non-script declarations,
locks/workspace/runtime and recorded installed metadata permit only qualified JS graph reuse. The
current scoped invocation passed seven files/thirty-one tests, type checking, lint, the exact
current-root topology input guard and all three source inspections. The unknown-option refusal
exited one for its intended reason, and the restored reader output was byte-identical. Its complete
[receipt](/Users/kylemit/Code/Splotch/logs/migration-resumption-01a111b0/legacy-continuity/tools-r2-repairs-20261006230109/receipt.json.txt)
and independent
[release](/Users/kylemit/Code/Splotch/logs/migration-resumption-01a111b0/legacy-continuity/tools-r2-repairs-20261006230109/lease.released.json.txt)
bind source manifest 050acb8b70cdf6dcc28723124994ed982bf42e762e60cdb824b58f296af247b2, staged tree
02efc4718518de96640cc5e72964141f7daa35c0 and the actual 36.614-second whole scope. All fifty-nine
selected identities, runtime, semantic index and qualified limited installed metadata remained
equal. All nine command groups and producer 50392 were independently absent; no signals were sent.
The earlier zero-command shared-stash-tip setup failure remains separate. The corrected runner
qualifies the exact owned recovery commit/tree and live membership, with the shared tip only a
diagnostic. Changed-source full Quality/Browserless and actual final-head CI remain required.

Native compilation/install/runtime/effective-origin/profile, native installed graph and SDK compiled
association, replacement transactions, deployed binary/source association, signed-channel upgrades,
physical performance and final campaign completion remain open. Same-version source fixture
mechanics cannot establish a released-channel upgrade.
