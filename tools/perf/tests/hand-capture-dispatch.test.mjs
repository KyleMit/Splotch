// captureHandInput's PRODUCTION dispatch, executed (issue 1309). The earlier
// tests called exported openWithAdb directly, and fault injection proved the
// gap: flipping the production call back to `nativeApp: false` — the original
// Chrome-vs-WebView bug — left the focused suite green. This drives the whole
// run against a real in-test probe host with `--native-app` parsed from argv,
// and asserts the flag reaches the launch steps, the identity contract, and
// the artifact.
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const captureCalls = [];

vi.mock('../../lib/proc.mjs', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    sleep: async () => {},
    capture: (cmd, args) => {
      captureCalls.push([cmd, ...args].join(' '));
      return '';
    },
    // fail() exits the process; a test needs the message, not the exit.
    fail: (message) => {
      throw new Error(message);
    },
  };
});

vi.mock('../lib/profile-preview.mjs', () => ({
  assertServedBuildIsFresh: async () => {},
}));

const { captureHandInput } = await import('../split-capture/capture-hand-input.mjs');

const FRAME_COUNT = 120;
const BEAT_MS = 16.67;

// The probe's real row schemas (real-screen-stats.mjs header): frames are
// [t, dt, contact] tuples and events are positional rows whose type column is
// 0=down/1=move/2=up. The events only need to exist and parse — the hand tool
// prints fidelity, it does not gate on it.
function probeReport({ url, ua }) {
  const start = 100;
  return {
    meta: { schema: 2, url, ua },
    phases: [
      {
        key: 'blank',
        paper: 'blank',
        startedAt: start,
        endedAt: start + FRAME_COUNT * BEAT_MS,
        contactMs: FRAME_COUNT * BEAT_MS,
        frames: FRAME_COUNT,
      },
    ],
    frames: Array.from({ length: FRAME_COUNT }, (_, index) => [start + index * BEAT_MS, -1, 1]),
    events: Array.from({ length: 30 }, (_, index) => [
      start + 20 + index * 8,
      start + 20 + index * 8,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0,
      44,
      44,
      null,
      null,
    ]),
    measures: [],
    history: [],
    liftLatencies: [],
  };
}

// A real HTTP probe host, minimal: answers the control PUT, reports a ready
// state, and exposes the accepted report the moment the run announces its
// label — with the page identity this test case wants the report to carry.
function startProbeHost({ ua, reportProbeParam }) {
  const controls = [];
  let reportPayload = null;
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (request.method === 'PUT' && request.url === '/__probe/control') {
        const control = JSON.parse(body);
        controls.push(control);
        if (control.label) {
          const base = `http://device-page.test/`;
          const url =
            reportProbeParam === 'nonce'
              ? `${base}?probe=${encodeURIComponent(control.nonce)}`
              : base;
          reportPayload = { report: probeReport({ url, ua }) };
        }
        response.end('{}');
        return;
      }
      if (request.url === '/__probe/state') {
        response.end(
          JSON.stringify({
            planRequests: 1,
            stalePage: false,
            hasReport: true,
            ready: {
              committed: 'pen',
              resolvedTheme: 'light',
              geometry: { orientation: 'PORTRAIT' },
            },
          })
        );
        return;
      }
      if (request.url === '/__probe/report') {
        if (!reportPayload) response.statusCode = 404;
        response.end(JSON.stringify(reportPayload ?? { error: 'no accepted report' }));
        return;
      }
      response.end('{}');
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, controls, host: `http://127.0.0.1:${server.address().port}` })
    );
  });
}

const servers = [];
const argvBaseline = [...process.argv];

afterEach(async () => {
  for (const { server } of servers.splice(0)) {
    await new Promise((resolve) => server.close(resolve));
  }
  process.argv = [...argvBaseline];
  captureCalls.length = 0;
});

async function runCapture({ nativeApp, ua, reportProbeParam }) {
  const probe = await startProbeHost({ ua, reportProbeParam });
  servers.push(probe);
  if (nativeApp) process.argv = [...argvBaseline, '--native-app'];
  const artifact = await captureHandInput({
    platform: 'android',
    brush: 'pen',
    orientation: 'PORTRAIT',
    theme: 'light',
    seconds: 0,
    host: probe.host,
    serial: 'FAKESERIAL',
    opener: 'adb',
  });
  return { artifact, controls: probe.controls };
}

describe('captureHandInput’s production dispatch', () => {
  // The fault this pins: openWithAdb picking correctly when HANDED the right
  // value proved nothing about the production call site, which once passed
  // `nativeApp: false` while captureRuntime still labelled the artifact a
  // WebView runtime — Chrome's numbers under the WebView's name.
  it('launches the installed app, not Chrome, when --native-app is parsed from argv', async () => {
    const { artifact } = await runCapture({
      nativeApp: true,
      ua: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/126 Mobile',
      reportProbeParam: 'none',
    });

    const launches = captureCalls.filter((call) => call.includes('am start'));
    expect(launches.some((call) => call.includes('art.splotch.app'))).toBe(true);
    expect(captureCalls.some((call) => call.includes('com.android.chrome'))).toBe(false);
    expect(artifact.runtime).toBe('android-capacitor-webview');
    expect(artifact.nativeApp).toBe(true);
  });

  // Issue 1309's second gap, the artifact half: a native WebView loads a
  // build-time URL, so its page cannot carry the run nonce — the run asks for
  // no proof, proceeds to a report whose URL has no probe param at all, and
  // records that no proof was had.
  it('exempts the native run from page identity and records the exemption', async () => {
    const { artifact, controls } = await runCapture({
      nativeApp: true,
      ua: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/126 Mobile',
      reportProbeParam: 'none',
    });

    expect(controls[0]).toMatchObject({ requirePageIdentity: false });
    expect(artifact.pageIdentity).toBe('unprovable');
  });

  it('launches Chrome at the nonce URL and holds the browser run to its proof', async () => {
    const { artifact, controls } = await runCapture({
      nativeApp: false,
      ua: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
      reportProbeParam: 'nonce',
    });

    const launches = captureCalls.filter((call) => call.includes('am start'));
    expect(launches.some((call) => call.includes('com.android.chrome'))).toBe(true);
    expect(
      launches.some((call) => call.includes(`probe=${encodeURIComponent(controls[0].nonce)}`))
    ).toBe(true);
    expect(captureCalls.some((call) => call.includes('art.splotch.app'))).toBe(false);
    expect(controls[0]).toMatchObject({ requirePageIdentity: true });
    expect(artifact.runtime).toBe('android-chrome');
    expect(artifact.pageIdentity).toBe('proven-by-url');
  });

  it('refuses a browser report from a page opened for another run', async () => {
    await expect(
      runCapture({
        nativeApp: false,
        ua: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
        reportProbeParam: 'none',
      })
    ).rejects.toThrow('open the exact printed URL');
  });
});
