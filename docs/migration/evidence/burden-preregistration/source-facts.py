import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

HEAD = 'ef3d1eb2070c1bd0dee620ed42a2b14201c2a9b4'
START = '2026-07-08T00:00:00Z'
END = '2026-10-06T15:00:00Z'
EXPECTED_TOTAL = 1246
EXPECTED_COMMIT_SET_SHA256 = '9d0f8b6faf9d8566baf6f25309c29cd68f085a2d87bac37f4041abe3e9be4df8'
ORIGINAL_BYTES = 2307408
ORIGINAL_SHA256 = '820a082c920cbe59e14d01ba126c106346d37ebe9b638d973255cf74f5954076'
EXAMPLE_COUNT = 3
EXPECTED_OLD_COUNTS = {
    'UI and behavior': 497,
    'dependency and toolchain': 334,
    'native binding and lifecycle': 74,
    'web security PWA and host': 62,
    'validation physical and release': 564,
}
OLD_PATTERNS = {
    'UI and behavior': r'^web/src/(lib/(components|state|drawing)/|routes/)',
    'dependency and toolchain': r'^(package.json|pnpm-lock.yaml|pnpm-workspace.yaml|tools/(install|netlify|worktree)|web/(svelte|vite)\.config)',
    'native binding and lifecycle': r'^(android/|ios/|capacitor.config.json|tools/mobile/)',
    'web security PWA and host': r'^web/(src/(service-worker|hooks|app\.html)|netlify\.toml|svelte\.config|vite\.config)',
    'validation physical and release': r'^(tools/(perf/|release/|ci-mirror/)|web/tests/|.github/workflows/)',
}
CATEGORIES = {
    'UI and behavior': {
        'include': [r'^web/src/lib/(components|state|drawing)/', r'^web/src/routes/'],
        'exclude': [r'^web/src/routes/(api|admin)(/|$)', r'^web/src/lib/components/admin/'],
        'trackedOwners': ['web/src/lib/components/', 'web/src/lib/state/', 'web/src/lib/drawing/', 'web/src/routes/'],
        'reason': 'Keep the original product UI/state/drawing/route subset, excluding API/admin routes and admin-only components. Tests under these paths remain counted as source changes and also overlap validation.',
    },
    'dependency and toolchain': {
        'include': [
            r'^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$',
            r'^web/(svelte\.config\.js|vite\.config\.ts)$',
            r'^tools/(bootstrap-worktree|check-netlify-cli|run-web-tool)\.mjs$',
            r'^\.github/actions/setup-pnpm/action\.yml$',
            r'^\.codex/cloud/(setup|maintenance)\.sh$',
            r'^\.claude/hooks/session-start\.sh$',
        ],
        'exclude': [],
        'trackedOwners': [
            'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
            'web/svelte.config.js', 'web/vite.config.ts',
            'tools/bootstrap-worktree.mjs', 'tools/check-netlify-cli.mjs', 'tools/run-web-tool.mjs',
            '.github/actions/setup-pnpm/action.yml', '.codex/cloud/setup.sh',
            '.codex/cloud/maintenance.sh', '.claude/hooks/session-start.sh',
        ],
        'reason': 'Replace nonexistent tools/install, tools/netlify and tools/worktree prefixes with finite tracked local/CI/cloud provisioning and invocation owners. Package metadata changes still include script edits, not only dependency upgrades.',
    },
    'native binding and lifecycle': {
        'include': [
            r'^(android/|ios/|tools/mobile/)', r'^capacitor\.config\.json$',
            r'^web/src/lib/(nativePlugin|secureStorage|installationId)(\.[^/]+)?\.ts$',
            r'^web/src/lib/(plugins|platform)/',
        ],
        'exclude': [],
        'trackedOwners': [
            'android/', 'ios/', 'tools/mobile/', 'capacitor.config.json',
            'web/src/lib/nativePlugin.ts', 'web/src/lib/secureStorage.ts',
            'web/src/lib/installationId.ts', 'web/src/lib/plugins/', 'web/src/lib/platform/',
        ],
        'reason': 'Add the web-side native plugin, secure-storage, installation identity, platform and plugin bridge owners, including their colocated tests.',
    },
    'web security PWA and host': {
        'include': [
            r'^web/src/(service-worker|hooks|app\.html)',
            r'^web/(netlify\.toml|svelte\.config\.js|vite\.config\.ts)$',
            r'^web/securityPolicy(\.[^/]+)?\.ts$', r'^web/src/lib/pwa/',
            r'^netlify\.toml$', r'^netlify/',
        ],
        'exclude': [],
        'trackedOwners': [
            'web/src/hooks.server.ts', 'web/src/app.html', 'web/netlify.toml',
            'web/svelte.config.js', 'web/vite.config.ts', 'web/securityPolicy.ts',
            'web/src/lib/pwa/', 'netlify.toml', 'netlify/',
        ],
        'reason': 'Add the actual CSP policy, PWA owners and root Netlify configuration/functions. This remains a named host/security subset, not all backend or web behavior.',
    },
    'validation physical and release': {
        'include': [
            r'^(tools/(perf/|release/|ci-mirror/)|web/tests/|\.github/workflows/)',
            r'^web/.*\.(test|spec)\.[^/]+$',
            r'^tools/(?:[^/]+/)*tests/',
            r'^tools/.*\.(test|spec)\.[^/]+$',
            r'^(fastlane/|releases/|\.maestro/)',
        ],
        'exclude': [],
        'trackedOwners': [
            'tools/perf/', 'tools/release/', 'tools/ci-mirror/', 'web/tests/', '.github/workflows/',
            'tools/tests/', 'fastlane/', 'releases/', '.maestro/',
        ],
        'reason': 'Retain actual tools/release owners and add web/root-web and tool colocated tests, tool test directories and tracked releases/store/native-smoke metadata. Fixture and test-support changes in tests directories are included.',
    },
}


def digest_bytes(value):
    return hashlib.sha256(value).hexdigest()


def set_digest(values):
    return digest_bytes(''.join(value + '\n' for value in sorted(set(values))).encode())


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], text=True).strip()


def matches(path, rule):
    return any(re.search(pattern, path) for pattern in rule['include']) and not any(
        re.search(pattern, path) for pattern in rule['exclude']
    )


def examples(commits, rule):
    return [
        {
            'sha': commit['sha'],
            'committedAt': commit['committedAt'],
            'subject': commit['subject'],
            'matchedPaths': sorted(path for path in commit['paths'] if matches(path, rule)),
        }
        for commit in commits[:EXAMPLE_COUNT]
    ]


def main():
    parser = argparse.ArgumentParser(description='Read pinned local Git history; write compact source-change facts.')
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    parser.add_argument('--output', type=Path, default=Path(__file__).with_suffix('.json'))
    parser.add_argument('--original', type=Path, help='Optional explicit immutable raw receipt verification')
    parser.add_argument('--disposition-output', type=Path, default=Path(__file__).with_name('burden-facts-v2-disposition.json'))
    args = parser.parse_args()
    paths = [args.output.resolve(), args.disposition_output.resolve(), Path(__file__).resolve()]
    if args.original is not None:
        paths.append(args.original.resolve())
    if len(set(paths)) != len(paths):
        raise ValueError('Outputs must be distinct and cannot overwrite original receipt or script')
    if git(args.repo, 'rev-parse', '--verify', HEAD + '^{commit}') != HEAD:
        raise ValueError('Pinned source commit is unavailable')
    original_bytes = None
    original = None
    if args.original is not None:
        original_bytes = args.original.read_bytes()
        if len(original_bytes) != ORIGINAL_BYTES or digest_bytes(original_bytes) != ORIGINAL_SHA256:
            raise ValueError('Original immutable receipt identity differs')
        original = json.loads(original_bytes)
        if (original['head'], original['startInclusive'], original['endInclusive']) != (HEAD, START, END):
            raise ValueError('Original receipt scope differs')
    log_args = ['log', '--first-parent', '--since=' + START, '--until=' + END,
                '--format=%x1e%H%x1f%cI%x1f%s', '--name-only', HEAD]
    commits = []
    for chunk in git(args.repo, *log_args).split('\x1e'):
        if not chunk.strip():
            continue
        lines = chunk.strip().splitlines()
        sha, date, subject = lines[0].split('\x1f', 2)
        commits.append({'sha': sha, 'committedAt': date, 'subject': subject,
                        'paths': [line for line in lines[1:] if line]})
    if len(commits) != EXPECTED_TOTAL or set_digest(commit['sha'] for commit in commits) != EXPECTED_COMMIT_SET_SHA256:
        raise ValueError('Pinned history no longer reproduces the registered commit set')
    if original is not None and commits != original['commits']:
        raise ValueError('Pinned history differs from original commit/path rows')
    tracked_paths = git(args.repo, 'ls-tree', '-r', '--name-only', HEAD).splitlines()
    categories = {}
    changes = {}
    for name, rule in CATEGORIES.items():
        for owner in rule['trackedOwners']:
            if not any(path.startswith(owner) if owner.endswith('/') else path == owner for path in tracked_paths):
                raise ValueError('Category owner is not tracked at the anchor: ' + owner)
        matching = [commit for commit in commits if any(matches(path, rule) for path in commit['paths'])]
        old_matching = [commit for commit in commits if any(re.search(OLD_PATTERNS[name], path) for path in commit['paths'])]
        if len(old_matching) != EXPECTED_OLD_COUNTS[name]:
            raise ValueError('Original category count does not reproduce: ' + name)
        old_set = {commit['sha'] for commit in old_matching}
        new_set = {commit['sha'] for commit in matching}
        added = [commit for commit in matching if commit['sha'] not in old_set]
        removed = [commit for commit in old_matching if commit['sha'] not in new_set]
        matched_paths = {path for commit in matching for path in commit['paths'] if matches(path, rule)}
        categories[name] = {
            'includePathPatterns': rule['include'], 'excludePathPatterns': rule['exclude'],
            'trackedOwnersAtAnchor': rule['trackedOwners'],
            'touchedFirstParentCommits': len(matching),
            'commitSetSha256': set_digest(new_set),
            'distinctMatchedPaths': len(matched_paths),
            'matchedPathSetSha256': set_digest(matched_paths),
            'recentExamples': examples(matching, rule),
        }
        changes[name] = {
            'originalCount': len(old_matching), 'correctedCount': len(matching),
            'addedCount': len(added), 'removedCount': len(removed),
            'originalCommitSetSha256': set_digest(old_set),
            'addedCommitSetSha256': set_digest(commit['sha'] for commit in added),
            'removedCommitSetSha256': set_digest(commit['sha'] for commit in removed),
            'reason': rule['reason'],
            'addedExamples': examples(added, rule),
            'removedExamples': examples(removed, {'include': [OLD_PATTERNS[name]], 'exclude': []}),
        }
    result = {
        'schema': 'splotch-pinned-source-change-subsets-v2',
        'scope': 'Overlapping first-parent source-change frequency for finite named path subsets; not complete maintenance incidents, measured effort, future cadence or projected savings.',
        'head': HEAD, 'startInclusive': START, 'endInclusive': END,
        'firstParentCommits': len(commits),
        'firstParentCommitSetSha256': set_digest(commit['sha'] for commit in commits),
        'method': {
            'gitArguments': log_args,
            'pathBasis': 'Exactly the nonempty path lines emitted by git log --name-only; includes features, tests, metadata and historical deleted/renamed paths. Default merge/path semantics retained from the original receipt; an empty merge path list contributes only to the total.',
            'matching': 'Python re.search; match any include and no exclude. A commit counts once within each category and may count in several categories. Subsets are deliberately not exhaustive.',
            'setHash': 'SHA256 of unique full identifiers sorted lexicographically, each followed by LF, UTF-8; empty set hashes empty bytes.',
            'examples': 'Most recent three matching commits in the returned Git log order; matched paths only, no unrelated full commit-path dump.',
            'reproduction': 'Pinned head, time window, expected commit-set hash, old counts and category definitions are fixed. The local repository defaults to the current directory; only local repository/input/output paths are configurable. No raw receipt is required. An explicit --original additionally verifies all raw commit/path rows without changing the compact result. No network, checkout, installation or source mutation.',
            'scriptSha256': digest_bytes(Path(__file__).read_bytes()),
        },
        'categories': categories,
    }
    disposition = {
        'head': HEAD, 'startInclusive': START, 'endInclusive': END,
        'scope': 'Finite old-to-new classification corrections; no burden-policy arithmetic or effort estimate.',
        'categories': changes,
    }
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    args.disposition_output.write_text(json.dumps(disposition, indent=2) + '\n')
    if args.original is not None and args.original.read_bytes() != original_bytes:
        raise ValueError('Original receipt changed during execution')
    print(json.dumps({'firstParentCommits': len(commits),
                      'counts': {name: row['touchedFirstParentCommits'] for name, row in categories.items()},
                      'outputBytes': args.output.stat().st_size,
                      'outputSha256': digest_bytes(args.output.read_bytes()),
                      'dispositionBytes': args.disposition_output.stat().st_size}, sort_keys=True))


if __name__ == '__main__':
    main()
