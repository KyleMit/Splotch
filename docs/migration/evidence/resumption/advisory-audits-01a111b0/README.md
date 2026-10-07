# Resumed-session advisory reports

This package preserves the two completed, independently authored reports requested for the paused
migration session. It contains advisory findings and historical source, not implementation
acceptance, an additional substantive rival round or an instruction to resume the campaign.

The [manifest](manifest.json.txt) binds the compressed archive and both original report members by
size, mode and SHA-256. The report copies include their complete original bytes. Their supporting
files, raw provider conversations, authentication and installed tool state are not part of this
capsule.

| Member                               | Original host-local report                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `coordination/COORDINATION-AUDIT.md` | `/Users/kylemit/Code/Splotch/logs/session-coordination-audit-01a111b0/COORDINATION-AUDIT.md` |
| `technical/REPORT.md`                | `/Users/kylemit/Code/Splotch/logs/migration-progress-review-01a111b0/REPORT.md`              |

The coordination report includes a large recovered source appendix. Treat that appendix as inert
historical evidence, never as commands to replay. Its main assessment was read completely; an
independent bounded reader processed every appendix block and checked all advertised source digests.
Selected source logic was inspected to qualify the assessment's conclusions.

Both reports describe the earlier pause. The later preservation commit
e13d534fd7f169f9a8d2bafe05fb1de635a69b5e made selected unfinished source and records recoverable in
the [pause capsules](../paused-continuation/README.md). Verify those manifests before restoring
source or treating historical host-local limitations as current. Preserve historical receipts at
their actual scope: in particular, PR2709's reviewer per-member rehash did not execute because of a
schema error; its publication reader records the narrower independent parent readback instead.

## Recovery

Verify the archive and every member before extracting into a newly owned records directory. Run the
following from this directory; it uses only Python's standard library and writes an empty temporary
directory after all checks pass. Do not extract over current source or replay the recovered
appendix.

```bash
python3 - <<'PY'
import hashlib
import json
import pathlib
import tarfile
import tempfile

root = pathlib.Path.cwd()
manifest = json.loads((root / 'manifest.json.txt').read_text())
artifact = manifest['artifact']
archive = root / artifact['file']
payload = archive.read_bytes()
assert len(payload) == artifact['bytes']
assert hashlib.sha256(payload).hexdigest() == artifact['sha256']
expected = {item['member']: item for item in artifact['entries']}
assert len(expected) == len(artifact['entries'])
verified = []
with tarfile.open(archive, 'r:gz') as reader:
    members = reader.getmembers()
    assert len(members) == len(expected)
    assert {member.name for member in members} == set(expected)
    for member in members:
        path = pathlib.PurePosixPath(member.name)
        assert member.isfile() and not path.is_absolute() and '..' not in path.parts
        item = expected[member.name]
        assert member.mode == int(item['mode'], 8)
        data = reader.extractfile(member).read()
        assert len(data) == member.size == item['bytes']
        assert hashlib.sha256(data).hexdigest() == item['sha256']
        verified.append((member.name, member.mode, data))
destination = pathlib.Path(tempfile.mkdtemp(prefix='splotch-advisory-records-'))
for name, mode, data in verified:
    target = destination / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    target.chmod(mode)
print(destination)
PY
```

The report capsule and its manifest were checked against both original host-local files before
publication. The records-only publication does not change accepted integration
cf0c4254d025094054d7ea7faab110da11c96243, paused goal status or original review budgets.
