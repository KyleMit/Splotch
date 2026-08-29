import { describe, expect, it } from 'vitest';
import {
  ACTION_REPEATS,
  ALL_ITEMS,
  GESTURE_REPEATS,
  cellServerSource,
  CAMPAIGN_MODES,
  CAMPAIGN_TARGETS,
  UNDO_COUNT,
  SPLIT_SCREEN_COMMAND,
  desktopViewport,
  artifactMatchesRuntime,
  artifactPassedFidelity,
  commandReportsFidelity,
  artifactPath,
  campaignTarget,
  planCampaign,
  probeHostProblem,
  resolvedProbeHostProblem,
  splitTransportIdentityProblem,
  commandReportsRefreshRegime,
} from '../lib/campaign-plan.mjs';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { WEB_ONLY_STATIC_FILES } from '../../mobile/lib/static-export.mjs';
import { join } from 'node:path';
import { entryModulePath, servedBuildFingerprintProblem } from '../lib/profile-preview.mjs';
import { ROOT as ROOT_DIR } from '../../lib/proc.mjs';
import { campaignProgress } from '../campaign-status.mjs';
import { isProbePlan } from '../run-campaign.mjs';
import {
  ALREADY_VALID,
  COMPLETE,
  FAILED,
  UNSCOREABLE,
  completedCells,
  attemptsFor,
  isComplete,
  nextAction,
  parseLedger,
  summarize,
} from '../lib/campaign-ledger.mjs';

const HOST = { appiumUrl: 'http://127.0.0.1:4723', capabilitiesFile: '/tmp/caps.json' };
const plan = (targetId, options = {}) =>
  planCampaign(targetId, { outputRoot: 'out', host: HOST, ...options });

describe('campaign plan', () => {
  it('expands every mode against every item', () => {
    const cells = plan('ipad-simulator-native');

    expect(cells).toHaveLength(CAMPAIGN_MODES.length * ALL_ITEMS.length);
    for (const mode of CAMPAIGN_MODES) {
      for (const item of ALL_ITEMS) {
        expect(cells.some((cell) => cell.id === `${mode.id}/${item}`)).toBe(true);
      }
    }
  });

  it('gives every cell its own artifact path', () => {
    const paths = Object.keys(CAMPAIGN_TARGETS).flatMap((targetId) =>
      plan(targetId).map((cell) => cell.artifact)
    );

    expect(new Set(paths).size).toBe(paths.length);
  });

  it('keeps undo on pen only, because a non-pen undo probe is not requested', () => {
    const cells = plan('ipad-simulator-native', { modes: ['portrait-light'] });
    const withUndo = cells.filter((cell) => cell.args.includes(`--undo-count=${UNDO_COUNT}`));

    expect(withUndo.map((cell) => cell.item)).toEqual(['pen-undo']);
  });

  it('scores actions with one warmup plus three samples', () => {
    const actions = plan('ipad-simulator-native', { modes: ['portrait-light'] }).find(
      (cell) => cell.item === 'actions'
    );

    expect(actions.args).toContain(`--repeats=${ACTION_REPEATS}`);
  });

  it('keeps a valid red gate by reporting rather than stopping', () => {
    for (const cell of plan('ipad-simulator-native')) {
      expect(cell.args).toContain('--report-only');
    }
  });

  it('routes Android browser actions to direct CDP and its drawing to the split transport', () => {
    // Drawing moved off the Appium browser path after the 60 Hz controls
    // measured its per-run main-thread-stall distortion at stream statistics no
    // gate separates from real starvation (2026-08-26-appium-60hz-controls) —
    // the same routing the physical phone has carried since ADR-0135.
    const cells = plan('android-emulator-web', {
      modes: ['landscape-light'],
      host: {
        ...HOST,
        deviceId: 'emulator-5554',
        cdpPort: '9225',
        url: 'http://127.0.0.1:4173/',
        probeHost: 'http://192.168.0.9:4175',
      },
    });
    const actions = cells.find((cell) => cell.item === 'actions');
    const drawing = cells.find((cell) => cell.item === 'crayon');

    expect(actions.command).toBe('perf:android:browser:actions');
    expect(actions.args).toContain('--cdp-port=9225');
    expect(actions.args).not.toContain('--appium-url=http://127.0.0.1:4723');
    expect(drawing.command).toBe('perf:device:frames');
    expect(drawing.args).toContain('--platform=android');
    expect(drawing.args).toContain('--cdp-port=9225');
  });

  it('routes Android emulator native drawing through split input and actions through Appium', () => {
    const cells = plan('android-emulator-native', {
      modes: ['portrait-light'],
      items: ['pen-undo', 'actions'],
      host: {
        ...HOST,
        deviceId: 'emulator-5554',
        cdpPort: '9225',
        probeHost: 'http://192.168.0.9:4175',
      },
    });
    const drawing = cells.find((cell) => cell.item === 'pen-undo');
    const actions = cells.find((cell) => cell.item === 'actions');

    expect(drawing.command).toBe(SPLIT_SCREEN_COMMAND);
    expect(drawing.args).toContain('--platform=android');
    expect(drawing.args).toContain('--native-app');
    expect(drawing.args).toContain('--device-serial=emulator-5554');
    expect(drawing.args).toContain('--cdp-port=9225');
    expect(actions.command).toBe('perf:ios:xcuitest:actions');
    expect(actions.args).toContain('--native-app');
    expect(actions.args).toContain('--native-webview-class=android.webkit.WebView');
    expect(actions.args.some((arg) => arg.startsWith('--url='))).toBe(false);
  });

  // Issue 1297: the repeat count is part of the measurement contract, so the plan
  // records it per cell — read back from the args the child is given, never from
  // the constant directly, so the enforced contract cannot drift from the command.
  it('stamps the gesture-repeat contract on exactly the cells driven with the flag', () => {
    const cells = plan('ipad-device-web', { modes: ['portrait-light'] });
    const drawing = cells.find((cell) => cell.item === 'crayon');
    const actions = cells.find((cell) => cell.item === 'actions');

    expect(drawing.gestureRepeats).toBe(GESTURE_REPEATS);
    expect(actions.gestureRepeats).toBeNull();
    // Coverage asserted positively, not as a restatement of the derivation:
    // every drawing cell on a repeat-driving transport (everything but the
    // desktop targets, whose synthetic driver has no repeat concept) carries
    // the contract. A transport quietly dropping the flag fails here.
    for (const [targetId, target] of Object.entries(CAMPAIGN_TARGETS)) {
      for (const cell of plan(targetId)) {
        const expected =
          cell.item === 'actions' || target.transport === 'desktop' ? null : GESTURE_REPEATS;
        expect(cell.gestureRepeats, `${targetId} ${cell.id}`).toBe(expected);
      }
    }
  });

  // Issue 1292's companion contract: how the repeats are fed ink. Exactly the
  // repeat-driven cells carry a plan — the eraser's refilled, every other
  // brush's plain — and the desktop and action cells, which drive no gesture
  // plan, carry none to compare. Pinned to the literal strings the banked
  // artifacts record, so renaming the vocabulary cannot silently orphan them.
  it('stamps the gesture-plan contract on exactly the repeat-driven cells', () => {
    for (const [targetId, target] of Object.entries(CAMPAIGN_TARGETS)) {
      for (const cell of plan(targetId)) {
        const expected =
          cell.item === 'actions' || target.transport === 'desktop'
            ? null
            : cell.item === 'eraser'
              ? 'fixed-geometry-refilled'
              : 'fixed-geometry';
        expect(cell.gesturePlan, `${targetId} ${cell.id}`).toBe(expected);
      }
    }
  });

  // Issue 1301, resized by review: a bare Appium/CDP cell self-serves behind
  // the build-freshness guard, so it is a warned 'guarded-default', not a
  // refused unknown. Only a command the classifier does not know maps to null.
  it('names every cell’s server source, with bare Appium cells as guarded defaults', () => {
    const withUrl = { ...HOST, url: 'http://127.0.0.1:4173/', deviceId: 'emulator-5554' };
    // The bare/served Appium-browser shapes now come from the iPad Simulator —
    // the emulator's drawing is split-transport and appears as the second
    // probe-host case below.
    const bare = plan('ipad-simulator-web', { modes: ['portrait-light'] });
    const served = plan('ipad-simulator-web', { modes: ['portrait-light'], host: withUrl });
    const split = plan('android-device-web', {
      modes: ['portrait-light'],
      host: { ...withUrl, probeHost: 'http://192.168.0.9:4175' },
    });
    const native = plan('ipad-simulator-native', { modes: ['portrait-light'] });
    const desktop = plan('mac-chrome', { modes: ['portrait-light'] });

    expect(bare.every((cell) => cellServerSource(cell) === 'guarded-default')).toBe(true);
    expect(served.every((cell) => cellServerSource(cell) === 'explicit-url')).toBe(true);
    expect(cellServerSource(split.find((cell) => cell.item === 'crayon'))).toBe('probe-host');
    const emulator = plan('android-emulator-web', {
      modes: ['portrait-light'],
      host: { ...withUrl, probeHost: 'http://192.168.0.9:4175' },
    });
    expect(cellServerSource(emulator.find((cell) => cell.item === 'crayon'))).toBe('probe-host');
    expect(native.every((cell) => cellServerSource(cell) === 'native-server-url')).toBe(true);
    expect(desktop.every((cell) => cellServerSource(cell) === 'self-served')).toBe(true);
    expect(cellServerSource({ command: 'perf:not-a-command', args: [] })).toBeNull();
  });

  it('rejects an unknown target, mode, or item by name', () => {
    expect(() => campaignTarget('nope')).toThrow('Unknown campaign target nope');
    expect(() => plan('ipad-simulator-native', { modes: ['sideways'] })).toThrow(
      'Unknown campaign mode sideways'
    );
    expect(() => plan('ipad-simulator-native', { items: ['airbrush'] })).toThrow(
      'Unknown campaign item airbrush'
    );
  });

  it('separates a drawing artifact from an action artifact within one mode', () => {
    const mode = CAMPAIGN_MODES[0];

    expect(artifactPath('out', 't', mode, 'pen-undo')).toBe(
      `out/t/${mode.id}/pen-real-screen.json`
    );
    expect(artifactPath('out', 't', mode, 'actions')).toBe(`out/t/${mode.id}/actions/actions.json`);
  });
});

describe('campaign device class', () => {
  it('tells the Appium action runner which class it queued', () => {
    const [cell] = planCampaign('ipad-device-web', {
      modes: ['portrait-light'],
      items: ['actions'],
      outputRoot: 'out',
      host: { deviceId: 'udid', url: 'http://host/' },
    });

    expect(cell.args).toContain('--device-class=tablet');
  });

  it('does not pass it to the CDP runner, which rejects unknown flags', () => {
    const [cell] = planCampaign('android-device-web', {
      modes: ['portrait-light'],
      items: ['actions'],
      outputRoot: 'out',
      host: { deviceId: 'serial', url: 'http://host/' },
    });

    expect(cell.command).toBe('perf:android:browser:actions');
    expect(cell.args.some((arg) => arg.startsWith('--device-class'))).toBe(false);
  });

  it('leaves drawing cells alone — the ledger is an action-gate concern', () => {
    const [cell] = planCampaign('ipad-device-web', {
      modes: ['portrait-light'],
      items: ['pen-undo'],
      outputRoot: 'out',
      host: { deviceId: 'udid', url: 'http://host/' },
    });

    expect(cell.args.some((arg) => arg.startsWith('--device-class'))).toBe(false);
  });

  // Only the Appium actions runner reads the class, and a desktop cell never
  // reaches it — but the point of this check is that no target arrives without
  // declaring what it is, so the vocabulary grows rather than the check narrowing.
  it('classes every target, so a new one cannot silently arrive without one', () => {
    for (const [id, target] of Object.entries(CAMPAIGN_TARGETS)) {
      expect(['tablet', 'handset', 'desktop'], `${id} needs a deviceClass`).toContain(
        target.deviceClass
      );
    }
  });
});

describe('campaign artifact acceptance', () => {
  it('accepts a native cell only when the capture attached to the app WebView', () => {
    expect(
      artifactMatchesRuntime(
        { transport: 'native-capacitor-webview', appUrl: 'capacitor://localhost' },
        'native'
      )
    ).toBe(true);
    // The split runner's native artifact (issue 1274): the nativeApp fact
    // counts only on the transports that legitimately carry it.
    expect(
      artifactMatchesRuntime(
        {
          transport: 'split-input-measurement',
          nativeApp: true,
          platform: 'android',
          nativePackage: 'art.splotch.app',
        },
        'native'
      )
    ).toBe(true);
    expect(
      artifactMatchesRuntime({ transport: 'split-input-measurement', nativeApp: false }, 'web')
    ).toBe(true);
    expect(
      artifactMatchesRuntime(
        {
          transport: 'split-input-measurement',
          nativeApp: true,
          platform: 'android',
          nativePackage: 'art.splotch.app',
        },
        'web'
      )
    ).toBe(false);
    // Fail closed on contradiction (PR 1380 review): a browser artifact
    // wearing a stray nativeApp flag matches NEITHER runtime — accepting it
    // for a native cell is the wrong-runtime banking this guard exists to
    // stop, and accepting it for a web cell would trust a field the browser
    // transport never writes.
    expect(artifactMatchesRuntime({ transport: 'browser', nativeApp: true }, 'native')).toBe(false);
    expect(artifactMatchesRuntime({ transport: 'browser', nativeApp: true }, 'web')).toBe(false);
    expect(artifactMatchesRuntime({ transport: 'browser' }, 'web')).toBe(true);
    expect(artifactMatchesRuntime({ transport: 'browser' }, 'native')).toBe(false);
  });

  it('requires a packaged page when Appium records the native app URL', () => {
    expect(artifactMatchesRuntime({ transport: 'native-capacitor-webview' }, 'native')).toBe(false);
    expect(
      artifactMatchesRuntime(
        { transport: 'native-capacitor-webview', appUrl: 'capacitor://localhost/?perf-run=1' },
        'native'
      )
    ).toBe(true);
    expect(
      artifactMatchesRuntime(
        { transport: 'native-capacitor-webview', appUrl: 'https://localhost/?perf-run=1' },
        'native'
      )
    ).toBe(true);
    expect(
      artifactMatchesRuntime(
        { transport: 'native-capacitor-webview', appUrl: 'http://192.168.40.53:4173/' },
        'native'
      )
    ).toBe(false);
  });

  it('requires Android split captures to measure the foreground package', () => {
    const capture = {
      transport: 'split-input-measurement',
      nativeApp: true,
      platform: 'android',
    };

    expect(artifactMatchesRuntime(capture, 'native')).toBe(false);
    expect(
      artifactMatchesRuntime({ ...capture, nativePackage: 'com.android.chrome' }, 'native')
    ).toBe(false);
    expect(artifactMatchesRuntime({ ...capture, nativePackage: 'art.splotch.app' }, 'native')).toBe(
      true
    );
  });

  it('rejects a web cell that attached to the installed app instead', () => {
    expect(
      artifactMatchesRuntime(
        { transport: 'native-capacitor-webview', appUrl: 'capacitor://localhost' },
        'web'
      )
    ).toBe(false);
  });

  it('accepts both web transports, so a CDP action sweep is not mistaken for a miss', () => {
    expect(artifactMatchesRuntime({ transport: 'browser' }, 'web')).toBe(true);
    expect(artifactMatchesRuntime({ transport: 'android-chrome-cdp' }, 'web')).toBe(true);
  });

  it('treats a capture that names no transport as a web capture, not a native one', () => {
    expect(artifactMatchesRuntime({}, 'web')).toBe(true);
    expect(artifactMatchesRuntime({}, 'native')).toBe(false);
  });
});

describe('campaign ledger', () => {
  const row = (cell, status, attempt) =>
    ['2026-08-21T00:00:00Z', cell, status, String(attempt), 'a.json', '-'].join('\t');
  const ledger = (...lines) =>
    parseLedger(['timestamp\tcell\tstatus\tattempt\tartifact\tlog', ...lines].join('\n'));

  it('counts only failed attempts against the retry budget', () => {
    const rows = ledger(
      row('portrait-light/pen-undo', `${FAILED}-exit-1`, 1),
      row('portrait-light/pen-undo', `${FAILED}-exit-1`, 2),
      row('portrait-light/crayon', 'valid-json-exit-0', 1)
    );

    expect(attemptsFor(rows, 'portrait-light/pen-undo')).toBe(2);
    expect(attemptsFor(rows, 'portrait-light/crayon')).toBe(0);
  });

  it('never re-runs a cell whose artifact already parses', () => {
    expect(nextAction([], 'any', { artifactValid: true, maxAttempts: 3 })).toEqual({
      action: 'skip',
      reason: ALREADY_VALID,
    });
  });

  it('retries a failed cell until the budget is spent, then records a P1', () => {
    const failures = (count) =>
      ledger(...Array.from({ length: count }, (_, i) => row('c', `${FAILED}-exit-1`, i + 1)));

    expect(nextAction(failures(0), 'c', { artifactValid: false, maxAttempts: 3 })).toMatchObject({
      action: 'run',
      attempt: 1,
    });
    expect(nextAction(failures(2), 'c', { artifactValid: false, maxAttempts: 3 })).toMatchObject({
      action: 'run',
      attempt: 3,
    });
    expect(nextAction(failures(3), 'c', { artifactValid: false, maxAttempts: 3 })).toMatchObject({
      action: 'p1',
    });
  });

  it('treats a completed cell as complete regardless of earlier failures', () => {
    const rows = ledger(row('c', `${FAILED}-exit-1`, 1), row('c', 'valid-json-exit-0', 2));

    expect(isComplete(rows, 'c')).toBe(true);
  });

  it('summarizes a partially finished run for resume', () => {
    const cells = plan('ipad-simulator-native', {
      modes: ['portrait-light'],
      items: ['pen-undo', 'crayon'],
    });
    const done = cells[0].artifact;
    const rows = ledger(row(cells[1].id, `${FAILED}-exit-1`, 1));

    const summary = summarize(cells, rows, (artifact) => artifact === done);

    expect(summary).toMatchObject({
      total: 2,
      complete: [cells[0].id],
      outstanding: [cells[1].id],
    });
  });
});

const SPLIT_HOST = {
  deviceId: 'R5CRC3AVCXM',
  probeHost: 'http://192.168.1.9:4175',
  cdpPort: '9234',
  url: 'http://127.0.0.1:4173/',
};

describe('split transport', () => {
  const splitCells = (options = {}) =>
    planCampaign('android-device-web', {
      outputRoot: 'out',
      host: SPLIT_HOST,
      modes: ['landscape-light'],
      ...options,
    });

  it('drives the physical Android drawing cells through the split transport', () => {
    for (const cell of splitCells({ items: ['pen-undo', 'crayon', 'magic', 'eraser'] })) {
      expect(cell.command).toBe(SPLIT_SCREEN_COMMAND);
      expect(cell.args).toContain('--platform=android');
      expect(cell.args).toContain('--device-serial=R5CRC3AVCXM');
      expect(cell.args).toContain('--host=http://192.168.1.9:4175');
    }
  });

  it('forwards the owned CDP port to both Android transports', () => {
    const actions = splitCells({ items: ['actions'] })[0];
    const drawing = splitCells({ items: ['crayon'] })[0];

    expect(actions.command).toBe('perf:android:browser:actions');
    expect(actions.args).toContain('--cdp-port=9234');
    expect(drawing.command).toBe(SPLIT_SCREEN_COMMAND);
    expect(drawing.args).toContain('--cdp-port=9234');
  });

  it('never passes the split runner an Appium flag it would ignore', () => {
    const [cell] = splitCells({ items: ['crayon'] });

    for (const ignored of ['--appium-url', '--capabilities-file', '--device-id', '--url']) {
      expect(cell.args.some((arg) => arg.startsWith(ignored))).toBe(false);
    }
  });

  // A flag the runner silently drops is the shape of every defect this campaign
  // found, so the omissions are asserted rather than left to the runner's tolerance.
  it('omits the undo phase and --report-only, which the split runner does not implement', () => {
    const [pen] = splitCells({ items: ['pen-undo'] });

    expect(pen.args.some((arg) => arg.startsWith('--undo-count'))).toBe(false);
    expect(pen.args).not.toContain('--report-only');
  });

  // Issue 1274: the Appium transport under-drives this device (47.81 moves/s,
  // issue 1217), so every android-device-native drawing cell it produced was
  // unscoreable. Drawing rides the split transport into the installed app;
  // actions stay on Appium, which drives discrete taps fine.
  it('drives the physical Android NATIVE drawing cells through the split transport', () => {
    const cells = planCampaign('android-device-native', {
      outputRoot: 'out',
      host: SPLIT_HOST,
      modes: ['landscape-light'],
      items: ['pen-undo', 'crayon', 'actions'],
    });
    const drawing = cells.filter((cell) => cell.item !== 'actions');
    const actions = cells.find((cell) => cell.item === 'actions');

    for (const cell of drawing) {
      expect(cell.command).toBe(SPLIT_SCREEN_COMMAND);
      expect(cell.args).toContain('--platform=android');
      expect(cell.args).toContain('--native-app');
      expect(cell.args).toContain('--device-serial=R5CRC3AVCXM');
    }
    expect(actions.command).toBe('perf:ios:xcuitest:actions');
    expect(actions.args).toContain('--native-app');
  });

  it('keeps the Appium targets on the Appium path', () => {
    const [cell] = planCampaign('ipad-device-web', {
      outputRoot: 'out',
      host: HOST,
      modes: ['landscape-light'],
      items: ['crayon'],
    });

    expect(cell.command).toBe('perf:ios:xcuitest:screen');
    expect(cell.args).toContain('--report-only');
  });
});

describe('probeHostProblem', () => {
  it('rejects a loopback address the device could never reach', () => {
    expect(probeHostProblem('http://127.0.0.1:4175')).toMatch(/loopback/);
    expect(probeHostProblem('http://localhost:4175')).toMatch(/loopback/);
  });

  // The regression this covers: the first version matched a set of exact
  // spellings, and an IPv4-mapped loopback walked straight past it — the campaign
  // then ran on against a host the phone can never reach. URL parsing normalizes
  // that form to [::ffff:7f00:1], so the text cannot be matched either.
  it('rejects loopback however it is spelled', () => {
    for (const host of [
      'http://[::ffff:127.0.0.1]:4201',
      'http://[::ffff:7f00:1]:4201',
      'http://[0:0:0:0:0:ffff:127.0.0.1]:4201',
      'http://127.1.2.3:4175',
      'http://[::1]:4175',
      'http://foo.localhost:4175',
    ]) {
      expect(probeHostProblem(host), host).toMatch(/loopback/);
    }
  });

  it('rejects the unspecified addresses, which are equally unroutable', () => {
    expect(probeHostProblem('http://0.0.0.0:4175')).toMatch(/loopback/);
    expect(probeHostProblem('http://[::]:4175')).toMatch(/loopback/);
  });

  it('accepts routable v4 and v6 addresses', () => {
    for (const host of [
      'http://192.168.40.53:4175',
      'http://10.0.0.5:4175',
      'http://[fe80::1]:4175',
      'http://[2001:db8::1]:4175',
    ]) {
      expect(probeHostProblem(host), host).toBeNull();
    }
  });

  it('rejects a missing or unparseable host', () => {
    expect(probeHostProblem(undefined)).toMatch(/--probe-host=/);
    expect(probeHostProblem('nonsense')).toMatch(/not a URL/);
  });

  it('accepts a LAN address', () => {
    expect(probeHostProblem('http://192.168.1.9:4175')).toBeNull();
  });
});

describe('artifactPassedFidelity — a missing verdict', () => {
  // The regression this covers: a stale split artifact with no `fidelity` block was
  // banked as valid-json, because tolerance for a missing verdict was global rather
  // than per transport — and it failed open on the one transport whose verdict is
  // mandatory.
  it('is refused for a transport that always writes one', () => {
    const stale = { transport: 'split-input-measurement' };

    expect(artifactPassedFidelity(stale, { verdictRequired: true })).toBe(false);
  });

  it('is tolerated for a transport that reports none', () => {
    expect(artifactPassedFidelity({ viewport: { width: 1366, height: 915 } })).toBe(true);
  });

  it('marks the split and Appium screen commands as verdict-reporting, desktop not', () => {
    expect(commandReportsFidelity(SPLIT_SCREEN_COMMAND)).toBe(true);
    expect(commandReportsFidelity('perf:ios:xcuitest:screen')).toBe(true);
    expect(commandReportsFidelity('perf:web:frames')).toBe(false);
    expect(commandReportsFidelity('perf:web:actions')).toBe(false);
  });

  it('is carried on every planned cell so inspection does not have to guess', () => {
    const [split] = planCampaign('android-device-web', {
      outputRoot: 'out',
      host: SPLIT_HOST,
      modes: ['landscape-light'],
      items: ['crayon'],
    });
    const [desktop] = planCampaign('mac-chrome', {
      outputRoot: 'out',
      host: { url: 'http://127.0.0.1:4193/' },
      modes: ['landscape-light'],
      items: ['crayon'],
    });

    expect(split.reportsFidelity).toBe(true);
    expect(desktop.reportsFidelity).toBe(false);
  });
});

describe('artifactPassedFidelity', () => {
  // The split runner writes the artifact and THEN fails the gate, so a capture that
  // must not be scored parses and names the right runtime. Acceptance that reads
  // only those two banks it.
  it('rejects a capture that parsed and failed its fidelity verdict', () => {
    expect(
      artifactPassedFidelity({ transport: 'split-input-measurement', fidelity: { passed: false } })
    ).toBe(false);
  });

  it('accepts a passing verdict and a path that reports none', () => {
    expect(artifactPassedFidelity({ fidelity: { passed: true } })).toBe(true);
    expect(artifactPassedFidelity({ transport: 'browser' })).toBe(true);
  });
});

describe('unscoreable ledger rows', () => {
  // "Every row is missing-or-invalid-json and no artifact was produced" is the read
  // that makes clearing a ledger safe. A fidelity failure must not look like that.
  it('spends an attempt without claiming the artifact was missing', () => {
    const rows = parseLedger(
      [
        'timestamp\tcell\tstatus\tattempt\tartifact\tlog',
        `t1\tlandscape-light/crayon\t${UNSCOREABLE}-exit-1\t1\ta\t-`,
        `t2\tlandscape-light/crayon\t${FAILED}-exit-1\t2\ta\t-`,
      ].join('\n')
    );

    expect(attemptsFor(rows, 'landscape-light/crayon')).toBe(2);
    expect(isComplete(rows, 'landscape-light/crayon')).toBe(false);
  });
});

describe('entryModulePath', () => {
  it('finds the SvelteKit entry module a served page names', () => {
    const html = '<html><body><script>import("/_app/immutable/entry/start.C3xK9a.js")</script>';

    expect(entryModulePath(html)).toBe('/_app/immutable/entry/start.C3xK9a.js');
  });

  // Server-rendered markup answers every selector whether or not the app
  // hydrated, so "the page loaded" proves nothing about the build behind it.
  it('reports no entry for a page that names none', () => {
    expect(entryModulePath('<html><body><canvas></canvas></body></html>')).toBeNull();
    expect(entryModulePath(undefined)).toBeNull();
  });
});

describe('desktop transport', () => {
  const desktopCells = (targetId, options = {}) =>
    planCampaign(targetId, {
      outputRoot: 'out',
      host: { url: 'http://127.0.0.1:4193/' },
      modes: ['landscape-light'],
      ...options,
    });

  it('routes desktop drawing and actions to the Playwright commands', () => {
    const drawing = desktopCells('mac-chrome', { items: ['crayon'] })[0];
    const actions = desktopCells('mac-chrome', { items: ['actions'] })[0];

    expect(drawing.command).toBe('perf:web:frames');
    expect(actions.command).toBe('perf:web:actions');
    expect(drawing.args).toContain('--engine=chromium');
    expect(actions.args).toContain('--engine=chromium');
  });

  it('gives each desktop target its own engine', () => {
    const engineOf = (targetId) =>
      desktopCells(targetId, { items: ['pen-undo'] })[0].args.find((arg) =>
        arg.startsWith('--engine=')
      );

    expect(engineOf('mac-chrome')).toBe('--engine=chromium');
    expect(engineOf('mac-safari')).toBe('--engine=webkit');
    expect(engineOf('mac-firefox')).toBe('--engine=firefox');
  });

  // The desktop capture records no orientation field. The matrix derives it back
  // from the viewport and refuses a capture whose derived mode disagrees with the
  // cell it was filed under, so the viewport IS the orientation here.
  it('carries orientation as a viewport shape the matrix can derive back', () => {
    const landscape = desktopCells('mac-chrome', { items: ['crayon'] })[0];
    const portrait = desktopCells('mac-chrome', {
      items: ['crayon'],
      modes: ['portrait-dark'],
    })[0];

    expect(landscape.args).toContain(`--viewport=${desktopViewport('LANDSCAPE')}`);
    expect(portrait.args).toContain(`--viewport=${desktopViewport('PORTRAIT')}`);

    const [lw, lh] = desktopViewport('LANDSCAPE').split('x').map(Number);
    const [pw, ph] = desktopViewport('PORTRAIT').split('x').map(Number);
    expect(lw).toBeGreaterThan(lh);
    expect(pw).toBeLessThan(ph);
  });

  it('drives undo from the pen cell so it carries that cell shape and theme', () => {
    const pen = desktopCells('mac-chrome', { items: ['pen-undo'] })[0];
    const crayon = desktopCells('mac-chrome', { items: ['crayon'] })[0];

    expect(pen.args).toContain(`--undo-count=${UNDO_COUNT}`);
    expect(crayon.args.some((arg) => arg.startsWith('--undo-count'))).toBe(false);
  });

  it('never passes a desktop cell a device flag', () => {
    const cell = desktopCells('mac-firefox', { items: ['magic'] })[0];

    for (const ignored of ['--device-id', '--appium-url', '--native-app', '--platform']) {
      expect(cell.args.some((arg) => arg.startsWith(ignored))).toBe(false);
    }
  });
});

describe('completedCells', () => {
  const rows = (lines) =>
    parseLedger(['timestamp\tcell\tstatus\tattempt\tartifact\tlog', ...lines].join('\n'));

  // A row-count watcher stopped a 20-cell target five cells early on 2026-08-23,
  // because the ledger is append-only and its line count is not its cell count.
  it('counts distinct cells, not ledger rows', () => {
    const ledger = rows([
      `t1\tportrait-light/crayon\t${FAILED}-exit-1\t1\ta\t-`,
      `t2\tportrait-light/crayon\t${COMPLETE}-exit-0\t2\ta\t-`,
      `t3\tportrait-dark/crayon\t${COMPLETE}-exit-0\t1\tb\t-`,
    ]);

    expect(completedCells(ledger).size).toBe(2);
  });

  // A resumed run records already-valid for work it skipped, so a valid-json
  // filter reported a finished target as a third done.
  it('counts a resumed run’s skipped cells as complete', () => {
    const ledger = rows([
      `t1\tportrait-light/crayon\t${ALREADY_VALID}\t0\ta\t-`,
      `t2\tportrait-dark/crayon\t${COMPLETE}-exit-0\t1\tb\t-`,
    ]);

    expect([...completedCells(ledger)].sort()).toEqual([
      'portrait-dark/crayon',
      'portrait-light/crayon',
    ]);
  });

  it('does not count a failed or unscoreable attempt', () => {
    const ledger = rows([
      `t1\ta/crayon\t${FAILED}-exit-1\t1\ta\t-`,
      `t2\tb/crayon\t${UNSCOREABLE}-exit-1\t1\tb\t-`,
    ]);

    expect(completedCells(ledger).size).toBe(0);
  });
});

describe('campaignProgress', () => {
  const plan = [
    { id: 'portrait-light/crayon', artifact: 'a.json', reportsFidelity: true },
    { id: 'portrait-light/pen-undo', artifact: 'b.json', reportsFidelity: true },
  ];
  const inspectOnly = (okFor) => (cell) =>
    cell.artifact === okFor ? { ok: true, status: COMPLETE } : { ok: false, status: FAILED };

  it('counts a landed artifact even with no ledger row for it', () => {
    const progress = campaignProgress(plan, {
      runtime: 'web',
      ledgerRows: [],
      inspect: inspectOnly('a.json'),
    });

    expect(progress.done).toEqual(['portrait-light/crayon']);
    expect(progress.outstanding).toMatchObject([{ cell: 'portrait-light/pen-undo', attempts: 0 }]);
  });

  it('reports attempts already spent on each outstanding cell', () => {
    const ledgerRows = parseLedger(
      [
        'timestamp\tcell\tstatus\tattempt\tartifact\tlog',
        `t1\tportrait-light/pen-undo\t${FAILED}-exit-1\t1\tb\t-`,
        `t2\tportrait-light/pen-undo\t${FAILED}-exit-1\t2\tb\t-`,
      ].join('\n')
    );

    const progress = campaignProgress(plan, {
      runtime: 'web',
      ledgerRows,
      inspect: () => ({ ok: false, status: FAILED }),
    });

    expect(progress.outstanding).toContainEqual(
      expect.objectContaining({ cell: 'portrait-light/pen-undo', attempts: 2 })
    );
  });

  // The regression this covers: completion was `landed || ledgerSaysDone`, so a
  // COMPLETE row certified a cell whose artifact had been deleted, corrupted or
  // replaced with the wrong runtime — while the runner would rerun it.
  it('does not let a ledger row certify a cell whose artifact is gone', () => {
    const ledgerRows = parseLedger(
      [
        'timestamp\tcell\tstatus\tattempt\tartifact\tlog',
        `t1\tportrait-light/crayon\t${COMPLETE}-exit-0\t1\ta\t-`,
      ].join('\n')
    );

    const progress = campaignProgress(plan, {
      runtime: 'web',
      ledgerRows,
      inspect: () => ({ ok: false, status: FAILED }),
    });

    expect(progress.done).toEqual([]);
    expect(progress.outstanding).toContainEqual(
      expect.objectContaining({ cell: 'portrait-light/crayon', ledgerDisagrees: true })
    );
  });
});

describe('entryModulePath', () => {
  it('finds the SvelteKit entry module a served page names', () => {
    const html = '<html><body><script>import("/_app/immutable/entry/start.C3xK9a.js")</script>';

    expect(entryModulePath(html)).toBe('/_app/immutable/entry/start.C3xK9a.js');
  });

  // Server-rendered markup answers every selector whether or not the app
  // hydrated, so "the page loaded" proves nothing about the build behind it.
  it('reports no entry for a page that names none', () => {
    expect(entryModulePath('<html><body><canvas></canvas></body></html>')).toBeNull();
    expect(entryModulePath(undefined)).toBeNull();
  });
});

describe('desktop transport', () => {
  const desktopCells = (targetId, options = {}) =>
    planCampaign(targetId, {
      outputRoot: 'out',
      host: { url: 'http://127.0.0.1:4193/' },
      modes: ['landscape-light'],
      ...options,
    });

  it('routes desktop drawing and actions to the Playwright commands', () => {
    const drawing = desktopCells('mac-chrome', { items: ['crayon'] })[0];
    const actions = desktopCells('mac-chrome', { items: ['actions'] })[0];

    expect(drawing.command).toBe('perf:web:frames');
    expect(actions.command).toBe('perf:web:actions');
    expect(drawing.args).toContain('--engine=chromium');
    expect(actions.args).toContain('--engine=chromium');
  });

  it('gives each desktop target its own engine', () => {
    const engineOf = (targetId) =>
      desktopCells(targetId, { items: ['pen-undo'] })[0].args.find((arg) =>
        arg.startsWith('--engine=')
      );

    expect(engineOf('mac-chrome')).toBe('--engine=chromium');
    expect(engineOf('mac-safari')).toBe('--engine=webkit');
    expect(engineOf('mac-firefox')).toBe('--engine=firefox');
  });

  // The desktop capture records no orientation field. The matrix derives it back
  // from the viewport and refuses a capture whose derived mode disagrees with the
  // cell it was filed under, so the viewport IS the orientation here.
  it('carries orientation as a viewport shape the matrix can derive back', () => {
    const landscape = desktopCells('mac-chrome', { items: ['crayon'] })[0];
    const portrait = desktopCells('mac-chrome', {
      items: ['crayon'],
      modes: ['portrait-dark'],
    })[0];

    expect(landscape.args).toContain(`--viewport=${desktopViewport('LANDSCAPE')}`);
    expect(portrait.args).toContain(`--viewport=${desktopViewport('PORTRAIT')}`);

    const [lw, lh] = desktopViewport('LANDSCAPE').split('x').map(Number);
    const [pw, ph] = desktopViewport('PORTRAIT').split('x').map(Number);
    expect(lw).toBeGreaterThan(lh);
    expect(pw).toBeLessThan(ph);
  });

  it('drives undo from the pen cell so it carries that cell shape and theme', () => {
    const pen = desktopCells('mac-chrome', { items: ['pen-undo'] })[0];
    const crayon = desktopCells('mac-chrome', { items: ['crayon'] })[0];

    expect(pen.args).toContain(`--undo-count=${UNDO_COUNT}`);
    expect(crayon.args.some((arg) => arg.startsWith('--undo-count'))).toBe(false);
  });

  it('never passes a desktop cell a device flag', () => {
    const cell = desktopCells('mac-firefox', { items: ['magic'] })[0];

    for (const ignored of ['--device-id', '--appium-url', '--native-app', '--platform']) {
      expect(cell.args.some((arg) => arg.startsWith(ignored))).toBe(false);
    }
  });
});

describe('completedCells', () => {
  const rows = (lines) =>
    parseLedger(['timestamp\tcell\tstatus\tattempt\tartifact\tlog', ...lines].join('\n'));

  // A row-count watcher stopped a 20-cell target five cells early on 2026-08-23,
  // because the ledger is append-only and its line count is not its cell count.
  it('counts distinct cells, not ledger rows', () => {
    const ledger = rows([
      `t1\tportrait-light/crayon\t${FAILED}-exit-1\t1\ta\t-`,
      `t2\tportrait-light/crayon\t${COMPLETE}-exit-0\t2\ta\t-`,
      `t3\tportrait-dark/crayon\t${COMPLETE}-exit-0\t1\tb\t-`,
    ]);

    expect(completedCells(ledger).size).toBe(2);
  });

  // A resumed run records already-valid for work it skipped, so a valid-json
  // filter reported a finished target as a third done.
  it('counts a resumed run’s skipped cells as complete', () => {
    const ledger = rows([
      `t1\tportrait-light/crayon\t${ALREADY_VALID}\t0\ta\t-`,
      `t2\tportrait-dark/crayon\t${COMPLETE}-exit-0\t1\tb\t-`,
    ]);

    expect([...completedCells(ledger)].sort()).toEqual([
      'portrait-dark/crayon',
      'portrait-light/crayon',
    ]);
  });

  it('does not count a failed or unscoreable attempt', () => {
    const ledger = rows([
      `t1\ta/crayon\t${FAILED}-exit-1\t1\ta\t-`,
      `t2\tb/crayon\t${UNSCOREABLE}-exit-1\t1\tb\t-`,
    ]);

    expect(completedCells(ledger).size).toBe(0);
  });
});

describe('isProbePlan', () => {
  // The regression this covers: a plain-text server answering `not a probe` with
  // status 200 on the requested port satisfied the old check, and the campaign ran
  // on — recreating the page-timeout failure the guard exists to eliminate.
  it('rejects a 200 that is not the probe protocol', () => {
    expect(isProbePlan('not a probe')).toBe(false);
    expect(isProbePlan(null)).toBe(false);
    expect(isProbePlan({})).toBe(false);
    expect(isProbePlan({ ok: true })).toBe(false);
    expect(isProbePlan([{ label: 'run', finish: false, contactMs: 1 }])).toBe(false);
  });

  // The shape a running `perf:device:serve` actually answers with, taken from one.
  it('accepts the plan the probe host serves', () => {
    expect(isProbePlan({ brush: 'pen', contactMs: 600000, finish: false, label: 'run' })).toBe(
      true
    );
  });

  it('rejects a plan missing any required field', () => {
    expect(isProbePlan({ contactMs: 1, finish: false })).toBe(false);
    expect(isProbePlan({ label: 'run', contactMs: 1 })).toBe(false);
    expect(isProbePlan({ label: 'run', finish: false })).toBe(false);
  });
});

describe('servedBuildFingerprintProblem', () => {
  // A synthetic build rather than the real web/build: CI's unit job runs no build,
  // and a test that reads the real one passes only where a build happens to exist.
  const fakeBuild = () => {
    const dir = mkdtempSync(join(tmpdir(), 'splotch-build-'));
    mkdirSync(join(dir, '_app', 'immutable', 'entry'), { recursive: true });
    writeFileSync(
      join(dir, 'index.html'),
      '<script>import("/_app/immutable/entry/start.Aaa.js")</script>'
    );
    writeFileSync(
      join(dir, '_app', 'immutable', 'entry', 'start.Aaa.js'),
      'import "/_app/immutable/entry/app.Bbb.js";'
    );
    writeFileSync(join(dir, '_app', 'immutable', 'entry', 'app.Bbb.js'), 'export const app = 1;');
    for (const file of WEB_ONLY_STATIC_FILES) writeFileSync(join(dir, file), '');
    return dir;
  };
  const serveFrom =
    (dir, mutate = (path, body) => body) =>
    async (url) => {
      const path = new URL(url, 'http://x/').pathname;
      const file = path === '/' ? join(dir, 'index.html') : join(dir, path);
      return mutate(path, readFileSync(file, 'utf8'));
    };

  it('accepts a build served byte for byte', async () => {
    const dir = fakeBuild();

    expect(
      await servedBuildFingerprintProblem('http://x/', { fetchText: serveFrom(dir), buildDir: dir })
    ).toBeNull();
  });

  // The regression this covers: matching the ENTRY FILENAME is not identity. The
  // entry is runtime plumbing that can be byte-identical while application chunks
  // differ, so a foreign URL plus this checkout's entry path passed unchallenged.
  it('rejects a build whose entry matches but whose application chunk differs', async () => {
    const dir = fakeBuild();
    const fetchText = serveFrom(dir, (path, body) =>
      path.endsWith('app.Bbb.js') ? `${body}\n/* different build */` : body
    );

    expect(await servedBuildFingerprintProblem('http://x/', { fetchText, buildDir: dir })).toMatch(
      /different content/
    );
  });

  it('rejects a chunk this checkout does not have at all', async () => {
    const dir = fakeBuild();
    const fetchText = async (url) =>
      new URL(url, 'http://x/').pathname === '/'
        ? '<script>import("/_app/immutable/entry/start.NotOurs.js")</script>'
        : '';

    expect(await servedBuildFingerprintProblem('http://x/', { fetchText, buildDir: dir })).toMatch(
      /does not contain/
    );
  });

  it('skips the comparison only when a foreign build is explicitly allowed', async () => {
    const dir = fakeBuild();
    const fetchText = async () =>
      '<script>import("/_app/immutable/entry/start.NotOurs.js")</script>';

    expect(
      await servedBuildFingerprintProblem('http://x/', {
        fetchText,
        buildDir: dir,
        allowForeignBuild: true,
      })
    ).toBeNull();
  });
});

describe('resolvedProbeHostProblem', () => {
  const resolving = (byHost) => async (host) => {
    if (!(host in byHost)) throw new Error('ENOTFOUND');
    return byHost[host];
  };

  // The regression this covers: classifying the hostname TEXT let ordinary names
  // that DNS resolves to loopback through — localtest.me, lvh.me and the *.nip.io
  // family — so the campaign ran on against a host answering only to this machine.
  it('rejects a name that resolves to loopback', async () => {
    const lookup = resolving({
      'localtest.me': ['127.0.0.1'],
      'lvh.me': ['127.0.0.1'],
      '127.0.0.2.nip.io': ['127.0.0.2'],
    });

    for (const host of ['localtest.me', 'lvh.me', '127.0.0.2.nip.io']) {
      expect(await resolvedProbeHostProblem(`http://${host}:4175`, { lookup }), host).toMatch(
        /loopback/
      );
    }
  });

  // One loopback answer among several is still a host the device may connect to
  // itself on.
  it('rejects a name where any answer is loopback', async () => {
    const lookup = resolving({ 'split.example': ['192.168.40.53', '127.0.0.1'] });

    expect(await resolvedProbeHostProblem('http://split.example:4175', { lookup })).toMatch(
      /loopback/
    );
  });

  it('accepts a name that resolves only to routable addresses', async () => {
    const lookup = resolving({ 'rig.example': ['192.168.40.53', 'fe80::1'] });

    expect(await resolvedProbeHostProblem('http://rig.example:4175', { lookup })).toBeNull();
  });

  it('rejects a name that does not resolve at all', async () => {
    expect(
      await resolvedProbeHostProblem('http://nowhere.example:4175', { lookup: resolving({}) })
    ).toMatch(/does not resolve/);
  });

  it('still catches a literal loopback before reaching DNS', async () => {
    const lookup = async () => {
      throw new Error('should not be consulted');
    };

    expect(await resolvedProbeHostProblem('http://127.0.0.1:4175', { lookup })).toMatch(/loopback/);
  });
});

// The campaign accepts --device-id and forwards --device-serial to the child. An
// operator who passes the child's spelling has it silently dropped, and then every
// cell fails on a message naming a flag they did not type. That cost a 20-cell
// target sixty attempts of real device time on 2026-08-23.
describe('a split-transport target without its device identity', () => {
  const android = { id: 'android-device-web', transport: 'split', splitPlatform: 'android' };
  const ios = { id: 'ipad-device-web', transport: 'split', splitPlatform: 'ios' };

  it('refuses to start, and names the flag the campaign actually takes', () => {
    const problem = splitTransportIdentityProblem(android, {});

    expect(problem).toContain('--device-id');
    expect(problem).toContain('android-device-web');
  });

  it('names WebDriverAgent for the iOS half', () => {
    expect(splitTransportIdentityProblem(ios, {})).toContain('--wda-url');
  });

  it('is satisfied once the identity is supplied', () => {
    expect(splitTransportIdentityProblem(android, { deviceId: 'R5CRC3AVCXM' })).toBeNull();
    expect(splitTransportIdentityProblem(ios, { wdaUrl: 'http://127.0.0.1:8110' })).toBeNull();
  });

  // Every other transport carries its identity differently, and answering for
  // them here would reject a target this has no business judging.
  it('says nothing about a target that does not use the split transport', () => {
    expect(splitTransportIdentityProblem({ id: 'mac-chrome' }, {})).toBeNull();
  });
});

// A drawing capture records `summaries` as an object carrying `intervalMs`. The
// action runner records `summaries` as a LIST of per-action rows and measures no
// beat at all — so asking it for one produced "unrecognized", and every actions
// cell on a target that declares a regime was retried to exhaustion and thrown
// away. Six targets declare one; that was 24 unbankable cells.
describe('which commands can answer for a refresh regime', () => {
  it('asks the drawing capture commands, which measure a beat', () => {
    expect(commandReportsRefreshRegime(SPLIT_SCREEN_COMMAND)).toBe(true);
  });

  it('does not ask the action runner, which measures none', () => {
    expect(commandReportsRefreshRegime('perf:android:browser:actions')).toBe(false);
    expect(commandReportsRefreshRegime('perf:ios:xcuitest:actions')).toBe(false);
  });

  // The desktop drawing runner writes `summaries.intervalMs` like the others and
  // was omitted from the exemption set, so mac-chrome, mac-safari and mac-firefox
  // — all of which declare a regime — silently stopped checking it. Asserted
  // through the PLAN rather than the predicate, because that is where the
  // omission actually reached a scored cell.
  it('asks the desktop drawing runner too, on every target that declares a regime', () => {
    expect(commandReportsRefreshRegime('perf:web:frames')).toBe(true);

    for (const target of ['mac-chrome', 'mac-safari', 'mac-firefox']) {
      const cell = planCampaign(target, { outputRoot: 'unused' }).find(
        (candidate) => candidate.command === 'perf:web:frames'
      );

      expect(cell, target).toBeDefined();
      expect(cell.reportsRefreshRegime, target).toBe(true);
    }
  });
});
