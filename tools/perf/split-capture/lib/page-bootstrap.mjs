// The script the probe host injects into the drawing route.
//
// This is the "measurement" half of the split: the page instruments itself and
// uploads its own report over ordinary HTTP, so no script channel into the
// device is needed. Input arrives separately, as real trusted touch. That is the
// whole point — every existing capture path drives input and reads measurement
// down the same debugger connection, and on a modern iPad that connection is the
// part that is unavailable.
//
// It is a string because it runs in the page, not here. It is injected as a
// same-origin `<script src>` rather than eval'd: the route's enforcing CSP
// (ADR-0073) allows `script-src 'self'` and does not allow `unsafe-eval`, so
// nothing about the policy has to be relaxed to measure the page.
import { BRUSH_BUTTON_BY_MODE } from '../../ios/capture-xcuitest-screen.mjs';

// The page polls its plan while it waits for the runner to end the phase. Long
// enough not to spin, short enough that a finished gesture is not left banking
// idle contact time.
const PLAN_POLL_MS = 400;
const READY_TIMEOUT_MS = 25_000;
const HYDRATION_TIMEOUT_MS = 20_000;
const BRUSH_COMMIT_TIMEOUT_MS = 12_000;
const BRUSH_ATTEMPTS = 4;
// The probe's own row accessors page through its ring buffers; this is the slice
// size, not a cap on the capture.
const REPORT_SLICE_ROWS = 5_000;

export function pageBootstrapSource() {
  return `
(async () => {
  const BRUSH_BUTTONS = ${JSON.stringify(BRUSH_BUTTON_BY_MODE)};
  const post = (path, body) =>
    fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const log = (payload) => post('/__probe/log', payload);
  window.addEventListener('error', (event) =>
    log({ kind: 'error', message: String(event.message) })
  );
  window.addEventListener('unhandledrejection', (event) =>
    log({ kind: 'rejection', message: String(event.reason && event.reason.message || event.reason) })
  );
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (test, timeoutMs = ${READY_TIMEOUT_MS}) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (test()) return true;
      await wait(150);
    }
    return false;
  };
  try {
    const plan = await fetch('/__probe/plan').then((response) => response.json());
    // Safari keeps earlier tabs alive, and their bootstraps poll the same plan.
    // Each run stamps a nonce so only the page that started under it reports;
    // otherwise a suspended tab's near-empty tables overwrite the real capture.
    const nonce = plan.nonce;
    const sized = await until(() => {
      const canvas = document.querySelector('#drawingCanvas');
      return canvas && canvas.getBoundingClientRect().width > 0;
    });
    if (!sized) throw new Error('no sized #drawingCanvas');

    // The route's buttons are server-rendered, so a page whose modules failed to
    // load still looks complete and still answers every selector — it just does
    // nothing when clicked. The dev-harness seam only exists after hydration, so
    // it is the honest test, and one reload is enough to recover.
    const hydrated = await until(
      () => typeof window.__committedBrushMode === 'function',
      ${HYDRATION_TIMEOUT_MS}
    );
    if (!hydrated) {
      const url = new URL(location.href);
      if (!url.searchParams.has('rehydrate')) {
        url.searchParams.set('rehydrate', '1');
        await log({ kind: 'rehydrate', href: url.toString() });
        location.replace(url.toString());
        return;
      }
      throw new Error('route never hydrated');
    }

    // Every brush is selected explicitly, pen included: the tool choice is
    // persisted, so a capture that assumed pen was the default drew its "pen"
    // strokes with whatever the previous capture had left selected.
    {
      const selector = BRUSH_BUTTONS[plan.brush];
      let committed = false;
      for (let attempt = 0; attempt < ${BRUSH_ATTEMPTS} && !committed; attempt++) {
        document.querySelector('button[aria-label="Expand controls"]')?.click();
        await until(() => document.querySelector('#brushButton'), 8000);
        document.querySelector('#brushButton')?.click();
        await until(() => document.querySelector(selector), 8000);
        document.querySelector(selector)?.click();
        committed = await until(
          () => window.__committedBrushMode?.() === plan.brush,
          ${BRUSH_COMMIT_TIMEOUT_MS}
        );
        if (!committed) {
          await log({ kind: 'brush-retry', attempt, mode: window.__committedBrushMode?.() ?? null });
          await wait(800);
        }
      }
      if (!committed) throw new Error('engine never committed ' + plan.brush);

      // Selecting through the menu can leave it open over the paper, and then
      // every synthesized touch lands on the menu instead of the canvas — which
      // produced captures with frames but no pointer events at all. Close it,
      // then prove the paper is what a touch at the canvas centre would hit.
      //
      // Openness is read from layout, not from the option existing: BrushMenu
      // renders its options unconditionally and only sets the hidden
      // attribute, so a presence check is true even when the menu is shut.
      // That check ran the
      // toggle its full three times on an already-closed menu and left it open
      // on the odd click — invisible in portrait, where the flyout misses the
      // canvas centre, and fatal in landscape, where it covers it.
      const menuStillOpen = () => !!document.querySelector(selector)?.offsetParent;
      for (let attempt = 0; attempt < 3 && menuStillOpen(); attempt++) {
        document.querySelector('#brushButton')?.click();
        await wait(500);
      }
    }
    // The eraser needs something to erase, or it measures clearing blank paper.
    if (plan.brush === 'eraser') {
      for (const canvas of document.querySelectorAll('canvas[data-live-tile]')) {
        const context = canvas.getContext('2d');
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.fillStyle = '#7c4dff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();
      }
      await wait(400);
    }

    window.__probePhases = 'blank';
    window.__probeContactMs = plan.contactMs;
    window.__probeHud = false;
    await new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = '/__probe/probe.js';
      element.onload = resolve;
      element.onerror = () => reject(new Error('probe script failed to load'));
      document.head.append(element);
    });
    if (!window.__probe) throw new Error('probe did not install');

    const rect = document.querySelector('#drawingCanvas').getBoundingClientRect();
    const centre = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (!centre || !centre.closest('.canvas-stack')) {
      throw new Error('canvas centre is covered by ' + (centre ? centre.tagName + '.' + centre.className : 'nothing'));
    }
    await post('/__probe/ready', {
      nonce,
      brush: plan.brush,
      committed: window.__committedBrushMode?.() ?? null,
      geometry: {
        canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        viewport: { width: innerWidth, height: innerHeight },
        screenX: window.screenX,
        screenY: window.screenY,
        dpr: window.devicePixelRatio,
        orientation: innerWidth > innerHeight ? 'LANDSCAPE' : 'PORTRAIT',
      },
    });

    while (true) {
      const current = await fetch('/__probe/plan').then((response) => response.json());
      if (current.nonce !== nonce) return;
      if (current.finish) break;
      await wait(${PLAN_POLL_MS});
    }

    const report = window.__probe.finish();
    const counts = report.meta.counts;
    const read = (accessor, expected) => {
      const rows = [];
      while (rows.length < expected) {
        const slice = window.__probe[accessor](rows.length, ${REPORT_SLICE_ROWS});
        if (!slice || !slice.length) break;
        rows.push(...slice);
      }
      return rows;
    };
    report.frames = read('frames', counts.frames);
    report.events = read('events', counts.events);
    report.measures = read('measures', counts.measures);
    window.__probe.stop();
    await post('/__probe/report', {
      report,
      topology: window.__drawingDebug?.getLiveSurfaceTopology?.() ?? null,
    });
  } catch (error) {
    await log({ kind: 'bootstrap', message: String(error?.message ?? error) });
    await post('/__probe/report', { error: String(error?.message ?? error) });
  }
})();
`;
}
