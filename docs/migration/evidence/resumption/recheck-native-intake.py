import datetime
import hashlib
import json
import stat
import subprocess
from pathlib import Path

REPO = Path('/Users/kylemit/Code/Splotch')
NATIVE = Path('/Users/kylemit/.codex/worktrees/migration-native-source/Splotch')
MANIFEST = REPO / 'docs/migration/evidence/continuation/manifest.json'
OUTPUT = Path('/private/tmp/splotch-resume-01a111b0/preservation/native-intake-recheck.json.txt')
manifest_bytes = MANIFEST.read_bytes()
manifest = json.loads(manifest_bytes)
artifact = next(a for a in manifest['artifacts'] if a['file'] == 'native-source-snapshot.tar.gz')
prefix = 'native/uncommitted-source/'
entries = [e for e in artifact['entries'] if e['member'].startswith(prefix)]
assert len(entries) == 70
rows = []
for entry in entries:
    relative = entry['member'][len(prefix):]
    path = NATIVE / relative
    assert not path.is_symlink(), relative
    data = path.read_bytes()
    mode = format(stat.S_IMODE(path.stat().st_mode), '04o')
    digest = hashlib.sha256(data).hexdigest()
    matches = len(data) == entry['bytes'] and mode == entry['mode'] and digest == entry['sha256']
    rows.append({'path': relative, 'partition': entry['partition'], 'bytes': len(data),
                 'mode': mode, 'sha256': digest, 'matchesManifest': matches})
    assert matches, relative
result = {
    'scope': 'Live preserved source bytes and exact modes only; no compile, execution or acceptance.',
    'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'manifestSha256': hashlib.sha256(manifest_bytes).hexdigest(),
    'worktree': str(NATIVE),
    'head': subprocess.check_output(['git', '-C', str(NATIVE), 'rev-parse', 'HEAD'], text=True).strip(),
    'rows': rows,
}
OUTPUT.write_text(json.dumps(result, indent=2) + '\n')
print('70/70 live preserved bytes and modes match; wrote ' + str(OUTPUT))
