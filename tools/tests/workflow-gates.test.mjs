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
import {
  BASH_STEP_ARGS,
  jobBlock,
  jobBlocks,
  runScriptIn,
  stepBlock,
  stepBlocks,
  testWorkflow,
} from '../ci-mirror/tests/workflow-job-steps.mjs';

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

const BASH_DEFAULTS_BLOCK = ['defaults:', '  run:', '    shell: bash'];
const NO_BASH_DEFAULTS =
  'run: steps and no top-level defaults block: GitHub runs them as bash -e {0}, without pipefail';
const SEQUENCE_MARKERS = /^((?:-(?:\s+|$))*)(.*)$/;
const PLAIN_KEY = /^([\w-]+):(?:\s+(.*))?$/;
const BLOCK_SCALAR_HEADER = /^[|>][-+1-9]*(?:\s+#.*)?$/;
const QUOTED_SCALAR = /^(?:'(?:[^']|'')*'|"(?:[^"\\]|\\.)*")(?:\s+#.*)?$/;
// A flow mapping opened behind any anchor or tag, or a flow sequence holding one.
const FLOW_MAPPING = /^(?:[&!]\S*\s+)*(?:\{(?!\})|\[.*\{)/;
// An explicit, anchored, tagged, or merge key, or text before a `: ` that is not a plain key:
// quoted, escaped, or with a space before the colon.
const UNREADABLE_KEY = /^[?&!<]|:(?:\s|$)/;

// The lines YAML reads as structure: not blank, not a comment, and not inside a block scalar
// (a `run: |` script, an action's `script: |` input), each with the plain key it opens. A key
// spelled any other way, or a flow mapping that could hold one, marks its line unreadable, so a
// key this reader cannot name fails the rule instead of passing it.
function structuralLines(text) {
  const structural = [];
  let scalarKeyColumn = -1;
  text.split('\n').forEach((line, index) => {
    const indent = line.search(/\S/);
    if (scalarKeyColumn >= 0 && (indent < 0 || indent > scalarKeyColumn)) return;
    scalarKeyColumn = -1;
    if (isBlankOrComment(line)) return;
    const [, markers, body] = line.slice(indent).match(SEQUENCE_MARKERS);
    const [, key, value = ''] = body.match(PLAIN_KEY) ?? [];
    if (key !== undefined && BLOCK_SCALAR_HEADER.test(value)) {
      scalarKeyColumn = indent + markers.length;
    }
    const unreadable =
      key === undefined
        ? !QUOTED_SCALAR.test(body) && (UNREADABLE_KEY.test(body) || FLOW_MAPPING.test(body))
        : FLOW_MAPPING.test(value);
    structural.push({ index, line, key, unreadable });
  });
  return structural;
}

// The exact block starts at `index` and ends where the next line YAML reads returns to column 0,
// so no key sits under it.
function isBashDefaultsBlock(lines, index) {
  const exact = BASH_DEFAULTS_BLOCK.every((line, offset) => lines[index + offset] === line);
  const next = lines
    .slice(index + BASH_DEFAULTS_BLOCK.length)
    .find((line) => !isBlankOrComment(line));
  return exact && (next === undefined || /^\S/.test(next));
}

// Every way a run: step could get a shell other than BASH_STEP_ARGS: a run step in a workflow
// without the one top-level block, a `defaults` or `shell` key outside it, or a key this reader
// cannot name.
function shellProblems(workflow) {
  const lines = workflow.split('\n');
  const block = lines.findIndex((_, index) => isBashDefaultsBlock(lines, index));
  const accepted = block < 0 ? [] : [block, block + BASH_DEFAULTS_BLOCK.length - 1];
  const stray = structuralLines(workflow).flatMap(({ index, line, key, unreadable }) =>
    (unreadable || key === 'defaults' || key === 'shell') && !accepted.includes(index)
      ? [`line ${index + 1}: ${line.trim()}`]
      : []
  );
  const runsScripts = jobBlocks(workflow).some((job) =>
    stepBlocks(job.text).some((step) => structuralLines(step.text).some(({ key }) => key === 'run'))
  );
  return runsScripts && block < 0 ? [...stray, NO_BASH_DEFAULTS] : stray;
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

  const result = spawnSync('/bin/bash', [...BASH_STEP_ARGS, '-c', script], {
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
  });

  return { history: readFileSync(join(workspace, HISTORY_PATH), 'utf8'), result };
}

// `node` on PATH stands in for tools/perf/report-undo-gate-failures.mjs, so $2 is the
// `--first=` flag on the call that compares the two runners.
function runCompareStep(script, reporterStub) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-gate-compare-'));
  tempRoots.push(root);
  const stubBin = join(root, 'bin');
  const githubOutput = join(root, 'github-output');
  mkdirSync(stubBin);
  writeFileSync(githubOutput, '');
  writeExecutable(join(stubBin, 'node'), reporterStub);

  const result = spawnSync('/bin/bash', [...BASH_STEP_ARGS, '-c', script], {
    encoding: 'utf8',
    env: {
      FIRST_FAILURES: 'multi-finger:breach',
      GITHUB_OUTPUT: githubOutput,
      PATH: `${stubBin}:/usr/bin:/bin`,
    },
  });

  return { output: readFileSync(githubOutput, 'utf8'), result };
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
      expect(holders.map(({ job }) => job)).toContain('test.yml webkit-commit-gate-fast-report');
    });

    const executableSource = /uses: actions\/checkout|uses: \.\/\.github\/actions\/setup-/;
    it.each(holders)('$job isolates issue writes from checked-out executable code', ({ text }) => {
      expect(text).not.toMatch(executableSource);
    });

    it.each(['uses: actions/checkout@pinned', 'uses: ./.github/actions/setup-pnpm'])(
      'detects executable source in an issue-writing job: %s',
      (fixture) => {
        expect(fixture).toMatch(executableSource);
      }
    );

    it.each(holders)('$job files an issue with the scope it holds', ({ text }) => {
      const filingCalls = text.match(/^ +gh issue (?:create|comment) .*$/gm) ?? [];

      expect(filingCalls).not.toEqual([]);
    });
  });

  // GitHub runs a run: script with no declared shell as `bash -e {0}`, without pipefail, so the
  // WebKit retry's `node … | tr` comparison would read a crashed comparator as "not reproduced"
  // and file nothing. One top-level block declares bash for every step and no other key may
  // change it, so a step a test executes under BASH_STEP_ARGS runs that way in CI too.
  describe('run: step shell', () => {
    const buildJob = [
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: Build',
      '        run: npm run build',
    ];

    it.each(workflows)('$name runs any run: step under the declared bash shell', ({ text }) => {
      expect(shellProblems(text)).toEqual([]);
    });

    it.each([
      {
        spelling: 'the block before a comment',
        yaml: [...BASH_DEFAULTS_BLOCK, '', '# Introduces the jobs.', ...buildJob],
      },
      {
        spelling: 'no block where no step runs a script',
        yaml: ['jobs:', '  build:', '    steps:', '      - uses: actions/checkout@sha'],
      },
      {
        spelling: 'a shell mapping inside a script',
        yaml: [
          ...BASH_DEFAULTS_BLOCK,
          ...buildJob.slice(0, 4),
          '      - run: |',
          "          node -e 'console.log({ shell: process.env.SHELL })'",
        ],
      },
      {
        spelling: "a run mapping inside an action's script input, with no block",
        yaml: [
          ...buildJob.slice(0, 4),
          '      - uses: actions/github-script@sha',
          '        with:',
          '          script: |',
          '            console.log({run: "diagnostic"})',
        ],
      },
    ])('accepts $spelling', ({ yaml }) => {
      expect(shellProblems(yaml.join('\n'))).toEqual([]);
    });

    it.each([
      { spelling: 'no block', yaml: buildJob, problems: [NO_BASH_DEFAULTS] },
      {
        spelling: 'the block commented out',
        yaml: ['# defaults:', '#   run:', '#     shell: bash', ...buildJob],
        problems: [NO_BASH_DEFAULTS],
      },
      {
        spelling: 'the block nested under a job',
        yaml: [
          'jobs:',
          '  build:',
          '    defaults:',
          '      run:',
          '        shell: bash',
          '    steps:',
          '      - run: npm run build',
        ],
        problems: ['line 3: defaults:', 'line 5: shell: bash', NO_BASH_DEFAULTS],
      },
      {
        spelling: 'a step-level shell',
        yaml: [...BASH_DEFAULTS_BLOCK, ...buildJob, '        shell: sh'],
        problems: ['line 10: shell: sh'],
      },
      {
        spelling: 'a shell inside a flow-style step',
        yaml: [...BASH_DEFAULTS_BLOCK, ...buildJob, '      - { run: npm test, shell: sh }'],
        problems: ['line 10: - { run: npm test, shell: sh }'],
      },
      {
        spelling: 'a flow-style block',
        yaml: ['defaults: { run: { shell: bash } }', ...buildJob],
        problems: ['line 1: defaults: { run: { shell: bash } }', NO_BASH_DEFAULTS],
      },
      {
        spelling: 'a quoted key',
        yaml: ['"defaults":', '  run:', '    shell: bash', ...buildJob],
        problems: ['line 1: "defaults":', 'line 3: shell: bash', NO_BASH_DEFAULTS],
      },
      {
        spelling: 'a space before the colon',
        yaml: ['defaults :', '  run:', '    shell: bash', ...buildJob],
        problems: ['line 1: defaults :', 'line 3: shell: bash', NO_BASH_DEFAULTS],
      },
      {
        spelling: 'a key added under the block',
        yaml: [...BASH_DEFAULTS_BLOCK, '', '    working-directory: web', ...buildJob],
        problems: ['line 1: defaults:', 'line 3: shell: bash', NO_BASH_DEFAULTS],
      },
      {
        spelling: 'a step shell after its script',
        yaml: [
          ...BASH_DEFAULTS_BLOCK,
          ...buildJob.slice(0, 4),
          '      - run: |',
          '          npm run build',
          '        shell: sh',
        ],
        problems: ['line 10: shell: sh'],
      },
      {
        spelling: 'an escaped shell key',
        yaml: [...BASH_DEFAULTS_BLOCK, ...buildJob, '        "shel\\u006c": sh'],
        problems: ['line 10: "shel\\u006c": sh'],
      },
      {
        spelling: 'an escaped run key',
        yaml: [...buildJob.slice(0, 4), '      - "r\\u0075n": npm run build'],
        problems: ['line 5: - "r\\u0075n": npm run build'],
      },
      {
        spelling: 'a tagged key',
        yaml: [...BASH_DEFAULTS_BLOCK, ...buildJob, '        !!str shell: sh'],
        problems: ['line 10: !!str shell: sh'],
      },
      {
        spelling: 'an explicit key',
        yaml: [...BASH_DEFAULTS_BLOCK, ...buildJob, '        ? shell', '        : sh'],
        problems: ['line 10: ? shell', 'line 11: : sh'],
      },
      {
        spelling: 'a merge key',
        yaml: [...BASH_DEFAULTS_BLOCK, ...buildJob, '        <<: *shell'],
        problems: ['line 10: <<: *shell'],
      },
    ])('refuses $spelling', ({ yaml, problems }) => {
      expect(shellProblems(yaml.join('\n'))).toEqual(problems);
    });
  });

  // The check-then-create requires a constant lock. queue:max permits up to
  // 100 pending jobs; queue:single replaces an existing pending reporter.
  describe('WebKit fast gate filing', () => {
    it('serializes filing and retains the bounded maximum pending queue', () => {
      const reportJob = jobBlock(testWorkflow, 'webkit-commit-gate-fast-report');
      const concurrency = reportJob.match(/^ {4}concurrency:\n((?: {6}.*\n)+)/m)?.[1];

      expect(reportJob).toContain('      - name: File the failure\n');
      expect(concurrency).toBe(
        [
          '      group: webkit-commit-gate-fast-report',
          '      cancel-in-progress: false',
          '      queue: max',
          '',
        ].join('\n')
      );
    });
  });

  // A crashed reporter exits 1 with nothing on stdout (issue 1296), and a comparison step that
  // succeeds with an empty `reproduced` is what the retry records as host noise, filing nothing.
  // So a crash has to fail the step, while a comparison that ran and found no overlap succeeds.
  describe('WebKit fast gate retry comparison', () => {
    const compareScript = runScriptIn(
      stepBlock(
        jobBlock(testWorkflow, 'webkit-commit-gate-fast-retry'),
        "Compare this runner's failure with the first runner's"
      )
    );

    it.each([
      { label: 'the reporter crashes', reporter: 'exit 1' },
      {
        label: 'only the comparison crashes',
        reporter: 'case "$2" in --first=*) exit 1 ;; *) echo multi-finger:breach ;; esac',
      },
    ])('fails the step when $label', ({ reporter }) => {
      const { result } = runCompareStep(compareScript, reporter);

      expect(result.stderr).toBe('');
      expect(result.status).toBe(1);
    });

    it.each([
      {
        label: 'a reproduced failure',
        reporter: 'echo multi-finger:breach',
        output: 'mine=multi-finger:breach\nreproduced=multi-finger:breach\n',
      },
      {
        label: 'a failure that did not reproduce',
        reporter: 'case "$2" in --first=*) echo ;; *) echo crayon-scribbles:breach ;; esac',
        output: 'mine=crayon-scribbles:breach\nreproduced=\n',
      },
    ])('records $label from a comparison that ran', ({ reporter, output }) => {
      const compared = runCompareStep(compareScript, reporter);

      expect(compared.result.stderr).toBe('');
      expect(compared.result.status).toBe(0);
      expect(compared.output).toBe(output);
    });
  });

  describe('WebKit full gate history', () => {
    const restoreScript = runScriptIn(
      stepBlock(jobBlock(testWorkflow, 'webkit-commit-gate-full'), 'Restore fast-set history')
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
        .flatMap((job) => stepBlocks(job.text))
        .map(({ text }) => text)
        .filter((step) => step.includes(`\n          name: ${HISTORY_ARTIFACT}\n`));

      expect(uploads).toHaveLength(1);
      expect(uploads[0].replace(/\s+/g, ' ')).toContain(
        "if: >- always() && github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v') uses: "
      );
    });
  });
});
