# Source-built legacy continuity unit

L0 owns finite disposable Capacitor source-fixture preparation and observation tools. It binds
released v1.6.0, later held-picture and accepted-reader owners, then composes a literal observation
route and native observers in owned copies. Replacement services and transactions remain later
units. The [maintained tools](../../../../tools/migration/legacy-continuity/README.md) include their
real guards and all finite templates.

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
inside the capsule; no failed output is presented as an intended control. The later packaging change
appends only complete success evidence and updates this owned index/register/provenance. All 25
maintained tools/templates/tests and the bounded root package/Knip bytes remain exact to the
successful gate source. Current metadata/doc checks and final-head CI qualify the evidence-only
changes; the historical local gates are not renamed as execution of a later tree.

The capability path uses its actual named parent-directory owner, while the real repository-root
walk remains guarded. Historical records are consolidated without formatting their immutable bytes
or suppressing documentation/format/path rules. The compact source received those full
Quality/Browserless and role gates. Source/evidence commit/push/PR/CI and the original source/trust
review remain next. Original Claude conversation 1b406e61-641e-4cf8-86fb-2b1cd7548469 has one
used/two remaining substantive rounds. The actual PR-keyed adoption and original round-two
implemented-source/trust challenge precede native execution; round three covers executed native
evidence and final unit acceptance.

Native compilation/install/runtime/effective-origin/profile, native installed graph and SDK compiled
association, replacement transactions, deployed binary/source association, signed-channel upgrades,
physical performance and final campaign completion remain open. Same-version source fixture
mechanics cannot establish a released-channel upgrade.
