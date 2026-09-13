import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import {
  checkColoringPackRetention,
  readSnapshots,
  retentionBreaks,
  retentionProblems,
  snapshotFromManifest,
} from '../lib/coloring-pack-retention.mjs';

const fixtures = [];

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function staticTree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'splotch-pack-retention-'));
  fixtures.push(dir);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
  return dir;
}

const digest = (contents) => createHash('sha256').update(contents).digest('hex');

function snapshot(appVersion, files) {
  return { ref: `v${appVersion}`, appVersion, books: [{ id: 'space', files }] };
}

describe('snapshotFromManifest', () => {
  const file = (path, sha256, downloadPath) => ({ path, downloadPath, bytes: 1, sha256 });
  const manifest = {
    appVersion: '9.9.0',
    starterBookId: 'farm',
    books: [
      {
        id: 'farm',
        variants: {
          full: { files: [file('/coloring/farm/cow.svg', 'f')] },
          compact: { files: [] },
        },
      },
      {
        id: 'space',
        variants: {
          full: { files: [file('/coloring/space/rocket.webp', 'a')] },
          compact: {
            files: [
              file('/coloring/space/rocket.webp', 'b', '/coloring/max-1152px/space/rocket.webp'),
            ],
          },
        },
      },
    ],
  };

  it('keeps every download path a non-starter book requests across both variants', () => {
    expect(snapshotFromManifest(manifest, { ref: 'v9.9.0', commit: 'c' })).toEqual({
      ref: 'v9.9.0',
      commit: 'c',
      appVersion: '9.9.0',
      starterBookId: 'farm',
      books: [
        {
          id: 'space',
          files: {
            '/coloring/max-1152px/space/rocket.webp': 'b',
            '/coloring/space/rocket.webp': 'a',
          },
        },
      ],
    });
  });

  it('rejects one download path addressed with two digests', () => {
    const conflicting = structuredClone(manifest);
    conflicting.books[1].variants.compact.files[0].downloadPath = undefined;
    expect(() => snapshotFromManifest(conflicting, { ref: 'v', commit: 'c' })).toThrow(
      /two digests/
    );
  });
});

describe('retentionBreaks', () => {
  it('reports addressed files that are missing or no longer byte-identical', () => {
    const staticDir = staticTree({
      'coloring/space/kept.webp': 'kept',
      'coloring/space/regenerated.webp': 'new bytes',
    });
    const breaks = retentionBreaks(
      snapshot('1.0.0', {
        '/coloring/space/kept.webp': digest('kept'),
        '/coloring/space/regenerated.webp': digest('old bytes'),
        '/coloring/space/deleted.webp': digest('gone'),
      }),
      { staticDir }
    );
    expect(breaks).toEqual([
      { bookId: 'space', downloadPath: '/coloring/space/regenerated.webp', reason: 'changed' },
      { bookId: 'space', downloadPath: '/coloring/space/deleted.webp', reason: 'missing' },
    ]);
  });
});

describe('retentionProblems', () => {
  const broken = (appVersion, count) => ({
    snapshot: snapshot(appVersion, {}),
    breaks: Array.from({ length: count }, (_, index) => ({ downloadPath: `/coloring/${index}` })),
  });

  it('fails a release that is not pinned as known-broken', () => {
    expect(retentionProblems([broken('1.0.0', 2)], {})).toEqual([
      '1.0.0: 2 manifest-addressed file(s) no longer served (first: /coloring/0)',
    ]);
  });

  it('accepts a pinned release only at its exact broken count', () => {
    expect(retentionProblems([broken('1.0.0', 3)], { '1.0.0': 3 })).toEqual([]);
    expect(retentionProblems([broken('1.0.0', 4)], { '1.0.0': 3 })).toHaveLength(1);
    expect(retentionProblems([broken('1.0.0', 2)], { '1.0.0': 3 })).toHaveLength(1);
  });

  it('fails a pin that names no snapshot', () => {
    expect(retentionProblems([], { '1.0.0': 3 })).toEqual([
      '1.0.0: pinned as known-broken but has no snapshot',
    ]);
  });
});

it('serves every file a released native app downloads', () => {
  expect(checkColoringPackRetention().problems).toEqual([]);
});

function git(args) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

function packReleaseTags() {
  return git(['tag', '--list', 'v*'])
    .stdout.split('\n')
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
    .filter((tag) => git(['cat-file', '-e', `${tag}:web/coloringPackManifest.ts`]).status === 0);
}

const tags = packReleaseTags();

// CI's shallow checkout carries no tags, so this half only runs where they exist.
it.skipIf(tags.length === 0)('snapshots every release tag that ships coloring packs', () => {
  const snapshots = new Map(readSnapshots().map((entry) => [entry.ref, entry.commit]));
  const commits = tags.map((tag) => [tag, git(['rev-parse', `${tag}^{commit}`]).stdout.trim()]);
  expect(Object.fromEntries(commits.map(([tag]) => [tag, snapshots.get(tag)]))).toEqual(
    Object.fromEntries(commits)
  );
});
