import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jobBlocks, stepBlocks } from '../ci-mirror/tests/workflow-job-steps.mjs';

// Line-oriented for the reason workflow-hygiene.test.mjs gives: no YAML parser
// ships in this repo's dependency tree, and job keys, steps, and job-level
// permissions sit at fixed indentation in hand-written workflow files.
const repoRoot = join(import.meta.dirname, '..', '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');
const workflows = readdirSync(workflowsDir)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .map((name) => ({ name, text: readFileSync(join(workflowsDir, name), 'utf8') }));

const isBlankOrComment = (line) => /^\s*(?:#.*)?$/.test(line);

function issueWriteHolders(name, text) {
  return jobBlocks(text)
    .filter((job) => /^ {6}issues: write$/m.test(job.text))
    .map((job) => ({ job: `${name} ${job.id}`, text: job.text }));
}

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
const QUOTED_STRING = /'(?:[^']|'')*'|"(?:[^"\\]|\\.)*"/g;
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
    // Quoted text is a scalar's content, so a brace or `: ` inside it opens nothing.
    const outsideQuotes = (key === undefined ? body : value).replace(QUOTED_STRING, '""');
    const unreadable =
      FLOW_MAPPING.test(outsideQuotes) || (key === undefined && UNREADABLE_KEY.test(outsideQuotes));
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

describe('workflow gates', () => {
  // A job-level grant outlives the step it was added for when that step moves
  // to another job, and the job left behind keeps installing and building
  // under a token that can open and comment on issues. Workflow-level grants
  // are outside this rule: label sync and the dependency review hold theirs
  // for calls other than `gh issue`.
  describe('issue-filing privileges', () => {
    const holders = workflows.flatMap(({ name, text }) => issueWriteHolders(name, text));

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
      const workflow = [
        'jobs:',
        '  build:',
        '    permissions:',
        '      contents: read',
        '  report:',
        '    permissions:',
        '      issues: write',
      ].join('\n');

      expect(issueWriteHolders('fixture.yml', workflow).map(({ job }) => job)).toEqual([
        'fixture.yml report',
      ]);
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

  // GitHub runs a run: script with no declared shell as `bash -e {0}`, without pipefail, so a
  // `node … | tr` pipeline would read a crashed producer as an empty answer. One top-level block
  // declares bash for every step and no other key may change it, so a step a test executes under
  // BASH_STEP_ARGS runs that way in CI too.
  describe('run: step shell', () => {
    const buildJob = [
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: Build',
      '        run: npm run build',
    ];
    const runnerListJob = (runner) => [
      ...buildJob.slice(0, 2),
      `    runs-on: [self-hosted, ${runner}]`,
      ...buildJob.slice(3),
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
        spelling: 'a runner list holding a quoted expression',
        yaml: [...BASH_DEFAULTS_BLOCK, ...runnerListJob('"${{ matrix.runner }}"')],
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
      {
        spelling: 'a flow mapping inside a runner list',
        yaml: [...BASH_DEFAULTS_BLOCK, ...runnerListJob('{ shell: sh }')],
        problems: ['line 6: runs-on: [self-hosted, { shell: sh }]'],
      },
    ])('refuses $spelling', ({ yaml, problems }) => {
      expect(shellProblems(yaml.join('\n'))).toEqual(problems);
    });
  });
});
