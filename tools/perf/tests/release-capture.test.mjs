import { describe, expect, it } from 'vitest';
import { PORT_ROLES } from '../lib/capture-readiness.mjs';
import {
  classifyProcess,
  forwardActions,
  isRigForward,
  parseAdbForwards,
  planRelease,
  releaseFailures,
  repoScriptRoot,
  rigPorts,
  selectAndroidSerial,
} from '../release-capture.mjs';

const MAIN = '/Users/dev/Code/Splotch';
const WORKTREE = '/private/tmp/splotch-capture-pr1633';
const roots = {
  checkoutRoots: [MAIN, WORKTREE],
  containerRoots: [`${MAIN}/.claude/worktrees`, '/Users/dev/.codex/worktrees'],
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

  it('owns a pruned Codex worktree under the home-directory container', () => {
    const pruned = '/Users/dev/.codex/worktrees/4db6dc63-gone/Splotch/web';
    expect(classifyProcess(preview(pruned), roots).verdict).toBe('ours');
  });

  it('owns a pruned worktree outside every container by the rig script it runs', () => {
    const entry = {
      cwd: '/private/tmp/splotch-gone/web',
      command: 'node /private/tmp/splotch-gone/tools/run-web-tool.mjs vite preview --port 4173',
    };
    const verdict = classifyProcess(entry, roots);
    expect(verdict.verdict).toBe('ours');
    expect(verdict.reason).toContain('/private/tmp/splotch-gone');
  });

  it('owns the vite port holder of a pruned worktree through its ancestor command line', () => {
    const entry = {
      cwd: '/private/tmp/splotch-gone/web',
      command: 'node /private/tmp/splotch-gone/node_modules/vite/bin/vite.js preview --port 4173',
      ancestors: ['node /private/tmp/splotch-gone/tools/run-web-tool.mjs vite preview --port 4173'],
    };
    expect(classifyProcess(entry, roots).verdict).toBe('ours');
  });

  it('does not own a vite from another project just because it has ancestors', () => {
    const entry = {
      cwd: '/Users/dev/Code/OtherApp',
      command: 'node /Users/dev/Code/OtherApp/node_modules/vite/bin/vite.js preview',
      ancestors: ['npm run preview', '/bin/zsh'],
    };
    expect(classifyProcess(entry, roots).verdict).toBe('foreign');
  });
});

describe('repoScriptRoot', () => {
  it('names the checkout a rig script runs from and nothing else', () => {
    expect(repoScriptRoot('node /x/y/tools/perf/serve-probe-host.mjs --port=4175')).toBe('/x/y');
    expect(repoScriptRoot('node /x/y/tools/run-web-tool.mjs vite preview --host')).toBe('/x/y');
    expect(repoScriptRoot('node /x/y/tools/run-web-tool.mjs vite dev')).toBeNull();
    expect(repoScriptRoot('node /x/y/node_modules/vite/bin/vite.js preview')).toBeNull();
  });
});

describe('selectAndroidSerial', () => {
  it('takes the explicit serial, the only attached one, or none', () => {
    expect(selectAndroidSerial(['a', 'b'], 'b')).toEqual({ serial: 'b' });
    expect(selectAndroidSerial(['a'], null)).toEqual({ serial: 'a' });
    expect(selectAndroidSerial([], null)).toEqual({ serial: null });
  });

  it('refuses to guess between several attached phones', () => {
    const pick = selectAndroidSerial(['phone-a', 'phone-b'], null);
    expect(pick.serial).toBeNull();
    expect(pick.problem).toContain('--android-serial=');
  });
});

describe('forwardActions', () => {
  it('removes only the selected device’s devtools forwards', () => {
    const forwards = parseAdbForwards(
      [
        'phone-a tcp:9224 localabstract:chrome_devtools_remote',
        'phone-b tcp:9234 localabstract:chrome_devtools_remote',
        'phone-a tcp:5555 tcp:5555',
      ].join('\n')
    );
    expect(forwardActions(forwards, 'phone-a').map((f) => [f.serial, f.action])).toEqual([
      ['phone-a', 'remove'],
      ['phone-b', 'leave'],
      ['phone-a', 'leave'],
    ]);
  });
});

describe('releaseFailures', () => {
  const clean = {
    forwards: [{ serial: 'a', local: 'tcp:9224', outcome: 'removed' }],
    android: { serial: 'a', steps: [{ command: 'svc power stayon false', outcome: 'ok' }] },
  };

  it('is empty when every step succeeded', () => {
    expect(releaseFailures(clean)).toEqual([]);
  });

  it('collects a failed forward removal, a failed reset step, and a refused phone pick', () => {
    expect(
      releaseFailures({
        forwards: [{ serial: 'a', local: 'tcp:9224', outcome: 'remove failed: exit 17' }],
        android: {
          serial: 'a',
          steps: [{ command: 'dumpsys battery reset', outcome: 'failed: exit 17' }],
        },
      })
    ).toHaveLength(2);
    expect(
      releaseFailures({ forwards: [], android: { serial: null, steps: [], problem: 'x' } })
    ).toEqual(['x']);
    expect(releaseFailures({ forwards: [], forwardProblem: 'adb forward --list failed' })).toEqual([
      'adb forward --list failed',
    ]);
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
