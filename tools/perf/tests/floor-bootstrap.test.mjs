// @vitest-environment happy-dom
//
// The floor-control bootstrap, EXECUTED — same standard as
// bootstrap-theme.test.mjs: a source-substring assertion stays green with the
// identity branch disabled, so the page runs for real against a fixture.
//
// Issue 1307: the floor page now proves which preflight opened it (the launch
// URL carries the run nonce as ?verify=) and stamps its report with the plan
// nonce, so the host's stale-run gate has something to check.
import { describe, expect, it, vi } from 'vitest';
import { FLOOR_BOOTSTRAP_SOURCE } from '../split-capture/serve-floor-control.mjs';

const BOOTSTRAP_TIMEOUT_MS = 10_000;

function runFloorBootstrap(plan, openedFor) {
  window.happyDOM?.setURL?.(
    openedFor === null
      ? 'http://floor-control.test/'
      : `http://floor-control.test/?verify=${encodeURIComponent(openedFor)}`
  );
  document.body.innerHTML = '<canvas id="drawingCanvas"></canvas>';
  const posted = [];
  let reportResolve;
  const reportPosted = new Promise((resolve) => (reportResolve = resolve));
  global.fetch = vi.fn(async (path, init) => {
    if (path === '/__probe/plan') return { json: async () => plan };
    posted.push({ path, body: init?.body ? JSON.parse(init.body) : null });
    if (path === '/__probe/report') reportResolve(posted.at(-1).body);
    return { json: async () => ({}) };
  });
  // The probe is a same-origin <script src> the fixture cannot fetch; simulate
  // its arrival where the bootstrap waits for it.
  const append = document.head.append.bind(document.head);
  document.head.append = (element) => {
    if (element.tagName === 'SCRIPT') {
      window.__probe = {
        finish: () => ({ meta: { counts: { frames: 1, events: 1, measures: 0 } } }),
        frames: (from) => (from === 0 ? [[0, 16, 0]] : []),
        events: (from) => (from === 0 ? [{ t: 1 }] : []),
        measures: () => [],
        stop: () => {},
      };
      queueMicrotask(() => element.onload?.());
      return;
    }
    return append(element);
  };
  new Function(FLOOR_BOOTSTRAP_SOURCE)();
  return { posted, reportPosted };
}

describe('the floor page proving which run opened it', () => {
  it(
    'reports ready and uploads under the run nonce when the URL matches the plan',
    async () => {
      const { posted, reportPosted } = runFloorBootstrap(
        { nonce: 'this-preflight', finish: true, contactMs: 1_000 },
        'this-preflight'
      );

      const report = await reportPosted;
      expect(report.nonce).toBe('this-preflight');
      expect(posted.find((call) => call.path === '/__probe/ready')?.body.nonce).toBe(
        'this-preflight'
      );
    },
    BOOTSTRAP_TIMEOUT_MS
  );

  it(
    'stands down without reporting when it was opened for another run',
    async () => {
      const { posted } = runFloorBootstrap(
        { nonce: 'this-preflight', finish: true, contactMs: 1_000 },
        'an-earlier-preflight'
      );
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(posted.some((call) => call.path === '/__probe/ready')).toBe(false);
      expect(posted.some((call) => call.path === '/__probe/report')).toBe(false);
    },
    BOOTSTRAP_TIMEOUT_MS
  );

  // A standalone hand-opened floor host runs with no nonce in its default plan;
  // it asks for no proof rather than refusing every page.
  it(
    'asks for no proof when the plan carries no nonce',
    async () => {
      const { posted } = runFloorBootstrap({ finish: true, contactMs: 1_000 }, null);
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(posted.some((call) => call.path === '/__probe/ready')).toBe(true);
    },
    BOOTSTRAP_TIMEOUT_MS
  );
});
