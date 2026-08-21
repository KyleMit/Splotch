import { describe, expect, it } from 'vitest';
import {
  ACTION_REPEATS,
  ALL_ITEMS,
  CAMPAIGN_MODES,
  CAMPAIGN_TARGETS,
  UNDO_COUNT,
  artifactMatchesRuntime,
  artifactPath,
  campaignTarget,
  planCampaign,
} from '../lib/campaign-plan.mjs';
import {
  ALREADY_VALID,
  FAILED,
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

  it('routes Android browser actions to direct CDP and its drawing to Appium', () => {
    const cells = plan('android-emulator-web', {
      modes: ['landscape-light'],
      host: { ...HOST, deviceId: 'emulator-5554', cdpPort: '9225', url: 'http://127.0.0.1:4173/' },
    });
    const actions = cells.find((cell) => cell.item === 'actions');
    const drawing = cells.find((cell) => cell.item === 'crayon');

    expect(actions.command).toBe('perf:android:browser:actions');
    expect(actions.args).toContain('--cdp-port=9225');
    expect(actions.args).not.toContain('--appium-url=http://127.0.0.1:4723');
    expect(drawing.command).toBe('perf:ios:xcuitest:screen');
  });

  it('attaches a native run to the app WebView and never to a URL', () => {
    const cell = plan('android-emulator-native', {
      modes: ['portrait-light'],
      items: ['pen-undo'],
      host: { ...HOST, url: 'http://127.0.0.1:4173/' },
    })[0];

    expect(cell.args).toContain('--native-app');
    expect(cell.args).toContain('--native-webview-class=android.webkit.WebView');
    expect(cell.args.some((arg) => arg.startsWith('--url='))).toBe(false);
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

  it('classes every target, so a new one cannot silently arrive without one', () => {
    for (const [id, target] of Object.entries(CAMPAIGN_TARGETS)) {
      expect(['tablet', 'handset'], `${id} needs a deviceClass`).toContain(target.deviceClass);
    }
  });
});

describe('campaign artifact acceptance', () => {
  it('accepts a native cell only when the capture attached to the app WebView', () => {
    expect(artifactMatchesRuntime({ transport: 'native-capacitor-webview' }, 'native')).toBe(true);
    expect(artifactMatchesRuntime({ transport: 'browser' }, 'native')).toBe(false);
  });

  it('rejects a web cell that attached to the installed app instead', () => {
    expect(artifactMatchesRuntime({ transport: 'native-capacitor-webview' }, 'web')).toBe(false);
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
