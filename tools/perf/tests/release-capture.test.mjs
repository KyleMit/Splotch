import { describe, expect, it } from 'vitest';
import { PORT_ROLES } from '../lib/capture-readiness.mjs';
import {
  classifyProcess,
  isRigForward,
  parseAdbForwards,
  planRelease,
  rigPorts,
} from '../release-capture.mjs';

const MAIN = '/Users/dev/Code/Splotch';
const WORKTREE = '/private/tmp/splotch-capture-pr1633';
const roots = {
  checkoutRoots: [MAIN, WORKTREE],
  containerRoots: [`${MAIN}/.claude/worktrees`, `${MAIN}/.codex/worktrees`],
};
const preview = (cwd) => ({ cwd, command: 'node tools/run-web-tool.mjs vite preview --port 4173' });

describe('classifyProcess', () => {
  it('owns a listener whose cwd is inside the main checkout', () => {
    expect(classifyProcess(preview(`${MAIN}/web`), roots).verdict).toBe('ours');
  });

  it('owns a listener from a registered worktree outside the main checkout', () => {
    expect(classifyProcess(preview(`${WORKTREE}/web`), roots).verdict).toBe('ours');
  });

  it('owns a process from a pruned worktree still under the runner container', () => {
    const pruned = `${MAIN}/.claude/worktrees/gone-abc123/web`;
    expect(classifyProcess(preview(pruned), roots).verdict).toBe('ours');
  });

  it('owns a process placed by an absolute command-line path when cwd says nothing', () => {
    const entry = {
      cwd: '/',
      command: `node ${WORKTREE}/tools/perf/prepare-capture.mjs --hold-android-awake`,
    };
    expect(classifyProcess(entry, roots).verdict).toBe('ours');
  });

  it('leaves a listener from another project', () => {
    const verdict = classifyProcess(preview('/Users/dev/Code/OtherApp/web'), roots);
    expect(verdict.verdict).toBe('foreign');
    expect(verdict.reason).toContain('outside every checkout');
  });

  it('treats an unreadable cwd as foreign', () => {
    const verdict = classifyProcess({ cwd: null, command: 'appium --port 4723' }, roots);
    expect(verdict).toEqual({ verdict: 'foreign', reason: 'cwd unreadable' });
  });

  it('never claims the root-owned tunnel, whatever its cwd', () => {
    const entry = { cwd: MAIN, command: 'node /root/.appium/scripts/tunnel-creation.mjs --udid X' };
    expect(classifyProcess(entry, roots).verdict).toBe('tunnel');
  });

  it('flags an owned campaign or operator driver rather than owning it', () => {
    for (const script of ['run-campaign.mjs', 'run-operator-session.mjs']) {
      const entry = { cwd: MAIN, command: `node tools/perf/${script}` };
      expect(classifyProcess(entry, roots).verdict).toBe('campaign');
    }
  });

  it('does not own a sibling directory that merely shares the checkout prefix', () => {
    expect(classifyProcess(preview(`${MAIN}-archive/web`), roots).verdict).toBe('foreign');
  });
});

describe('planRelease', () => {
  const entry = (pid, verdict, command) => ({ pid, verdict, command, ports: [], roles: [] });
  const processes = [
    entry(10, 'ours', 'node tools/run-web-tool.mjs vite preview --port 4173'),
    entry(11, 'ours', 'appium --port 4723 --log-timestamp'),
    entry(12, 'ours', 'node tools/perf/prepare-capture.mjs --hold-android-awake'),
    entry(13, 'campaign', 'node tools/perf/run-campaign.mjs'),
    entry(14, 'foreign', 'node vite preview --port 4183'),
    entry(15, 'tunnel', 'node tunnel-creation.mjs'),
    entry(
      16,
      'ours',
      'xcodebuild build-for-testing -project /Users/dev/.appium/node_modules/appium-xcuitest-driver/WebDriverAgent.xcodeproj'
    ),
  ];

  it('blocks on a live campaign by default and stops nothing', () => {
    const plan = planRelease(processes);
    expect(plan.blocked.map((p) => p.pid)).toEqual([13]);
  });

  it('orders drivers, then appium, then servers, and leaves foreign and tunnel', () => {
    const plan = planRelease(processes, { stopCampaigns: true });
    expect(plan.blocked).toEqual([]);
    expect(plan.drivers.map((p) => p.pid)).toEqual([13, 12]);
    expect(plan.appium.map((p) => p.pid)).toEqual([11]);
    expect(plan.servers.map((p) => p.pid)).toEqual([10, 16]);
    expect(plan.leave.map((p) => p.pid)).toEqual([14, 15]);
  });
});

describe('adb forwards', () => {
  it('parses the forward list and marks only devtools forwards as rig debris', () => {
    const forwards = parseAdbForwards(
      [
        'R5CRC3AVCXM tcp:9224 localabstract:chrome_devtools_remote',
        'R5CRC3AVCXM tcp:9244 localabstract:webview_devtools_remote_12345',
        'R5CRC3AVCXM tcp:5555 tcp:5555',
        '',
      ].join('\n')
    );
    expect(forwards).toHaveLength(3);
    expect(forwards.map(isRigForward)).toEqual([true, true, false]);
  });
});

describe('rigPorts', () => {
  it('covers every canonical port and every shift alternate exactly once', () => {
    const ports = rigPorts().map(({ port }) => port);
    expect(new Set(ports).size).toBe(ports.length);
    for (const spec of Object.values(PORT_ROLES)) {
      expect(ports).toContain(spec.port);
      for (const shifted of spec.shiftTo) expect(ports).toContain(shifted);
    }
  });
});
