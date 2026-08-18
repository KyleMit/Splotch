import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// rerun-setup-timeouts.yml re-runs a failed Tests run exactly when every failed job
// carries the setup-timeout annotation the two Playwright setup actions emit. The
// marker pattern and the annotation titles live in files that cannot share code
// (workflow YAML, a bash helper, a composite action), so this test is the drift
// guard between them — and it executes the workflow's decision script against a
// stubbed `gh` to lock the re-run/leave-it-for-a-human branching.
const repoRoot = join(import.meta.dirname, '..', '..');
const workflowLines = readFileSync(
  join(repoRoot, '.github', 'workflows', 'rerun-setup-timeouts.yml'),
  'utf8'
).split('\n');
const reportScript = readFileSync(
  join(repoRoot, '.github', 'actions', 'setup-playwright', 'report-setup-timeout.sh'),
  'utf8'
);
const ubuntuAction = readFileSync(
  join(repoRoot, '.github', 'actions', 'setup-playwright', 'action.yml'),
  'utf8'
);
const webkitAction = readFileSync(
  join(repoRoot, '.github', 'actions', 'setup-playwright-webkit', 'action.yml'),
  'utf8'
);

const markerPattern = workflowLines
  .find((line) => /^\s+SETUP_TIMEOUT_MARKER_PATTERN:/.test(line))
  ?.match(/: '(.+)'$/)?.[1];
const marker = new RegExp(markerPattern);

const runIndex = workflowLines.findIndex((line) => line === '        run: |');
const rerunScript = workflowLines
  .slice(runIndex + 1)
  .map((line) => line.slice(10))
  .join('\n');

const timeoutTitleTemplate = reportScript.match(/title=(Playwright \$\{label\} timed out)::/)?.[1];
const failureTitleTemplate = reportScript.match(/title=(Playwright \$\{label\} failed)::/)?.[1];
const boundedStepLabels = [
  ...ubuntuAction.matchAll(/report-setup-timeout\.sh" \$\? "\$SETUP_TIMEOUT_S" '([^']+)'/g),
].map((match) => match[1]);
const webkitTimeoutTitle = webkitAction.match(/title=(Playwright [^:]+ timed out)::/)?.[1];

const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runRerunScript({ failedJobIds = [], titlesByJobId = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-rerun-setup-'));
  tempRoots.push(root);
  const stubBin = join(root, 'bin');
  const callLog = join(root, 'gh-calls.log');
  mkdirSync(stubBin);
  writeFileSync(callLog, '');
  writeFileSync(
    join(stubBin, 'gh'),
    `#!/bin/bash
args="$*"
printf '%s\\n' "$args" >> "$GH_CALL_LOG"
case "$args" in
  *rerun-failed-jobs*)
    exit 0
    ;;
  */actions/runs/*/jobs*)
    if [ -n "$FAKE_FAILED_JOB_IDS" ]; then printf '%s\\n' $FAKE_FAILED_JOB_IDS; fi
    ;;
  */check-runs/*/annotations*)
    job_id="\${args#*check-runs/}"
    job_id="\${job_id%%/*}"
    var="FAKE_TITLES_\${job_id}"
    printf '%s\\n' "\${!var}"
    ;;
  *)
    echo "unexpected gh call: $args" >&2
    exit 1
    ;;
esac
`
  );
  chmodSync(join(stubBin, 'gh'), 0o755);

  const titleEnv = Object.fromEntries(
    Object.entries(titlesByJobId).map(([jobId, titles]) => [
      `FAKE_TITLES_${jobId}`,
      titles.join('\n'),
    ])
  );
  const result = spawnSync(
    '/bin/bash',
    ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', rerunScript],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...titleEnv,
        FAKE_FAILED_JOB_IDS: failedJobIds.join(' '),
        GH_CALL_LOG: callLog,
        GITHUB_REPOSITORY: 'octo/splotch',
        PATH: `${stubBin}:/usr/bin:/bin`,
        RUN_ID: '9999',
        SETUP_TIMEOUT_MARKER_PATTERN: markerPattern,
      },
    }
  );

  const rerunCalls = readFileSync(callLog, 'utf8')
    .split('\n')
    .filter((line) => line.includes('rerun-failed-jobs'));
  return { rerunCalls, result };
}

describe('setup-timeout marker pattern', () => {
  it('found the pattern, the title templates, and both bounded-step labels', () => {
    expect(markerPattern).toBeDefined();
    expect(timeoutTitleTemplate).toBeDefined();
    expect(failureTitleTemplate).toBeDefined();
    expect(webkitTimeoutTitle).toBeDefined();
    expect(boundedStepLabels).toHaveLength(2);
  });

  it('matches every timeout title the Ubuntu setup action can emit', () => {
    for (const label of boundedStepLabels) {
      expect(timeoutTitleTemplate.replace('${label}', label)).toMatch(marker);
    }
  });

  it('matches the macOS WebKit timeout title', () => {
    expect(webkitTimeoutTitle).toMatch(marker);
  });

  it('rejects the non-timeout failure title, so real failures never earn a re-run', () => {
    for (const label of boundedStepLabels) {
      expect(failureTitleTemplate.replace('${label}', label)).not.toMatch(marker);
    }
  });
});

describe('rerun decision script', () => {
  it('re-runs failed jobs once when every failed job carries the marker', () => {
    const { rerunCalls, result } = runRerunScript({
      failedJobIds: [101, 202],
      titlesByJobId: {
        101: ['Playwright system deps timed out'],
        202: ['', 'Playwright WebKit install timed out'],
      },
    });

    expect(result.status).toBe(0);
    expect(rerunCalls).toHaveLength(1);
    expect(rerunCalls[0]).toContain('repos/octo/splotch/actions/runs/9999/rerun-failed-jobs');
  });

  it('leaves the run alone when any failed job lacks the marker', () => {
    const { rerunCalls, result } = runRerunScript({
      failedJobIds: [101, 202],
      titlesByJobId: {
        101: ['Playwright system deps timed out'],
        202: ['Process completed with exit code 1.'],
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('leaving the run for a human');
    expect(rerunCalls).toHaveLength(0);
  });

  it('does nothing when the run has no failed jobs', () => {
    const { rerunCalls, result } = runRerunScript();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('nothing to re-run');
    expect(rerunCalls).toHaveLength(0);
  });
});
