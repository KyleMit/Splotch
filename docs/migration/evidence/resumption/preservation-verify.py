import collections
import datetime
import hashlib
import json
import pathlib
import subprocess
import tarfile

SOURCE = pathlib.Path('/Users/kylemit/Code/Splotch')
ROOT = SOURCE / 'docs/migration/evidence/continuation'
OUT = pathlib.Path('/private/tmp/splotch-resume-01a111b0/preservation')
CHECKPOINT = '63c5f2f45a463774f50455041174f075abaa4af2'
manifest_path = ROOT / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
receipt = {
    'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'checkpoint': CHECKPOINT,
    'acceptedParent': manifest['acceptedParent'],
    'manifestSha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
    'scope': 'Preservation verification only; no application or candidate acceptance',
    'artifacts': [],
    'worktrees': [],
}

def git(*args, cwd=SOURCE):
    return subprocess.run(['git', *args], cwd=cwd, capture_output=True, check=True)

assert manifest_path.read_bytes() == git('show', f'{CHECKPOINT}:docs/migration/evidence/continuation/manifest.json').stdout
receipt['manifestMatchesCheckpoint'] = True

for artifact in manifest['artifacts']:
    path = ROOT / artifact['file']
    data = path.read_bytes()
    assert len(data) == artifact['bytes'], artifact['file']
    assert hashlib.sha256(data).hexdigest() == artifact['sha256'], artifact['file']
    assert data == git('show', f'{CHECKPOINT}:docs/migration/evidence/continuation/{artifact["file"]}').stdout
    verified = {
        'file': artifact['file'],
        'kind': artifact['kind'],
        'bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
        'matchesCheckpoint': True,
    }
    if artifact['kind'] == 'git-bundle':
        heads = git('bundle', 'list-heads', str(path)).stdout.decode().strip()
        assert heads == f'{artifact["head"]} {artifact["ref"]}'
        header = data[:data.index(b'\n\n')].decode()
        prerequisites = [line.split()[0][1:] for line in header.splitlines() if line.startswith('-')]
        assert prerequisites == [artifact['prerequisite']]
        verification = git('bundle', 'verify', str(path))
        verified.update(head=artifact['head'], ref=artifact['ref'], prerequisites=prerequisites,
                        verificationStdout=verification.stdout.decode(), verificationStderr=verification.stderr.decode())
    elif artifact['kind'] == 'tar.gz':
        with tarfile.open(path, 'r:gz') as archive:
            members = archive.getmembers()
            rows = artifact['entries']
            assert len(members) == len(rows)
            assert len({member.name for member in members}) == len(members)
            total = 0
            original_counts = collections.Counter()
            original_drift = []
            for member, row in zip(members, rows):
                relative = pathlib.PurePosixPath(member.name)
                assert not relative.is_absolute() and '..' not in relative.parts
                assert '\\' not in member.name and '\x00' not in member.name
                assert member.isreg() and member.name == row['member']
                assert member.size == row['bytes'] and member.mode == int(row['mode'], 8)
                member_bytes = archive.extractfile(member).read()
                assert hashlib.sha256(member_bytes).hexdigest() == row['sha256']
                total += len(member_bytes)
                original = pathlib.Path(row['source'])
                if not original.is_file():
                    status = 'absent'
                else:
                    status = 'match' if hashlib.sha256(original.read_bytes()).hexdigest() == row['sha256'] else 'changed'
                original_counts[status] += 1
                if status != 'match':
                    original_drift.append({'member': member.name, 'source': row['source'], 'status': status, 'category': row['category']})
            assert total == artifact['logicalBytes']
            verified.update(memberCount=len(members), logicalBytes=total, safeRegularMembers=True,
                            originalSourceStatus=dict(original_counts), originalSourceDrift=original_drift)
    else:
        raise AssertionError(artifact['kind'])
    receipt['artifacts'].append(verified)

for worktree in [SOURCE,
                 pathlib.Path('/Users/kylemit/.codex/worktrees/migration-retained-web/Splotch'),
                 pathlib.Path('/Users/kylemit/.codex/worktrees/migration-native-source/Splotch'),
                 pathlib.Path('/Users/kylemit/.codex/worktrees/migration-native-topology/Splotch')]:
    receipt['worktrees'].append({
        'path': str(worktree),
        'head': git('rev-parse', 'HEAD', cwd=worktree).stdout.decode().strip(),
        'statusPorcelain': git('status', '--porcelain=v1', cwd=worktree).stdout.decode(),
    })
receipt['refs'] = {
    ref: git('rev-parse', '--verify', ref).stdout.decode().strip()
    for ref in ['origin/codex/native-migration', 'origin/codex/migration-continuation-records',
                'codex/migration-retained-web-host']
}
receipt['passed'] = True
(OUT / 'verification.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({
    'passed': True,
    'receipt': str(OUT / 'verification.json'),
    'artifactCount': len(receipt['artifacts']),
    'memberCount': sum(a.get('memberCount', 0) for a in receipt['artifacts']),
    'artifacts': [{k:v for k,v in a.items() if k not in ['verificationStdout','verificationStderr','originalSourceDrift']} for a in receipt['artifacts']],
    'worktrees': receipt['worktrees'],
    'refs': receipt['refs'],
}, indent=2))
