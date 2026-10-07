# Paused continuation recovery

The maintainer paused the migration after accepted integration
cf0c4254d025094054d7ea7faab110da11c96243 and explicitly requested durable records for a new session.
This additive package preserves selected unfinished source and technical evidence from Codex
chat01a111b0-d64d-7c22-ab7d-865db89de7e2. The
[handoff](../../../../handoff/native-migration-continuation.md) owns the next authorized
continuation. The campaign remains paused and unfinished. Preservation does not accept an
implementation.

## Contents

The [manifest](manifest.json.txt) binds every outer capsule and member by safe relative path,
source, byte count, SHA256 and mode. Absolute paths are old-host provenance; member paths are
portable.

| Capsule                          | Scope                                                                                                                                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `neutral-source.tar.gz`          | Exact50 staged working files at acceptedcf0; source-only/unaccepted.                                                                                                                                                                                        |
| `legacy-source.tar.gz`           | Exact47 changed files at b3 with the real pending78d merge, including source repairs and accepted incoming records. Currentcf0 is not composed.                                                                                                             |
| `neutral-records.tar.gz`         | Complete selected168-file final pause mirror: source, composition receipts, recorder and installed-membership failures, diagnosis, plans and release.                                                                                                       |
| `legacy-records.tar.gz`          | Complete latest failed-scope record set and prior59-source full gates; original round-two technical review; selected fixture/signing/service preparation and source freeze metadata. Installed source copies are excluded.                                  |
| `neutral-original-review.tar.gz` | Original8c round-one public technical session/done/findings/result, at its historical d140-to-d140 scope; no current source acceptance.                                                                                                                     |
| `native-records.tar.gz`          | Repaired70 source capsule and followup; unapplied78d composition/runtime plans; original round-two technical findings; failed DYLD/runtime receipts and separate pure outcomes; Java21 first-manifest failure/pure readback and complete official metadata. |

`git-frontiers.tar.gz` preserves the exact eight status/index/binary-diff captures as data, avoiding
a large generated diff in the human-readable records. Its members retain the prior standalone
identities.

`LIVE-UNITS.json.txt`, `PAUSED-FRONTIER.json.txt` and the earlier worktree/GitHub snapshots preserve
their original bytes. They describe the earlier host-local pause. `current-worktrees.json.txt`,
`live-github.json.txt` and `live-remote-refs.txt` are the later preservation observation. Git
status, semantic index and binary diffs for both unfinished source units accompany the capsules.
These are recovery data, not permission to restore provider Git administration or to overwrite
accepted owners.

The L0 historical74-row source manifest includes existing installed source; its source copies have
preservation modes different from original working modes. The new47-file snapshot captures actual
working source modes. The dependency tree is deliberately excluded and must be reproduced and
qualified through the reviewed install route. The native tree7da identity is not a commit, and
current native registration must be composed over accepted current owners.

## Verify and recover

Run the read-only [verifier](verify.py) before extraction. It does not import or execute prepared
source. It checks all manifest records, outer hashes, complete archive membership, safe regular
paths, member bytes/modes. Independent local preservation checks also compared selected original
source bytes.

```sh
python3 docs/migration/evidence/resumption/paused-continuation/verify.py
```

Extract only the needed verified capsules into a newly owned empty directory. Do not overlay source
snapshots onto a checkout or execute stored controllers without fresh qualification.

```sh
splotch_pause_records=$(mktemp -d "${TMPDIR:-/tmp}/splotch-paused-records.XXXXXX")
tar -xzf docs/migration/evidence/resumption/paused-continuation/neutral-records.tar.gz -C "$splotch_pause_records"
tar -xzf docs/migration/evidence/resumption/paused-continuation/legacy-records.tar.gz -C "$splotch_pause_records"
tar -xzf docs/migration/evidence/resumption/paused-continuation/native-records.tar.gz -C "$splotch_pause_records"
```

Use a separate owned empty directory for each source snapshot because both use the `source/` prefix.
The N1 nested source-packet.tar.gz has its original frozen70-row manifest beside it; verify those
inner members before composing it. Original continuation capsules remain unchanged and supply
earlier prepared archives/plans and advisory reports.

## Limits and provenance

Private provider conversations, actual review ledgers, authentication, raw rival NDJSON/activity,
real signing material, installed trees and caches are excluded. Original Claude state must remain
available on the resuming host; public review metadata cannot replace it or reset budgets. Source
and historical evidence retain distinct acceptance scopes. Unselected historical records remain
host-local or in earlier published units; this package does not claim to export the entire
transcript or host.

Last release/process receipts describe recorded owned handles, not current stop authority. Acquire
fresh leases before shared-host/device work. No fresh device availability or
native/runtime/physical/ signed-channel acceptance follows from preservation. Latest L0 scoped
failures are unintended and remain unresolved; historical full gates do not pass the changed final
source. No actual React host recovery or optimized RN compile/mount/draw was established.

The [validation receipt](validation.json.txt) records the package checks. The records-only branch
must be pushed before a receiving session relies on it. Read the actual branch/ref state rather than
assuming local tracking refs for deleted merged branches are remote branches.
