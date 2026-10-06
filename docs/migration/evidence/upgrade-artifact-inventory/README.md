# Upgrade artifact and legacy-owner inventory

Parent-owned records unit over f14966ee98563e3c569fbcb90beea6d9c684614a. Scoped execution completed.
Original Claude round one found two blocking evidence defects and two suggestions, all confirmed and
addressed in the current revision. Changed-head independent review, final-head CI and integration
are pending. All continuity, installed-graph, signing/channel and physical acceptance remains
pending.

The complete native release/tag responses, exact download/reader producers and their receipts
preserve eight tag identities and ten actual published binary identities. The native GitHub
connector supports UTF-8 resources, so it cannot export native binary assets; the qualified `gh`
download fallback used the existing host login without exporting authentication state. Every
downloaded asset matched the complete API size/SHA-256 assertion. The existing production readers
returned the literal embedded versions documented in [UPGRADES.md](../../UPGRADES.md).

Four Android tag labels differ from their attached binary versions. The v1.0.0/v1.0.1 assets are
identical; v1.2.0 has no assets. Matching embedded versions at v1.4.0–v1.6.0 do not prove compiled
source, installed graph, signing identity or distribution history. Conservative tag fixtures and
actual binary variants remain in scope pending those associations.

[manifest.json.txt](manifest.json.txt) binds each copied producer/receipt and the complete
[tag-owners.tar.gz](tag-owners.tar.gz) capsule. The capsule contains 385 regular members, including
364 actual selected Git blobs / 6,374,883 bytes, the complete 1,199-row searched-source identity
scope, three executed source-inventory producers/logs and their intended/restored controls. Every
selected blob was compared with actual Git bytes, and every capsule member was reopened and verified
for path, size, mode and SHA-256. [The source report](tag-owner-report.md.txt) retains exact
historical owner paths/line anchors and limits. No published AAB/IPA or raw conversation is inside
the capsule. Actual public binary bytes remain durably preserved in
`logs/migration-resumption-01a111b0/continuity-intake/artifacts/`; their exact public asset IDs,
sizes/digests and URLs remain recoverable through the complete metadata receipts.

The oldest persistent core and root-version-excluded lock graph match. Real build-script, new
asset-stripper and Gradle version differences remain; whole native builds/services are not
collapsed. Both released pack implementations use appVersion-resolution directories, and their
status calls can delete other versions. Non-destructive legacy enumeration must precede a
replacement status/cleanup operation. Historical admin slots, v1.5 lock-source discrepancies and
missing committed Android resolved locks remain explicit qualification obligations. The separate
[source-owner amendment](tag-owner-amendment.md.txt) corrects the immutable source report's
incomplete iOS launch description: a released pending-job/version mismatch can delete the entire old
namespace before JavaScript starts. Its [six exact anchors](ios-launch-owner-amendment.json.txt)
bind both released tags and the accepted integration behavior. Reused launch callbacks must defer
destructive reconciliation until preservation completes.

The envelope separates the original composer's 15-file/capsule scope from the 11 later parent
additions and the current [dated repair invocation](round1-repairs.json.txt). Its saved
[producer](repair-upgrade-round1.py.txt) verified the prior published 26-file envelope before
changing representations and metadata links. The original manifest remains recoverable at its
recorded reviewed Git object; no later row is attributed to the earlier composer invocation. The
[actual complete ADR response](live-records-adr-native.json.txt) now carries run 37497449897. The
prior mislabeled response is preserved byte-for-byte as a
[pre-integration PR snapshot](live-records-pr-before-integration-native.json.txt). The
[complete records Quality response](live-records-quality-native.json.txt.gz) preserves exact
original native JSON and its nested decoded log through standard gzip. This removes a false
device-identifier match on a GitHub pnpm registry token without editing content or weakening the
guard. First-head CI's intended repository guard failed; that failure remains separate from the
later repaired-head pass required for integration.

The original real AAB/IPA EOCD mutation receipts remain unchanged. A later
[complete saved producer](qualify-reader-controls-final.mjs.txt) and
[separate invocation receipt](reader-controls-final.json.txt) fill the missing standalone-producer
provenance: both real positives pass; each owned one-signature mutation fails for the exact
invalid-ZIP reason; restored exact bytes pass. Unchanged released reader hashes and Git state are
bound before/after. This qualifies invalid-ZIP refusal only. Historical tag mismatches are real
findings and were not counted as controls. Wrong-tag identity, missing storage owner and real
wrong-source-byte controls inside the capsule refuse for their distinct recorded predicates and pass
after restoration.

Verify the envelope before extracting into an absent owned records directory. This example reads and
checks all members without writing source:

```sh
python3 - <<'PY'
import gzip, hashlib, json, tarfile
from pathlib import Path
root = Path('docs/migration/evidence/upgrade-artifact-inventory')
manifest = json.loads((root / 'manifest.json.txt').read_bytes())
capsule = root / manifest['capsule']['path']
assert hashlib.sha256(capsule.read_bytes()).hexdigest() == manifest['capsule']['sha256']
rows = {row['path']: row for row in manifest['memberManifest']}
with tarfile.open(capsule, 'r:gz') as archive:
    members = archive.getmembers()
    assert len(members) == len(rows)
    assert {member.name for member in members} == set(rows)
    for member in members:
        row = rows[member.name]
        assert member.isfile() and not member.name.startswith('/')
        assert '..' not in Path(member.name).parts
        assert member.size == row['bytes'] and member.mode == int(row['mode'], 8)
        assert hashlib.sha256(archive.extractfile(member).read()).hexdigest() == row['sha256']
for row in manifest['files']:
    raw = (root / row['path']).read_bytes()
    assert len(raw) == row['bytes']
    assert hashlib.sha256(raw).hexdigest() == row['sha256']
    if 'uncompressedBytes' in row:
        decoded = gzip.decompress(raw)
        assert len(decoded) == row['uncompressedBytes']
        assert hashlib.sha256(decoded).hexdigest() == row['uncompressedSha256']
PY
```

The original producers use their recorded owned roots and exact input/base identities. Do not
execute them against current app source or overwrite their historical receipts. Inspect capsule
source and create an owned replay directory when reproducing. Tag source can be checked directly
through its exact Git blob IDs; changing the parent does not invalidate immutable legacy bytes, but
it cannot relabel earlier execution identities.

The supplemental [F1 publication/CI receipt](f1-final-head-ci-e4e9.json.txt) and
[complete Quality export](f1-quality-e4e9-complete.log.txt.gz) preserve its later head and CI
without moving its tested implementation source. The standard gzip has the exact original decoded
bytes, including whitespace; the envelope records compressed/uncompressed identities and maps the
receipt’s original producer-relative logPath. Acceptance remains held at the original three-round
budget. The saved final documentation-gate receipt keeps its recorded Markdown/index scope; later
citation-only edits pass scoped formatting/reference checks.

Inventory evidence does not replace same-ID reads, ordered transactions, old installed graph,
held-picture continuity from applicable unreleased source, background-job reconciliation, physical
accessibility, signed upgrades or final architecture/product/release acceptance.
