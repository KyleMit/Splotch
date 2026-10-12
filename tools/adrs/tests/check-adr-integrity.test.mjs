import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkAdrIntegrity } from '../check-adr-integrity.mjs';
import { ADR_DIR } from '../lib/adr-integrity.mjs';

const checkoutRoot = join(import.meta.dirname, '..', '..', '..');

const MINE_TAKES_THEIRS = { number: '0002', baseFile: '0002-theirs.md', headFile: '0002-mine.md' };
const MINE_TAKES_THEIRS_PROBLEM =
  'ADR number 0002 is already taken on main by 0002-theirs.md; this branch adds 0002-mine.md';
const CLEAN = { warnings: [], collisions: [], problems: [] };

// Older than splitIndex.sharedIndexExpire's two-week default, so a shared-index
// write in this repository would expire it.
const AGED_SHARED_INDEX_MS = 30 * 24 * 60 * 60 * 1000;

let scratch;
let repo;

const git = (...args) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const recordPath = (file) => join(repo, ADR_DIR, file);

function writeRecord(file, title = file) {
  writeFileSync(recordPath(file), `# ADR-${file.slice(0, 4)}: ${title}\n`);
}

// One canonical row per record, so an index problem cannot stand in for the
// numbering verdict a test asserts.
function writeIndex(...files) {
  const rows = files.map((file) => `| [${file.slice(0, 4)}](${file}) | ${file} | Active |\n`);
  writeFileSync(recordPath('README.md'), rows.join(''));
}

function commitAll(message) {
  git('add', '-A');
  git('commit', '-q', '-m', message);
}

function addMine() {
  writeRecord('0002-mine.md');
  writeIndex('0001-one.md', '0002-mine.md');
}

function moveRecord(from, to) {
  renameSync(recordPath(from), recordPath(to));
}

const check = (baseRef = 'main') => checkAdrIntegrity({ baseRef, root: repo });

// The host's git identity, signing, and ignore files stay out of the fixture
// and of the checker's own git calls, as does command-scope config inherited
// from an enclosing git process.
function isolateGit() {
  const gitconfig = join(scratch, 'gitconfig');
  writeFileSync(gitconfig, '[user]\n\tname = t\n\temail = t@t\n');
  vi.stubEnv('HOME', scratch);
  vi.stubEnv('XDG_CONFIG_HOME', scratch);
  vi.stubEnv('GIT_CONFIG_GLOBAL', gitconfig);
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  vi.stubEnv('GIT_CONFIG_COUNT', undefined);
  vi.stubEnv('GIT_CONFIG_PARAMETERS', undefined);
}

// `feature` branches from main before main gains 0002-theirs.md, and stays
// checked out: a branch behind its base, whose working tree lacks the record
// the base took 0002 for.
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'adr-integrity-'));
  isolateGit();
  repo = join(scratch, 'repo');
  mkdirSync(join(repo, ADR_DIR), { recursive: true });
  git('init', '-q', '-b', 'main');
  writeRecord('0001-one.md');
  writeIndex('0001-one.md');
  commitAll('base');
  git('branch', 'feature');
  writeRecord('0002-theirs.md');
  writeIndex('0001-one.md', '0002-theirs.md');
  commitAll('theirs');
  git('checkout', '-q', 'feature');
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(scratch, { recursive: true, force: true });
});

// Each edit is judged left untracked, then staged with `git add -A`, then
// committed: the verdict depends on the working tree alone, so all three agree.
const EDITS = [
  [
    'adds a record at the number the base took',
    addMine,
    { collisions: [MINE_TAKES_THEIRS], problems: [MINE_TAKES_THEIRS_PROBLEM] },
  ],
  [
    'adds a record at a free number',
    () => {
      writeRecord('0003-mine.md');
      writeIndex('0001-one.md', '0003-mine.md');
    },
    CLEAN,
  ],
  [
    'retitles a record',
    () => {
      moveRecord('0001-one.md', '0001-uno.md');
      writeIndex('0001-uno.md');
    },
    CLEAN,
  ],
  [
    'retitles a record a commit already retitled',
    () => {
      git('mv', `${ADR_DIR}/0001-one.md`, `${ADR_DIR}/0001-uno.md`);
      writeIndex('0001-uno.md');
      commitAll('first retitle');
      moveRecord('0001-uno.md', '0001-eins.md');
      writeIndex('0001-eins.md');
    },
    CLEAN,
  ],
  [
    'replaces a base record with an unrelated one at its number',
    () => {
      rmSync(recordPath('0001-one.md'));
      writeRecord('0001-new.md', 'An unrelated decision');
      writeIndex('0001-new.md');
    },
    {
      collisions: [{ number: '0001', baseFile: '0001-one.md', headFile: '0001-new.md' }],
      problems: [
        'ADR number 0001 is already taken on main by 0001-one.md; this branch adds 0001-new.md',
      ],
    },
  ],
  [
    'retitles a record that already took the number the base took',
    () => {
      addMine();
      commitAll('mine');
      moveRecord('0002-mine.md', '0002-ours.md');
      writeIndex('0001-one.md', '0002-ours.md');
    },
    { collisions: [{ ...MINE_TAKES_THEIRS, headFile: '0002-ours.md' }] },
  ],
];

describe('checkAdrIntegrity against a base that took a number', () => {
  it.each(EDITS)('judges a branch that %s the same in every git state', (_, edit, verdict) => {
    edit();
    const untracked = check();
    git('add', '-A');
    const staged = check();
    commitAll('edit');

    expect({ untracked, staged, committed: check() }).toMatchObject({
      untracked: verdict,
      staged: verdict,
      committed: verdict,
    });
  });

  it('passes a record retitled with git mv', () => {
    git('mv', `${ADR_DIR}/0001-one.md`, `${ADR_DIR}/0001-uno.md`);
    writeIndex('0001-uno.md');

    expect(check()).toMatchObject(CLEAN);
  });

  it('passes a record retitled by git rm and an untracked file', () => {
    git('rm', '-q', `${ADR_DIR}/0001-one.md`);
    writeRecord('0001-uno.md', '0001-one.md');
    writeIndex('0001-uno.md');

    expect(check()).toMatchObject(CLEAN);
  });

  it('fails a force-staged ignored record that takes it', () => {
    writeFileSync(join(repo, '.gitignore'), '0002-mine.md\n');
    addMine();
    git('add', '--force', `${ADR_DIR}/0002-mine.md`);

    expect(check().collisions).toEqual([MINE_TAKES_THEIRS]);
  });

  it("leaves the repository's own index and object store as it found them", () => {
    addMine();
    const before = [git('status', '--porcelain'), git('count-objects')];

    check();

    expect([git('status', '--porcelain'), git('count-objects')]).toEqual(before);
  });

  it('keeps the aged shared index a split real index still reads', () => {
    git('config', 'core.splitIndex', 'true');
    git('update-index', '--split-index');
    const gitDir = join(repo, '.git');
    const sharedIndexes = () =>
      readdirSync(gitDir).filter((name) => name.startsWith('sharedindex.'));
    const aged = new Date(Date.now() - AGED_SHARED_INDEX_MS);
    for (const name of sharedIndexes()) utimesSync(join(gitDir, name), aged, aged);
    const before = sharedIndexes();
    addMine();

    check();

    expect(before).toHaveLength(1);
    expect(sharedIndexes()).toEqual(before);
    expect(git('status', '--porcelain').split('\n')).toContain('?? docs/adrs/0002-mine.md');
  });

  it('warns that it skipped the base when the base cannot be resolved', () => {
    addMine();

    expect(check('no-such-ref')).toMatchObject({
      warnings: [
        'Could not resolve no-such-ref — checking the working tree only, so a number this ' +
          'branch takes from the base branch will not be caught. Fetch the base ref to restore it.',
      ],
      collisions: [],
    });
  });
});

// The ADR Integrity workflow's sparse checkout holds the records, this
// capability, and tools/lib; copying the latter two makes the fixture the
// entry's ROOT.
function runEntry({ inActions }) {
  for (const dir of ['tools/adrs', 'tools/lib']) {
    cpSync(join(checkoutRoot, dir), join(repo, dir), { recursive: true });
  }
  const GITHUB_ACTIONS = inActions ? 'true' : undefined;
  return spawnSync(
    process.execPath,
    [join(repo, 'tools', 'adrs', 'check-adr-integrity.mjs'), '--base=main'],
    { cwd: repo, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS } }
  );
}

describe('check-adr-integrity.mjs', () => {
  it('exits 1 on a record taking a --base number, annotating it in Actions', () => {
    addMine();

    const result = runEntry({ inActions: true });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe(
      '::error file=docs/adrs/0002-mine.md,line=1::ADR number 0002 is already held by ' +
        '0002-theirs.md on the base branch\n'
    );
    expect(result.stderr.split('\n')).toContain(`  • ${MINE_TAKES_THEIRS_PROBLEM}`);
  });

  it('exits 0 with the record count when nothing collides', () => {
    const result = runEntry({ inActions: false });

    expect(result).toMatchObject({
      status: 0,
      stdout:
        'ADR integrity OK — 1 records, every number unique, every record indexed once, and ' +
        'every local ADR link valid.\n',
      stderr: '',
    });
  });
});
