import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

let scratch;
let repo;

const git = (...args) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const recordPath = (file) => join(repo, ADR_DIR, file);

function writeRecord(file) {
  writeFileSync(recordPath(file), `# ADR-${file.slice(0, 4)}: ${file}\n`);
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

describe('checkAdrIntegrity against a base that took a number', () => {
  it('fails an uncommitted record that takes it', () => {
    addMine();

    expect(check()).toMatchObject({
      collisions: [MINE_TAKES_THEIRS],
      problems: [MINE_TAKES_THEIRS_PROBLEM],
    });
  });

  it('fails a staged record that takes it', () => {
    addMine();
    git('add', ADR_DIR);

    expect(check()).toMatchObject({
      collisions: [MINE_TAKES_THEIRS],
      problems: [MINE_TAKES_THEIRS_PROBLEM],
    });
  });

  it('fails a committed record that takes it', () => {
    addMine();
    commitAll('mine');

    expect(check()).toMatchObject({
      collisions: [MINE_TAKES_THEIRS],
      problems: [MINE_TAKES_THEIRS_PROBLEM],
    });
  });

  it('passes an uncommitted record at a free number', () => {
    writeRecord('0003-mine.md');
    writeIndex('0001-one.md', '0003-mine.md');

    expect(check()).toMatchObject(CLEAN);
  });

  it('passes a record retitled with git mv', () => {
    git('mv', `${ADR_DIR}/0001-one.md`, `${ADR_DIR}/0001-uno.md`);
    writeIndex('0001-uno.md');

    expect(check()).toMatchObject(CLEAN);
  });

  it('passes a record retitled with a plain mv', () => {
    renameSync(recordPath('0001-one.md'), recordPath('0001-uno.md'));
    writeIndex('0001-uno.md');

    expect(check()).toMatchObject(CLEAN);
  });

  it('passes a record retitled by git rm and an untracked file', () => {
    git('rm', '-q', `${ADR_DIR}/0001-one.md`);
    writeRecord('0001-uno.md');
    writeIndex('0001-uno.md');

    expect(check()).toMatchObject(CLEAN);
  });

  it('fails a record moved by plain mv onto the number the base took', () => {
    renameSync(recordPath('0001-one.md'), recordPath('0002-one.md'));
    writeIndex('0002-one.md');

    expect(check().collisions).toEqual([{ ...MINE_TAKES_THEIRS, headFile: '0002-one.md' }]);
  });

  // The deleted record never reached the base, so the move retitles this
  // branch's own collision rather than a base record.
  it('fails a committed collision retitled with a plain mv', () => {
    addMine();
    commitAll('mine');
    renameSync(recordPath('0002-mine.md'), recordPath('0002-ours.md'));
    writeIndex('0001-one.md', '0002-ours.md');

    expect(check().collisions).toEqual([{ ...MINE_TAKES_THEIRS, headFile: '0002-ours.md' }]);
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
