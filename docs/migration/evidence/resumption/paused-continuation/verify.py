import hashlib
import json
import pathlib
import tarfile


def verify(root):
    manifest = json.loads((root / 'manifest.json.txt').read_text())
    member_count = 0
    for row in manifest['records']:
        data = (root / row['file']).read_bytes()
        assert len(data) == row['bytes'], row['file']
        assert hashlib.sha256(data).hexdigest() == row['sha256'], row['file']
    for artifact in manifest['artifacts']:
        data = (root / artifact['file']).read_bytes()
        assert len(data) == artifact['bytes'], artifact['file']
        assert hashlib.sha256(data).hexdigest() == artifact['sha256'], artifact['file']
        with tarfile.open(root / artifact['file'], 'r:gz') as archive:
            members = archive.getmembers()
            rows = artifact['entries']
            assert len(members) == len(rows), artifact['file']
            assert len({member.name for member in members}) == len(members)
            for member, row in zip(members, rows):
                relative = pathlib.PurePosixPath(member.name)
                assert not relative.is_absolute() and '..' not in relative.parts
                assert member.isreg() and member.name == row['member']
                assert member.size == row['bytes'] and member.mode == int(row['mode'], 8)
                assert hashlib.sha256(archive.extractfile(member).read()).hexdigest() == row['sha256']
                member_count += 1
    return {'artifacts': len(manifest['artifacts']), 'members': member_count, 'records': len(manifest['records'])}


if __name__ == '__main__':
    print(json.dumps(verify(pathlib.Path(__file__).resolve().parent)))
