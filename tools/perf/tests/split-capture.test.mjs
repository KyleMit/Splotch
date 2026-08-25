import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  androidGestureInstructions,
  androidNativeLaunchSteps,
  androidOpenSteps,
  androidPageLaunchSteps,
  androidRotationCommands,
  CHROME_PACKAGE,
  swipeArgs,
} from '../split-capture/lib/android-input.mjs';
import {
  closeFloorControlHost,
  createFloorControlHost,
} from '../split-capture/serve-floor-control.mjs';
import { createProbeHost } from '../split-capture/lib/probe-host.mjs';
import {
  activateChromePage,
  clearToolingLitter,
  runChromePage,
  toolingLitter,
} from '../split-capture/lib/chrome-tabs.mjs';
import { androidDriver, zeroInputProblem } from '../split-capture/capture-device-frames.mjs';
import { keepIncomingReport, reportRejectionReason } from '../split-capture/lib/report-store.mjs';
import { pageBootstrapSource } from '../split-capture/lib/page-bootstrap.mjs';
import {
  classifyInputCadence,
  describeContactSamples,
} from '../split-capture/lib/input-verdict.mjs';
import {
  calibrationReading,
  handCaptureArtifact,
  openWithAdb,
} from '../split-capture/capture-hand-input.mjs';
import { drivenCaptureArtifact } from '../split-capture/capture-device-frames.mjs';

const directories = [];

const stroke = [
  { type: 'pointerMove', x: 10, y: 10, duration: 0 },
  { type: 'pointerDown' },
  { type: 'pointerMove', x: 20, y: 10, duration: 120 },
  { type: 'pointerMove', x: 30, y: 10, duration: 120 },
  { type: 'pointerUp' },
];

describe('androidGestureInstructions', () => {
  it('treats the move before pointerDown as the stroke origin, not a segment', () => {
    const instructions = androidGestureInstructions(stroke);

    // Three points, two segments — the pre-down move contributes the first point.
    expect(instructions.filter((i) => i.kind === 'swipe')).toHaveLength(2);
    expect(instructions[0]).toMatchObject({ x0: 10, y0: 10, x1: 20, y1: 10 });
    expect(instructions[1]).toMatchObject({ x0: 20, y0: 10, x1: 30, y1: 10 });
  });

  it('converts CSS pixels to device pixels through scale and offset', () => {
    const [first] = androidGestureInstructions(stroke, {
      densityScale: 2.75,
      offset: { x: 100, y: 40 },
    });

    expect(first).toMatchObject({ x0: 128, y0: 68, x1: 155, y1: 68 });
  });

  it('never emits a duration short enough for input swipe to fling instead of draw', () => {
    const instructions = androidGestureInstructions([
      { type: 'pointerMove', x: 0, y: 0 },
      { type: 'pointerDown' },
      { type: 'pointerMove', x: 5, y: 0, duration: 3 },
      { type: 'pointerUp' },
    ]);

    expect(instructions[0].durationMs).toBeGreaterThanOrEqual(50);
  });

  it('keeps pauses in order so a multi-stroke plan holds its rhythm', () => {
    const instructions = androidGestureInstructions([
      ...stroke,
      { type: 'pause', duration: 400 },
      ...stroke,
    ]);

    expect(instructions.map((i) => i.kind)).toEqual(['swipe', 'swipe', 'pause', 'swipe', 'swipe']);
    expect(instructions[2].durationMs).toBe(400);
  });

  it('does not leak points across strokes', () => {
    const instructions = androidGestureInstructions([...stroke, ...stroke]);

    // Four segments, not five: the second stroke starts fresh rather than
    // joining the first stroke's last point to its own origin.
    expect(instructions).toHaveLength(4);
  });

  it('renders a swipe as adb arguments', () => {
    expect(swipeArgs({ kind: 'swipe', x0: 1, y0: 2, x1: 3, y1: 4, durationMs: 60 })).toEqual([
      'shell',
      'input',
      'swipe',
      '1',
      '2',
      '3',
      '4',
      '60',
    ]);
  });
});

describe('androidPageLaunchSteps', () => {
  const indexOfArg = (steps, needle) =>
    steps.findIndex((step) => step.args.some((arg) => arg.includes(needle)));

  it('asserts the rotation after force-stopping the browser', () => {
    const steps = androidPageLaunchSteps('LANDSCAPE', 'http://10.0.0.2:4186/');

    // A 2026-08-23 recapture rotated before the stop and lost every landscape cell:
    // the page disagreed with the requested orientation and the capture aborted
    // without writing an artifact. It was attributed to `am force-stop` returning
    // user_rotation to 0 on Samsung/Android 16, and that did not reproduce in 8
    // later trials. The order is pinned because it is free and cannot be the cause
    // of what was seen — see androidPageLaunchSteps.
    expect(indexOfArg(steps, 'force-stop')).toBeLessThan(indexOfArg(steps, 'user_rotation'));
  });

  it('launches the page last, so the browser opens into the settled rotation', () => {
    const steps = androidPageLaunchSteps('LANDSCAPE', 'http://10.0.0.2:4186/');

    expect(indexOfArg(steps, 'user_rotation')).toBeLessThan(indexOfArg(steps, '4186'));
    expect(steps.at(-1).args).toContain(CHROME_PACKAGE);
    expect(steps.at(-1).settle).toBe('page');
  });

  it('settles after the stop and the rotation, which the page launch depends on', () => {
    const steps = androidPageLaunchSteps('PORTRAIT', 'http://10.0.0.2:4186/');

    expect(steps[indexOfArg(steps, 'force-stop')].settle).toBe('appStop');
    expect(steps[indexOfArg(steps, 'user_rotation')].settle).toBe('rotation');
  });
});

describe('androidRotationCommands', () => {
  it('always disables accelerometer rotation alongside setting the rotation', () => {
    const commands = androidRotationCommands('LANDSCAPE');

    // user_rotation is ignored while auto-rotate is on, so setting one without
    // the other yields whichever way the device happens to be lying.
    expect(commands[0]).toContain('accelerometer_rotation');
    expect(commands[0].at(-1)).toBe('0');
    expect(commands[1]).toContain('user_rotation');
    expect(commands[1].at(-1)).toBe('1');
  });

  it('rejects an orientation it cannot express', () => {
    expect(() => androidRotationCommands('SIDEWAYS')).toThrow(/orientation must be one of/);
  });
});

describe('keepIncomingReport', () => {
  const withEvents = (count) => ({ report: { events: Array.from({ length: count }) } });

  it('keeps the first report', () => {
    expect(keepIncomingReport(null, withEvents(0))).toBe(true);
  });

  it('rejects a thinner report from a duplicate Safari navigation', () => {
    expect(keepIncomingReport(withEvents(6000), withEvents(3))).toBe(false);
    expect(reportRejectionReason(withEvents(6000), withEvents(3))).toContain('thinner');
  });

  it('accepts a thicker report that arrives second', () => {
    expect(keepIncomingReport(withEvents(3), withEvents(6000))).toBe(true);
    expect(reportRejectionReason(withEvents(3), withEvents(6000))).toBeNull();
  });

  it('never loses an error report to a thickness comparison', () => {
    // The error is the capture explaining why it produced nothing; dropping it
    // leaves a silent empty run.
    expect(keepIncomingReport(withEvents(6000), { error: 'route never hydrated' })).toBe(true);
  });
});

describe('pageBootstrapSource', () => {
  it('takes its brush selectors from the capture module rather than duplicating them', () => {
    const source = pageBootstrapSource();

    expect(source).toContain('#crayonBrushButton');
    expect(source).toContain('#eraserButton');
  });

  it('reports the orientation it actually rendered at', () => {
    // The device rotates and the page does not always agree; without this the
    // runner cannot tell a landscape capture filed as portrait.
    expect(pageBootstrapSource()).toContain("innerWidth > innerHeight ? 'LANDSCAPE' : 'PORTRAIT'");
  });

  it('loads the probe as a same-origin script rather than eval', () => {
    // The route's CSP allows script-src 'self' and forbids unsafe-eval.
    const source = pageBootstrapSource();

    expect(source).toContain("element.src = '/__probe/probe.js'");
    expect(source).not.toMatch(/\beval\(/);
  });
});

describe('classifyInputCadence', () => {
  it('fails a capture that recorded no input rather than reporting a rate', () => {
    const { ok, detail } = classifyInputCadence({ movesPerSecond: 0 });

    expect(ok).toBe(false);
    expect(detail).toContain('never reached it');
  });

  it('fails the Appium Android transport at its measured rate', () => {
    // 46.8 moves/s is what the campaign measured, and every cell captured that
    // way was unscoreable while parsing perfectly.
    const { ok, detail } = classifyInputCadence({ movesPerSecond: 46.8, moveGapP95Ms: 21 });

    expect(ok).toBe(false);
    expect(detail).toContain('46.8');
    expect(detail).toContain('cannot be scored');
  });

  it('passes the split transport at its measured rate', () => {
    expect(classifyInputCadence({ movesPerSecond: 116.6, moveGapP95Ms: 11 }).ok).toBe(true);
  });

  // 240 was written as obviously-too-fast. A real finger on the target iPad
  // measured 268.4 on 2026-08-23, so the rate this asserted on is one a hand
  // produces — the ceiling is retired and an excess rate is reported instead.
  it('accepts a rate above the retired ceiling, because a hand reaches it', () => {
    expect(classifyInputCadence({ movesPerSecond: 240, moveGapP95Ms: 4 }).ok).toBe(true);
  });

  it('fails a stalling stream even when the mean rate looks fine', () => {
    // A burst-then-stall pattern averages into the band while presenting nothing
    // like a steady cadence.
    const { ok, detail } = classifyInputCadence({ movesPerSecond: 120, moveGapP95Ms: 45 });

    expect(ok).toBe(false);
    expect(detail).toContain('stalls');
  });

  it('does not let iPad-calibrated pressure or geometry decide the verdict', () => {
    // Chrome reports pressure 1 and no contact radius for synthesized touch.
    // Judging Android against Safari's hand-calibrated shape would make this
    // check permanently red and therefore useless.
    const android = {
      movesPerSecond: 116.6,
      moveGapP95Ms: 11,
      pressure: { p50: 1 },
      contactWidth: { p50: 0 },
      contactHeight: { p50: 0 },
    };

    expect(classifyInputCadence(android).ok).toBe(true);
    expect(describeContactSamples(android)).toContain('no contact geometry reported');
  });
});

describe('closeFloorControlHost', () => {
  const listenOnEphemeralPort = async () => {
    const { server } = createFloorControlHost({ log: () => {} });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { server, port: server.address().port };
  };

  // The bug this covers is a process that never exits, so the assertion has to be
  // that the close RESOLVES, not that it was called. Node destroys idle sockets on
  // close() by itself and waits only on ones carrying a request in progress — which
  // is the state the device's browser leaves behind, and the state that has to be
  // reproduced here for the test to mean anything.
  it('resolves while a client holds a socket open mid-request', async () => {
    const { server, port } = await listenOnEphemeralPort();
    const socket = connect(port, '127.0.0.1');
    await new Promise((resolve) => socket.on('connect', resolve));
    socket.write('GET /__probe/plan HTTP/1.1\r\nHost: floor-control\r\n');
    await new Promise((resolve) => setTimeout(resolve, 50));

    await expect(closeFloorControlHost(server)).resolves.toBeUndefined();
    expect(server.listening).toBe(false);
    socket.destroy();
  });

  it('resolves when nothing ever connected', async () => {
    const { server } = await listenOnEphemeralPort();

    await expect(closeFloorControlHost(server)).resolves.toBeUndefined();
    expect(server.listening).toBe(false);
  });
});

describe('the reading a hand capture is kept for', () => {
  // Every field here is read back out of perf-profiles/evidence/*/index.json, so
  // the test is against the names as much as the values.
  const handInput = {
    kinds: 'touch',
    trust: { share: 1 },
    movesPerSecond: 237.82,
    moveGapP95Ms: 17,
    movesPerFrame: 1.96,
    coalescedPerMove: 0,
    pressure: { p50: 0, p95: 0 },
    contactWidth: { p50: 83.42 },
    contactHeight: { p50: 83.42 },
  };

  it('flattens the probe input block into the fields a threshold is set from', () => {
    expect(calibrationReading(handInput)).toEqual({
      kinds: 'touch',
      trustedShare: 1,
      movesPerSecond: 237.82,
      moveGapP95Ms: 17,
      movesPerFrame: 1.96,
      coalescedPerMove: 0,
      pressureP50: 0,
      pressureP95: 0,
      contactWidthP50: 83.42,
      contactHeightP50: 83.42,
    });
  });

  // A runtime that reports nothing for a check is the finding, not a crash: Chrome
  // reports no contact geometry at all, for a real finger and a synthetic one
  // alike, and that absence is what makes the check inapplicable there.
  it('records an absent measurement as null rather than throwing', () => {
    const reading = calibrationReading({ kinds: 'touch', movesPerSecond: 154.63 });
    expect(reading.contactWidthP50).toBeNull();
    expect(reading.pressureP50).toBeNull();
    expect(reading.trustedShare).toBeNull();
    expect(reading.movesPerSecond).toBe(154.63);
  });

  it('survives an input block that is missing entirely', () => {
    expect(calibrationReading().movesPerSecond).toBeNull();
  });
});

// The hand tool took the browser path regardless of --native-app, so it could
// launch Chrome and then record `android-capacitor-webview` as the runtime the
// reading calibrates. Correctly shaped, plausibly labelled, wrong browser.
// The previous version of these tests called the step factories directly, so
// replacing the production dispatch with an unconditional browser launch left
// all of them green — the regression could return under a passing suite. The
// choice is now a value, and this asserts the choice.
describe('which launch a capture takes', () => {
  const args = { orientation: 'LANDSCAPE', pageUrl: 'http://host/?probe=n' };
  const flat = (steps) => steps.flatMap((step) => step.args).join(' ');

  it('reaches the app when the native flag is set', () => {
    const steps = flat(androidOpenSteps({ ...args, nativeApp: true }));

    expect(steps).toContain('art.splotch.app/.MainActivity');
    expect(steps).not.toContain(CHROME_PACKAGE);
  });

  it('reaches the browser when it is not', () => {
    const steps = flat(androidOpenSteps({ ...args, nativeApp: false }));

    expect(steps).toContain(CHROME_PACKAGE);
    expect(steps).toContain(args.pageUrl);
    expect(steps).not.toContain('.MainActivity');
  });

  // An opener that ignores the flag is the shipped bug: it captured Chrome and
  // the artifact recorded android-capacitor-webview.
  it('never returns the same plan for both flag directions', () => {
    expect(flat(androidOpenSteps({ ...args, nativeApp: true }))).not.toBe(
      flat(androidOpenSteps({ ...args, nativeApp: false }))
    );
  });
});

describe('launching the native app instead of the browser', () => {
  const steps = androidNativeLaunchSteps('LANDSCAPE');
  const flat = steps.flatMap((step) => step.args).join(' ');

  it('never touches Chrome', () => {
    expect(flat).not.toContain(CHROME_PACKAGE);
  });

  it('starts the app by activity, with no URL to navigate', () => {
    expect(flat).toContain('art.splotch.app/.MainActivity');
    expect(flat).not.toContain('android.intent.action.VIEW');
  });

  // Same ordering as the browser path, for the same unexplained-but-free reason
  // recorded there: rotation is asserted while the app is stopped.
  it('keeps the stop, rotate, launch ordering', () => {
    expect(steps.map((step) => step.settle)).toEqual(['appStop', null, 'rotation', 'page']);
  });
});

// The theme behaviour is covered by tools/perf/tests/bootstrap-theme.test.mjs,
// which EXECUTES the generated bootstrap in a DOM fixture. Source-substring
// assertions lived here and survived disabling the whole theme branch, so they
// were removed rather than kept alongside a test that works.

describe('what a saved artifact can prove about its own theme', () => {
  const ready = { resolvedTheme: 'dark' };
  const common = { brush: 'pen', orientation: 'LANDSCAPE', theme: 'dark', payload: {} };

  it('records the theme the PAGE reported, on both writers', () => {
    expect(drivenCaptureArtifact({ ...common, ready }).observedTheme).toBe('dark');
    expect(handCaptureArtifact({ ...common, ready }).observedTheme).toBe('dark');
  });

  // The light/system case is why `report.meta.theme` cannot serve as provenance:
  // the product stores the loosest preference that renders an appearance, so
  // choosing the theme the OS already shows clears the override and leaves that
  // field null. `observedTheme` still answers.
  it('answers for a light capture whose report metadata is null', () => {
    const artifact = drivenCaptureArtifact({
      ...common,
      theme: 'light',
      ready: { resolvedTheme: 'light' },
      payload: { report: { meta: { theme: null } } },
    });

    expect(artifact.report.meta.theme).toBeNull();
    expect(artifact.observedTheme).toBe('light');
  });

  // Absent must read as absent rather than as the request, or the field becomes
  // the very echo it replaced.
  it('never falls back to the requested theme when the page reported none', () => {
    expect(drivenCaptureArtifact({ ...common, ready: {} }).observedTheme).toBeNull();
    expect(handCaptureArtifact({ ...common, ready: undefined }).observedTheme).toBeNull();
  });
});

// The cross-run race, which produced eleven artifacts whose mode came from one
// page and whose frame tables came from another. Readiness was nonce-checked
// from the start; the report was not, and carried no nonce to check.
describe('a report from a run that is no longer current', () => {
  const withEvents = (n, nonce) => ({ nonce, report: { events: Array.from({ length: n }) } });

  it('is refused even when it is FATTER than what is stored', () => {
    const rejection = reportRejectionReason(
      withEvents(10, 'old-run'),
      withEvents(500, 'old-run'),
      'new-run'
    );

    expect(rejection).toContain('old-run');
    expect(rejection).toContain('new-run');
  });

  // The thinness rule must not be what refuses it, or the log blames the event
  // count for a provenance failure and the next reader goes looking in the wrong
  // place.
  it('names the run rather than the event count', () => {
    expect(reportRejectionReason(null, withEvents(500, 'old-run'), 'new-run')).not.toContain(
      'thinner'
    );
  });

  it('refuses a report that identifies no run at all', () => {
    expect(reportRejectionReason(null, { report: { events: [] } }, 'new-run')).toContain(
      'unidentified'
    );
  });

  it('accepts the run that is current, and still applies thinness within it', () => {
    expect(reportRejectionReason(null, withEvents(500, 'new-run'), 'new-run')).toBeNull();
    expect(
      reportRejectionReason(withEvents(500, 'new-run'), withEvents(1, 'new-run'), 'new-run')
    ).toContain('thinner');
  });

  // An error report is how a failed run reports itself, and it has to survive the
  // check or a real failure is silently discarded.
  it('accepts an error report from the current run', () => {
    expect(reportRejectionReason(null, { nonce: 'new-run', error: 'boom' }, 'new-run')).toBeNull();
  });

  it('carries the nonce on both the success and error paths of the bootstrap', () => {
    const source = pageBootstrapSource();

    expect(source).toContain('nonce,\n      report,');
    expect(source).toContain("post('/__probe/report', { nonce, error:");
  });
});

// The wiring, not the rule. The rejection rule can be perfect while the host
// forgets to hand it the current nonce — which is how this shipped: readiness
// checked the nonce, the report path never received one.
describe('the probe host refusing a stale run over HTTP', () => {
  const started = [];

  afterEach(async () => {
    for (const server of started.splice(0)) await new Promise((r) => server.close(r));
  });

  async function hostAt(reportDir) {
    const { server, state } = createProbeHost({
      upstream: 'http://127.0.0.1:1',
      reportDir,
      log: () => {},
    });
    started.push(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { base: `http://127.0.0.1:${server.address().port}`, state };
  }

  const postReport = (base, body) =>
    fetch(`${base}/__probe/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('keeps a report from the current run and refuses one from another', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-probe-host-'));
    directories.push(directory);
    const { base, state } = await hostAt(directory);
    await fetch(`${base}/__probe/control`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'cell', nonce: 'new-run', reset: true }),
    });

    await postReport(base, { nonce: 'new-run', report: { events: [1, 2, 3] } });
    expect(state.report?.report.events).toHaveLength(3);

    // Fatter, and from the run that just ended. The old code kept it.
    await postReport(base, { nonce: 'old-run', report: { events: Array.from({ length: 99 }) } });

    expect(state.report?.report.events).toHaveLength(3);
    expect(JSON.parse(readFileSync(join(directory, 'cell.json'), 'utf8')).nonce).toBe('new-run');
  });
});

// The CALL SITE, not the chooser. Asserting androidOpenSteps in isolation proved
// it picks correctly when handed the right value and left the original bug fully
// reachable: passing `nativeApp: false` at this call opens Chrome while the
// artifact is still labelled android-capacitor-webview, and every test passed.
describe('the hand capture opening what its flag asked for', () => {
  const commands = async (nativeApp) => {
    const calls = [];
    await openWithAdb({
      serial: 'SERIAL',
      pageUrl: 'http://host/?probe=n',
      orientation: 'PORTRAIT',
      nativeApp,
      exec: (serial, args) => calls.push([serial, ...args].join(' ')),
    });
    return calls.join(' | ');
  };

  it('reaches the app package when --native-app was parsed', async () => {
    const issued = await commands(true);

    expect(issued).toContain('art.splotch.app/.MainActivity');
    expect(issued).not.toContain(CHROME_PACKAGE);
  }, 20_000);

  it('reaches the browser when it was not', async () => {
    const issued = await commands(false);

    expect(issued).toContain(CHROME_PACKAGE);
    expect(issued).not.toContain('.MainActivity');
  }, 20_000);

  it('sends every command to the serial it was given', async () => {
    expect(await commands(true)).toContain('SERIAL');
  }, 20_000);
});

// The hole the nonce check could not close. Chrome restores tabs across the
// force-stop a launch performs; a restored tab re-runs the bootstrap, reads the
// CURRENT plan and adopts its nonce, so it is indistinguishable from the page
// the run opened — while carrying the previous cell's URL and receiving almost
// none of the injected touch. One banked a cell with 517 events where its
// neighbours had 7104.
describe('a page that only adopted the plan', () => {
  const source = pageBootstrapSource();

  it('makes the page prove which run OPENED it', () => {
    expect(source).toContain("new URLSearchParams(location.search).get('probe')");
    expect(source).toContain('openedFor !== nonce');
  });

  // Standing down silently matters: a leftover tab is not a failure, and
  // reporting it as one would bury the real error for the page that IS current.
  it('stands the leftover down rather than failing the run', () => {
    expect(source).toContain("kind: 'stale-page'");
    expect(source.indexOf('openedFor !== nonce')).toBeLessThan(
      source.indexOf("post('/__probe/ready'")
    );
  });
});

describe('fronting the run page', () => {
  const targets = [
    { id: 'a', type: 'page', url: 'http://host:4175/?probe=run-8' },
    { id: 'b', type: 'page', url: 'http://host:4175/?probe=run-84' },
    { id: 'c', type: 'page', url: 'https://www.google.com/m?client=x' },
    { id: 'd', type: 'service_worker', url: 'http://host:4175/sw.js' },
    { id: 'e', type: 'page', url: 'not a url' },
  ];

  it('matches the probe param exactly, so a nonce that prefixes another cannot collide', () => {
    expect(runChromePage(targets, 'run-8')?.id).toBe('a');
    expect(runChromePage(targets, 'run-84')?.id).toBe('b');
    expect(runChromePage(targets, 'run-9')).toBeNull();
  });

  it('activates the run page over the devtools http endpoint and touches nothing else', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return { ok: true, json: async () => targets };
    };

    const result = await activateChromePage({
      cdpBase: 'http://127.0.0.1:9224',
      nonce: 'run-84',
      fetchImpl,
    });

    expect(result.activated).toBe(true);
    expect(calls).toEqual([
      'http://127.0.0.1:9224/json/list',
      'http://127.0.0.1:9224/json/activate/b',
    ]);
  });

  it('leaves an unidentifiable page alone instead of failing or closing anything', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return { ok: true, json: async () => targets };
    };

    const result = await activateChromePage({
      cdpBase: 'http://127.0.0.1:9224',
      nonce: 'absent',
      fetchImpl,
    });

    expect(result).toEqual({ activated: false, pages: 4 });
    expect(calls).toEqual(['http://127.0.0.1:9224/json/list']);
  });
});

describe('clearing the tooling litter', () => {
  const targets = [
    { id: 'run', type: 'page', url: 'http://host:4175/?probe=run-7' },
    { id: 'stale-probe', type: 'page', url: 'http://host:4175/?probe=run-6' },
    { id: 'stale-verify', type: 'page', url: 'http://host:4177/?verify=old-check' },
    { id: 'husk', type: 'page', url: 'http://host:4175/__probe/stand-down' },
    { id: 'blank', type: 'page', url: 'about:blank' },
    { id: 'operator', type: 'page', url: 'https://www.google.com/m?client=x' },
    { id: 'preview', type: 'page', url: 'http://host:4173/' },
    { id: 'other-host', type: 'page', url: 'http://elsewhere:4175/?probe=run-6' },
    { id: 'worker', type: 'service_worker', url: 'http://host:4175/sw.js' },
  ];

  // Ownership is a tool signature on the session host, across every port the
  // tooling serves — the tab that steals the foreground on relaunch is
  // whichever Chrome used last, and a stale probe tab stole the verifier's
  // foreground from a different port exactly this way. A bare about:blank and
  // the host's plain preview pages stay: neither carries a signature that
  // proves it is ours rather than the operator's.
  it('claims tool-signature pages across ports, never operator or unmarked pages', () => {
    const litter = toolingLitter(targets, 'host', 'run-7');

    expect(litter.map((target) => target.id)).toEqual(['stale-probe', 'stale-verify', 'husk']);
  });

  it('closes each leftover over the devtools http endpoint', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return { ok: true, json: async () => targets };
    };

    const result = await clearToolingLitter({
      cdpBase: 'http://127.0.0.1:9224',
      hostname: 'host',
      nonce: 'run-7',
      fetchImpl,
    });

    expect(result).toEqual({ closed: 3 });
    expect(calls).toEqual([
      'http://127.0.0.1:9224/json/list',
      'http://127.0.0.1:9224/json/close/stale-probe',
      'http://127.0.0.1:9224/json/close/stale-verify',
      'http://127.0.0.1:9224/json/close/husk',
    ]);
  });
});

describe('the wiring that fronts the page and judges the input', () => {
  const driverDeps = () => {
    const execCalls = [];
    const activateCalls = [];
    const litterCalls = [];
    return {
      execCalls,
      activateCalls,
      litterCalls,
      exec: (serial, args) => execCalls.push(args.join(' ')),
      activate: async (options) => {
        activateCalls.push(options);
        return { activated: true, pages: 1 };
      },
      litterClearer: async (options) => {
        litterCalls.push(options);
        return { closed: 0 };
      },
    };
  };

  it('fronts the run page after launch and again before dispatch on the browser path', async () => {
    const deps = driverDeps();
    const driver = androidDriver({
      serial: 's',
      pageUrl: 'http://host:4175/?probe=run-7',
      orientation: 'PORTRAIT',
      nativeApp: false,
      cdpPort: 9224,
      ...deps,
    });

    vi.useFakeTimers();
    try {
      const opened = driver.openPage();
      await vi.runAllTimersAsync();
      await opened;
      const dispatched = driver.dispatch(
        { bounds: { x: 0, y: 0, width: 10, height: 10 }, densityScale: 1, offset: { x: 0, y: 0 } },
        1
      );
      await vi.runAllTimersAsync();
      await dispatched;
    } finally {
      vi.useRealTimers();
    }

    expect(deps.activateCalls.map((call) => call.nonce)).toEqual(['run-7', 'run-7']);
    expect(deps.litterCalls.map((call) => call.hostname)).toEqual(['host', 'host']);
    const forwards = deps.execCalls.filter((call) => call.startsWith('forward'));
    expect(forwards).toEqual([
      'forward tcp:9224 localabstract:chrome_devtools_remote',
      'forward tcp:9224 localabstract:chrome_devtools_remote',
      'forward --remove tcp:9224',
    ]);
  });

  it('never touches devtools on the native path', async () => {
    const deps = driverDeps();
    const driver = androidDriver({
      serial: 's',
      pageUrl: 'http://host:4175/?probe=run-7',
      orientation: 'PORTRAIT',
      nativeApp: true,
      cdpPort: 9224,
      ...deps,
    });

    vi.useFakeTimers();
    try {
      const opened = driver.openPage();
      await vi.runAllTimersAsync();
      await opened;
      const dispatched = driver.dispatch(
        { bounds: { x: 0, y: 0, width: 10, height: 10 }, densityScale: 1, offset: { x: 0, y: 0 } },
        1
      );
      await vi.runAllTimersAsync();
      await dispatched;
    } finally {
      vi.useRealTimers();
    }

    expect(deps.activateCalls).toEqual([]);
    expect(deps.litterCalls).toEqual([]);
    expect(deps.execCalls.some((call) => call.startsWith('forward'))).toBe(false);
  });

  it('fails a zero-event dispatch and lets everything else decide downstream', () => {
    expect(zeroInputProblem({ nonce: 'n', events: 0 })).toMatch(/another tab or app/);
    expect(zeroInputProblem({ nonce: 'n', events: 517 })).toBeNull();
    expect(zeroInputProblem(null)).toBeNull();
    expect(zeroInputProblem(undefined)).toBeNull();
  });
});

describe('the pulse the probe host relays', () => {
  const hostFetch = async (server, path, init) => {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
    return response.json();
  };

  it('exposes the run page pulse in state and refuses a stale nonce', async () => {
    const { server } = createProbeHost({ upstream: 'http://127.0.0.1:1', log: () => {} });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      await hostFetch(server, '/__probe/control', {
        method: 'PUT',
        body: JSON.stringify({ nonce: 'run-7', reset: true }),
      });
      await hostFetch(server, '/__probe/pulse', {
        method: 'POST',
        body: JSON.stringify({ nonce: 'stale-6', events: 999 }),
      });
      await hostFetch(server, '/__probe/pulse', {
        method: 'POST',
        body: JSON.stringify({ nonce: 'run-7', events: 42 }),
      });
      // Max-not-last, like the report store: on the native paths identity is
      // adopted rather than proven, so a backgrounded leftover pulsing 0 under
      // the current nonce must not overwrite the real page's count.
      await hostFetch(server, '/__probe/pulse', {
        method: 'POST',
        body: JSON.stringify({ nonce: 'run-7', events: 0 }),
      });

      const state = await hostFetch(server, '/__probe/state');
      expect(state.pulse).toEqual({ nonce: 'run-7', events: 42 });

      await hostFetch(server, '/__probe/control', {
        method: 'PUT',
        body: JSON.stringify({ nonce: 'run-8', reset: true }),
      });
      const fresh = await hostFetch(server, '/__probe/state');
      expect(fresh.pulse).toBeNull();
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
