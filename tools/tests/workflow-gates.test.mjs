import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { jobBlock, jobBlocks, testWorkflow } from '../ci-mirror/tests/workflow-job-steps.mjs';

// Line-oriented for the reason workflow-hygiene.test.mjs gives: no YAML parser
// ships in this repo's dependency tree, and job keys, steps, and job-level
// permissions sit at fixed indentation in hand-written workflow files.
const repoRoot = join(import.meta.dirname, '..', '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');
const workflows = readdirSync(workflowsDir)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .map((name) => ({ name, text: readFileSync(join(workflowsDir, name), 'utf8') }));

const HISTORY_ARTIFACT = 'webkit-undo-full-history';
const SEED_PATH = 'tools/perf/fixtures/undo-fast-set-history.seed.json';
const HISTORY_PATH = '.perf-state/undo-fast-set-history.json';
const SEED = readFileSync(join(repoRoot, SEED_PATH), 'utf8');
const RESTORED_HISTORY = '{"restored":true}\n';
const NO_ARTIFACT_WARNING =
  '::warning::no release-tag fast-set history artifact found; starting from the committed seed\n';
const FAILED_RESTORE_WARNING =
  '::warning::fast-set history restore failed; starting from the committed seed\n';

// `gh api` answers the artifact listing with the id the scenario names, and the
// archive download with bytes or a failure.
const GH_STUB = [
  'if [[ "$2" == */zip ]]; then',
  '  [[ "$GH_DOWNLOAD" == ok ]] || exit 1',
  '  printf archive',
  '  exit 0',
  'fi',
  'printf %s "$GH_ARTIFACT_ID"',
].join('\n');

// Stands in for extracting a real archive: it writes the history file into the
// directory `-d` named, or fails before writing anything.
const UNZIP_STUB = [
  '[[ "$UNZIP_RESULT" == ok ]] || exit 1',
  'printf %s "$RESTORED_HISTORY" >"$4/undo-fast-set-history.json"',
].join('\n');

const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const steps = (job) => job.split(/^(?= {6}- )/m).slice(1);

const isBlankOrComment = (line) => /^\s*(?:#.*)?$/.test(line);

// Every `permissions` key that is not a block of `scope: level` lines, or the
// empty mapping that grants nothing. A key is found however it is spelled
// (quoted, or with space before the colon) and accepted only in the one
// spelling the holders below are read from.
function unreadablePermissions(workflow) {
  const lines = workflow.split('\n');
  return lines.flatMap((line, index) => {
    const header = line.match(/^( *)["']?permissions["']?\s*:(.*)$/);
    if (!header) return [];

    const [, indent, value] = header;
    const entry = new RegExp(`^${indent}  [a-z-]+: (?:read|write|none)$`);
    const following = lines.slice(index + 1);
    const end = following.findIndex(
      (candidate) => !isBlankOrComment(candidate) && candidate.search(/\S/) <= indent.length
    );
    const entries = following
      .slice(0, end < 0 ? undefined : end)
      .filter((candidate) => !isBlankOrComment(candidate));
    const grantsNothing = value === ' {}' && entries.length === 0;
    const grantsByScope =
      value === '' && entries.length > 0 && entries.every((grant) => entry.test(grant));
    const readable = line === `${indent}permissions:${value}` && (grantsNothing || grantsByScope);
    return readable ? [] : [`line ${index + 1}: ${line.trim()}`];
  });
}

function runScript(job, stepName) {
  const step = steps(job).find((candidate) => candidate.startsWith(`      - name: ${stepName}\n`));
  const script = step?.match(/^ {8}run: \|\n((?: {10}.*\n|\n)+)/m)?.[1];
  if (!script) throw new Error(`No "${stepName}" step carrying a shell script`);
  return script.replace(/^ {10}/gm, '');
}

function writeExecutable(path, body) {
  writeFileSync(path, `#!/bin/bash\n${body}\n`);
  chmodSync(path, 0o755);
}

// The workspace holds only the committed seed, at the path the repository keeps
// it, so a step naming any other seed path fails its copy here.
function runRestoreStep(script, { artifactId, download, unzip }) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-history-restore-'));
  tempRoots.push(root);
  const stubBin = join(root, 'bin');
  const runnerTemp = join(root, 'runner-temp');
  const workspace = join(root, 'workspace');
  mkdirSync(stubBin);
  mkdirSync(runnerTemp);
  mkdirSync(join(workspace, dirname(SEED_PATH)), { recursive: true });
  copyFileSync(join(repoRoot, SEED_PATH), join(workspace, SEED_PATH));
  writeExecutable(join(stubBin, 'gh'), GH_STUB);
  writeExecutable(join(stubBin, 'unzip'), UNZIP_STUB);

  const result = spawnSync(
    '/bin/bash',
    ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script],
    {
      cwd: workspace,
      encoding: 'utf8',
      env: {
        GH_ARTIFACT_ID: artifactId,
        GH_DOWNLOAD: download,
        GITHUB_REPOSITORY: 'KyleMit/Splotch',
        PATH: `${stubBin}:/usr/bin:/bin`,
        RESTORED_HISTORY,
        RUNNER_TEMP: runnerTemp,
        UNZIP_RESULT: unzip,
      },
    }
  );

  return { history: readFileSync(join(workspace, HISTORY_PATH), 'utf8'), result };
}

describe('workflow gates', () => {
  // A job-level grant outlives the step it was added for when that step moves
  // to another job, and the job left behind keeps installing and building
  // under a token that can open and comment on issues. Workflow-level grants
  // are outside this rule: label sync and the dependency review hold theirs
  // for calls other than `gh issue`.
  describe('issue-filing privileges', () => {
    const holders = workflows.flatMap(({ name, text }) =>
      jobBlocks(text)
        .filter((job) => /^ {6}issues: write$/m.test(job.text))
        .map((job) => ({ job: `${name} ${job.id}`, text: job.text }))
    );

    // The holders are found by reading grants line by line, so a grant spelled
    // any other way is one nothing here holds to account: `write-all`, an
    // inline mapping, or an entry carrying a comment.
    it.each(workflows)('$name spells every permissions block one scope per line', ({ text }) => {
      expect(unreadablePermissions(text)).toEqual([]);
    });

    it.each([
      { spelling: 'a block of scopes', yaml: ['permissions:', '  contents: read', 'jobs:'] },
      { spelling: 'the empty mapping', yaml: ['    permissions: {}', '    steps:'] },
      {
        spelling: 'a block holding a blank line and a comment',
        yaml: ['    permissions:', '', '      # filing', '      issues: write', '    steps:'],
      },
    ])('reads $spelling', ({ yaml }) => {
      expect(unreadablePermissions(yaml.join('\n'))).toEqual([]);
    });

    it.each([
      { spelling: 'write-all', yaml: ['    permissions: write-all'] },
      { spelling: 'a space before the colon', yaml: ['    permissions : write-all'] },
      { spelling: 'a quoted key', yaml: ['    "permissions":', '      issues: write'] },
      { spelling: 'an inline mapping', yaml: ['    permissions: { issues: write }'] },
      {
        spelling: 'a grant carrying a comment',
        yaml: ['    permissions:', '      issues: write # filing'],
      },
      { spelling: 'a quoted scope', yaml: ['    permissions:', '      "issues": write'] },
      { spelling: 'a key with no grants under it', yaml: ['    permissions:', '    steps:'] },
    ])('rejects $spelling', ({ yaml }) => {
      expect(unreadablePermissions(yaml.join('\n'))).toEqual([`line 1: ${yaml[0].trim()}`]);
    });

    it('finds the jobs holding a job-level issues: write', () => {
      expect(holders.map(({ job }) => job)).toContain('test.yml webkit-commit-gate-fast-retry');
    });

    it.each(holders)('$job files an issue with the scope it holds', ({ text }) => {
      const filingCalls = text.match(/^ +gh issue (?:create|comment) .*$/gm) ?? [];

      expect(filingCalls).not.toEqual([]);
    });
  });

  // "One open issue" holds only while one filing job runs at a time: the
  // filing step is a check-then-create. The group has to be constant, since a
  // per-commit group serializes nothing, and `queue: max` keeps a third
  // commit from cancelling the run still waiting.
  describe('WebKit fast gate filing', () => {
    it('serializes the job that files without dropping a queued run', () => {
      const retryJob = jobBlock(testWorkflow, 'webkit-commit-gate-fast-retry');
      const concurrency = retryJob.match(/^ {4}concurrency:\n((?: {6}.*\n)+)/m)?.[1];

      expect(retryJob).toContain('      - name: File the failure\n');
      expect(concurrency).toBe(
        [
          '      group: webkit-commit-gate-fast',
          '      cancel-in-progress: false',
          '      queue: max',
          '',
        ].join('\n')
      );
    });
  });

  describe('WebKit full gate history', () => {
    const restoreScript = runScript(
      jobBlock(testWorkflow, 'webkit-commit-gate-full'),
      'Restore fast-set history'
    );

    it.each([
      {
        label: 'warns and starts from the seed when no release-tag artifact is listed',
        artifactId: '',
        download: 'unused',
        unzip: 'unused',
        stdout: NO_ARTIFACT_WARNING,
        history: SEED,
      },
      {
        label: 'warns and starts from the seed when the download fails',
        artifactId: '41',
        download: 'fails',
        unzip: 'unused',
        stdout: FAILED_RESTORE_WARNING,
        history: SEED,
      },
      {
        label: 'warns and starts from the seed when the extraction fails',
        artifactId: '41',
        download: 'ok',
        unzip: 'fails',
        stdout: FAILED_RESTORE_WARNING,
        history: SEED,
      },
      {
        label: 'restores the listed artifact without a warning',
        artifactId: '41',
        download: 'ok',
        unzip: 'ok',
        stdout: '',
        history: RESTORED_HISTORY,
      },
    ])('$label', ({ stdout, history, ...scenario }) => {
      const restored = runRestoreStep(restoreScript, scenario);

      expect(restored.result.stderr).toBe('');
      expect(restored.result.status).toBe(0);
      expect(restored.result.stdout).toBe(stdout);
      expect(restored.history).toBe(history);
    });

    // The stubbed listing never evaluates this filter, and gh's evaluator
    // cannot be handed a fixture. The filter is what keeps a dispatch run's
    // artifact, or a fork's, from being restored as release history, so the
    // text is pinned: changing it means changing it here as well.
    it('selects the newest unexpired artifact a release-tag run uploaded', () => {
      expect(restoreScript).toContain(
        [
          `gh api "repos/\${GITHUB_REPOSITORY}/actions/artifacts?name=${HISTORY_ARTIFACT}&per_page=20"`,
          `--jq '[.artifacts[] | select(.expired == false`,
          'and .workflow_run.head_repository_id == .workflow_run.repository_id',
          `and (.workflow_run.head_branch | startswith("v")))][0].id // empty'`,
        ].join(' ')
      );
    });

    // The restore lists one page of this artifact name, newest first, and
    // reads back tag runs only. An upload from any other run is never restored
    // and moves the release record one place nearer the end of that page.
    it('uploads the history artifact from release tags only', () => {
      const uploads = workflows
        .flatMap(({ text }) => jobBlocks(text))
        .flatMap((job) => steps(job.text))
        .filter((step) => step.includes(`\n          name: ${HISTORY_ARTIFACT}\n`));

      expect(uploads).toHaveLength(1);
      expect(uploads[0].replace(/\s+/g, ' ')).toContain(
        "if: >- always() && github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v') uses: "
      );
    });
  });
});
