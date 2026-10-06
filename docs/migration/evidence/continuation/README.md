# Paused migration preservation

This is a portable checkpoint for the 2026-10-06 pause. The
[handoff](../../../handoff/native-migration-continuation.md) owns immediate continuation, and the
[progress checklist](../../PROGRESS.md) owns scope. The accepted integration head is
dc08a90abc67b53124146bf288c80de0f9ffd1dd. These capsules preserve unfinished work and actual
evidence as data; they do not add candidate code to the application or accept an implementation.
Implementation remains paused until the maintainer authorizes it.

## Stored records

The [manifest](manifest.json) gives exact outer hashes, lengths, Git prerequisites and every archive
member's identity, mode, original source and category. Absolute source paths are provenance from the
old host; archive members are the portable lookup paths. The
[preservation validation](validation.json) records the checkpoint checks and independent Codex
integrity review, with their scope and observed failures.

| Artifact                        | Contents and use                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retained-source.bundle`        | Clean unaccepted retained source 8ddfc04053ccdf285c2f6fd7c2b75e745a9d2fc6, based on accepted dc08a90abc67b53124146bf288c80de0f9ffd1dd.                                                                                                                                                                |
| `retained-predecessor.bundle`   | Original reviewed snapshot 63b9b4d19c630b576d13159b49003488454c5071, requiring d1402f6b2bedd2c30cbc88d30597466855b33874; preserves the negative-control driver's Git input.                                                                                                                           |
| `retained-evidence.tar.gz`      | Accepted topology receipts/logs; retained actual release/mechanism controls, screenshots, repeated evidence, source checks and calls; all three inversion attempts/drivers; private unapplied CI proposal; original six Claude findings and metadata; original pause checkpoint and backup manifests. |
| `native-source-snapshot.tar.gz` | Seventy exact uncommitted source files, source intake/roster, corrected native handoff, controlling Apple plan, Android compile plan, authenticated official template archive and receipt.                                                                                                            |
| `prepared-work.tar.gz`          | Exact passive preparation inventory and source/plan packets for archive20, yauzl, corrected Ruby boundary, neutral React53/React25 and proposed React dependencies.                                                                                                                                   |
| `advisory-audits.tar.gz`        | Eight readable separate-session coordination/technical reports and indexes, plus snapshot selection provenance. These are advisory findings with coverage limits, not accepted campaign decisions or implemented fixes.                                                                               |

The native intake has sixty maintained files and ten registration snapshots. The prepared-work
inventory selects 366 files plus its own index/manifest. Counts include public upstream sources,
frozen comparison inputs and receipts, not completed product features. The retained evidence keeps
large original dependency fingerprints verbatim; compression changes storage, not record bytes.

## Verify and recover

Start from the pushed `codex/migration-continuation-records` branch or its reviewed descendant.
Fetch the accepted integration history as well; both bundles deliberately omit their already
accepted prerequisites. Re-read the manifest and verify all bytes before using the capsules. This
standard library check reads stored data without importing or executing any prepared source:

```sh
python3 - <<'PY'
import hashlib, json, pathlib, tarfile
root = pathlib.Path('docs/migration/evidence/continuation')
manifest = json.loads((root / 'manifest.json').read_text())
for artifact in manifest['artifacts']:
    path = root / artifact['file']
    data = path.read_bytes()
    assert len(data) == artifact['bytes']
    assert hashlib.sha256(data).hexdigest() == artifact['sha256']
    if artifact['kind'] != 'tar.gz':
        continue
    with tarfile.open(path, 'r:gz') as archive:
        members = archive.getmembers()
        rows = artifact['entries']
        assert len(members) == len(rows)
        assert len({member.name for member in members}) == len(members)
        for member, row in zip(members, rows):
            relative = pathlib.PurePosixPath(member.name)
            assert not relative.is_absolute() and '..' not in relative.parts
            assert member.isreg() and member.name == row['member']
            assert member.size == row['bytes'] and member.mode == int(row['mode'], 8)
            assert hashlib.sha256(archive.extractfile(member).read()).hexdigest() == row['sha256']
print('All stored artifact and member identities match')
PY
```

Extract only the required capsules into a newly owned empty directory after verification. Do not
overlay their source snapshots onto the checkout. For example:

```sh
splotch_resume_records=$(mktemp -d "${TMPDIR:-/tmp}/splotch-migration-resume.XXXXXX")
tar -xzf docs/migration/evidence/continuation/retained-evidence.tar.gz -C "$splotch_resume_records"
tar -xzf docs/migration/evidence/continuation/native-source-snapshot.tar.gz -C "$splotch_resume_records"
tar -xzf docs/migration/evidence/continuation/prepared-work.tar.gz -C "$splotch_resume_records"
tar -xzf docs/migration/evidence/continuation/advisory-audits.tar.gz -C "$splotch_resume_records"
```

Inspect existing refs before restoring Git history. If the retained branch is absent, restore it
without a force update; an existing divergent branch needs reconciliation rather than replacement:

```sh
git bundle verify docs/migration/evidence/continuation/retained-source.bundle
git bundle verify docs/migration/evidence/continuation/retained-predecessor.bundle
git fetch docs/migration/evidence/continuation/retained-source.bundle \
  refs/heads/codex/migration-retained-web-host:refs/heads/codex/migration-retained-web-host
git fetch docs/migration/evidence/continuation/retained-predecessor.bundle \
  refs/continuation/migration-retained-predecessor:refs/continuation/migration-retained-predecessor
```

Use a managed worktree for implementation. Recreate missing dependency/build inputs with the
existing reviewed install/build procedure and fresh receipts; those trees were intentionally not
copied. Historical fingerprints describe the old runs and must not be rewritten to resemble new
execution.

## Retained control and Claude continuity

Read these extracted members before changing the active retained unit:

* `retained/source-checks.json`, `retained/calls/calls.json` and
  `retained/actual-controls/{release,mechanism}/result.json` for exact source/control outcomes.
* `retained/first-browser-witness.json` and actual browser records/screenshots for ink and
  preservation.
* `retained/inversions/final-attempt/inversion-results.json` and `retained/inversions/final-driver/`
  for the passing negative controls. The first and second attempts remain preserved failures, not
  alternate acceptance receipts.
* `retained/private-ci-handoff.md` and `retained/private-ci-proposal.patch` for the unapplied
  two-file CI proposal. Choose a measured numeric CI deadline; its proposed unit tests have not run.
* `retained/original-claude-review/{session,done,findings}.json`, `retained/claude-provenance.md`
  and `retained/review-ledger-adoption-template.json` for resumption.

The original actual review is Claude conversation `b5bb0824-3f7a-4ad7-9e05-4e8e9af77333`, round one,
not resumed, against d1402f6b2bedd2c30cbc88d30597466855b33874 and
63b9b4d19c630b576d13159b49003488454c5071. It reported six findings and zero unverified items. The
deterministic SvelteKit version correction landed separately in PR 2698; current retained source
addresses preview ownership, held hydration, interruption, distinct evidence paths and kind/mode
comparison. Local controls support those repairs; Claude has not accepted the repaired unit.

Question mode did not persist this turn's ledger. Before the eventual actual retained PR review,
follow the provenance's explicit new PR-keyed adoption procedure, preserving one used round and two
remaining rounds. Do not overwrite the unrelated branch ledger or use `--fresh`/`--end-session`.
Require round two, resumed=true and the original identity in the successful wrapper record. A
resume-failure fallback must be reported and does not satisfy this requirement. The old conversation
file is host-local; these public technical findings/metadata do not transfer its private state.

The final private inversion driver references old absolute worktree/temp paths and both stored Git
commits. Its copy is provenance, not a turnkey command on another host. Adapt private path inputs
after identity checks without weakening the intended mutations, assertion checks or restore
controls.

## Native and neutral React entry points

Read the extracted `native/corrected-toolchain-handoff.md`, `native/source-intake-receipt.json`,
`native/roster.json`, `native/apple-environment.md` and `native/android-compile-plan.md` first. The
official Expo bare template archive is `native/template-archive.tgz`, verified by
`native/template-archive-receipt.json`. Copying it did not execute the materializer or qualify its
tests. The seventy actual files live under `native/uncommitted-source/`.

Compose the ten registration snapshots semantically over the accepted current owners. Refresh only
current topology/root-manifest inputs after legitimate script changes; keep historical proof inputs
unchanged. No candidate dependency, Metro/Babel/Kit/Forge/cache owner was changed by this intake.

The controlling prepared-work entry points are:

* `future/native/archive20/prepared/` plus its source-only provenance: archive-inspection callers,
  not an extractor/publisher. The proposed root-dev yauzl 3.4.0 route is
  `future/native/yauzl/ROUTE.md`. No lock delta/install is accepted; the whole yauzl archive was not
  preserved and must be reacquired/authenticated for an actual lock-artifact audit.
* `future/native/apple/current/IOS-ENVIRONMENT.md` and
  `future/native/apple/current/RUBY-BOUNDARY-INDEPENDENT-REVIEW.md`, with the independent
  candidate-entry research and frozen primary sources. Corrected Node 24.16.0/Ruby 3.4.11/Bundler
  2.6.9/CocoaPods 1.16.2/xcodeproj 1.27.0 pins control. Xcode 27 compile preparation does not
  satisfy the separate Xcode 26.6/iOS 16.4 runtime or physical-floor proof. Older pins inside
  provenance are superseded.
* `future/react/plans/splotch-react-web-host-next-source-handoff.md`, its governing plan/partition/
  dispositions and `splotch-react25-source-integration-review.md`.
* `future/react/neutral53/{SOURCE-PREPARATION.md,source-only-receipt.json,semantic-merge.diff}` and
  its `prepared/`/frozen inputs; selected React25 source remains separately preserved. The combined
  packet predates the later retained cause-preservation correction. Preserve accepted current
  retained/configuration owners instead of restoring its entire old combined files.
* `future/react/dependency-route/ROUTE.md` and authenticated public archives. Proposed ReactDOM
  19.2.3/types are research with real future callers, not an installed graph or executed web host.

Neither native nor neutral React source has passed types, lifecycle, SSR/hydration, optimized
candidate compile/mount, graphics, upgrade or performance checks. Full candidate toolchain archives,
native libraries and private signing artifacts are absent. Qualification and execution remain future
reviewed units.

## Advisory audits to triage

Read `advisory-audits/REPORT-SNAPSHOT.md` and its selected-report inventory first. The readable
coordination and technical reports cover the campaign through the original pause summary at
2026-10-06T12:40:02.782Z. They recommend continuing the conditional investigation with corrections
and refining the existing parent/worker/rival arrangement. Their existence does not authorize
resumption or establish a new architectural decision.

The technical report's F1 reports a reachable-import declaration-guard counterexample: an entry
imports a new local helper that imports root-only `yaml`; the fixed-file guard and actual TypeScript
configuration reportedly pass. Verify and disposition this finding against current source before
candidate expansion. The campaign has not implemented a correction. Additional recommendations
include stronger future React pixel/tile/history recovery proof, actual runtime-budget disposition,
tool ownership and an accepted/pending evidence register.

These are bounded snapshots of eight final reports/indexes. Raw transcripts, audit scripts, detailed
reference ledgers and audit scratch are excluded; some report links refer to host-only evidence.
Coverage caveats include selective raw review, encrypted delegation text, missing official Claude
histories and absent historical system traces. Audit-only experiments are not campaign acceptance.

## Local-only state and observed limits

The old host still has these optional copies; the capsules above supply the selected portable bytes:

* `/Users/kylemit/Code/Splotch/logs/migration-pause-2026-10-06/`: original ignored backup. Its
  `checkpoint.json` is copied unchanged inside retained evidence and describes the original pause.
* `/Users/kylemit/.codex/worktrees/migration-retained-web/Splotch`: clean retained 8dd source.
* `/Users/kylemit/.codex/worktrees/migration-native-source/Splotch`: original uncommitted native70.
* Original Claude conversation and runner ledger/authentication under the user's provider-managed
  state. Their contents and credentials are not copied or committed.
* Parent Codex transcript
  `/Users/kylemit/.codex/sessions/2026/10/05/rollout-2026-10-05T20-17-33-01a10e92-a1ac-7610-a4f0-3769ecfd495c.jsonl`:
  host-local audit input, not required for source recovery and not included in this package.

No migration-owned build/browser process group remained live at the original pause. The checkpoint
does not reserve hardware. Fresh capture work must use the capture-session skills and current device
enumeration, rather than interpreting an earlier empty USB list as current state.

The accepted topology evidence is exact-head, but its nonproduction hosted observation retains only
bounded rendered provider-log information. It does not establish a complete raw log, production
publication, candidate native behavior or physical performance. All unfinished requirement families
remain visible in the progress checklist.
