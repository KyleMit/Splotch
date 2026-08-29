// The floor control: the cheapest drawing app that could exist, measured by the
// same probe, the same maths, and the same trusted touch as Splotch.
//
//   npm run perf:device:floor -- --port=4176
//
// It answers the question the 1% lost-frame gate cannot answer on its own — how
// much of a browser's in-contact frame loss is the browser rather than the app.
// The page is one full-size canvas, one `stroke()` per pointermove: no tiles, no
// blend planes, no halos, no framework. Whatever this page loses is that
// browser's floor on that device, and only the difference above it is Splotch's.
//
// This is a DIAGNOSTIC, not a gate. ADR-0136 used it to establish that a
// physical-iPad capture scoring 1.46% "lost" frame time had a presentation
// deficit of exactly zero — a page containing nothing but a canvas and a stroke
// call cannot be losing frames, so the charge was pricing rAF callback jitter.
// That finding is why the credited charge exists.
//
// Its own architecture is one ADR-0085 rejected: a single full-viewport canvas,
// which on the iPad is ~3 Mpx and causes the WebKit surface-flush starvation the
// tiled live canvas exists to avoid. So it measures a bad implementation rather
// than a platform limit, and a gate derived from it would enshrine that. Reach
// for it to answer "is this the app or the browser", never to score a release.
//
// The DOM shape (#drawingCanvas, .paper-view) is what the probe requires.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { STAND_DOWN_PAGE_HTML, STAND_DOWN_PATH } from './lib/chrome-tabs.mjs';
import { join } from 'node:path';
import { argFlag, isMain, ROOT, runMain } from '../../lib/proc.mjs';
import { keepIncomingReport, reportRejectionReason } from './lib/report-store.mjs';

const PROBE_SOURCE = join(ROOT, 'tools', 'perf', 'probes', 'real-screen-probe.js');
const DEFAULT_PORT = 4176;
const DEFAULT_REPORT_DIR = join(ROOT, 'perf-profiles', 'split-capture', 'reports');
const CONTACT_BANK_MS = 600_000;
// Matches the app's own live-canvas cap so the control is not handed a cheaper
// surface than the thing it is a control for.
const MAX_DEVICE_PIXEL_RATIO = 2;
const STROKE_WIDTH_CSS_PX = 12;

const PAGE = `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<title>floor control</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #f4f1ea; }
  body { touch-action: none; user-select: none; }
  .paper-view { position: fixed; inset: 0; }
  #drawingCanvas { position: fixed; inset: 0; width: 100%; height: 100%; touch-action: none; display: block; }
</style></head>
<body>
<!-- The hidden attribute is load-bearing, not decoration. The probe starts a
     blank phase only while .paper-view is hidden, which is how the app signals
     "blank paper" rather than "a coloring page is open". Rendered visible, the
     probe decides a page is active, never starts the phase, and reports every
     recorded event as "never started" - thousands of frames attributed to
     nothing. -->
<div class="paper-view" hidden></div>
<canvas id="drawingCanvas"></canvas>
<script src="/__probe/control.js"></script>
<script src="/__probe/bootstrap.js"></script>
</body></html>`;

const CONTROL = `
const canvas = document.getElementById('drawingCanvas');
const scale = Math.min(window.devicePixelRatio || 1, ${MAX_DEVICE_PIXEL_RATIO});
canvas.width = Math.round(canvas.clientWidth * scale);
canvas.height = Math.round(canvas.clientHeight * scale);
const context = canvas.getContext('2d');
context.lineCap = 'round';
context.lineJoin = 'round';
context.lineWidth = ${STROKE_WIDTH_CSS_PX} * scale;
context.strokeStyle = '#7c4dff';
const live = new Map();
canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  live.set(event.pointerId, { x: event.clientX * scale, y: event.clientY * scale });
});
canvas.addEventListener('pointermove', (event) => {
  const previous = live.get(event.pointerId);
  if (!previous) return;
  event.preventDefault();
  // Coalesced samples are consumed the way the app consumes them, so the
  // control is not accidentally cheaper by dropping input the app draws.
  const samples = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
  context.beginPath();
  context.moveTo(previous.x, previous.y);
  let point = previous;
  for (const sample of samples.length ? samples : [event]) {
    point = { x: sample.clientX * scale, y: sample.clientY * scale };
    context.lineTo(point.x, point.y);
  }
  context.stroke();
  live.set(event.pointerId, point);
});
const end = (event) => live.delete(event.pointerId);
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', end);
`;

// Exported for the executed floor-bootstrap test only — a source-substring
// assertion would stay green with the identity branch disabled.
export const FLOOR_BOOTSTRAP_SOURCE = `
(async () => {
  const post = (path, body) =>
    fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const plan = await fetch('/__probe/plan').then((response) => response.json());
  const nonce = plan.nonce;
  // The same opened-page identity the capture bootstrap proves (issue 1307):
  // the preflight launches this page at a URL carrying the run's nonce, so a
  // restored or delayed floor page from an earlier run can prove it is not this
  // run's page and stand down instead of adopting the current plan. Only when
  // the plan carries a nonce — a hand-opened standalone host asks for no proof.
  if (nonce && new URLSearchParams(location.search).get('verify') !== nonce) {
    location.replace('${STAND_DOWN_PATH}');
    return;
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
  const rect = document.querySelector('#drawingCanvas').getBoundingClientRect();
  await post('/__probe/ready', {
    nonce,
    geometry: {
      canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { width: innerWidth, height: innerHeight },
      outerViewport: { width: outerWidth, height: outerHeight },
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
    await wait(400);
  }
  const report = window.__probe.finish();
  const counts = report.meta.counts;
  const read = (accessor, expected) => {
    const rows = [];
    while (rows.length < expected) {
      const slice = window.__probe[accessor](rows.length, 5000);
      if (!slice || !slice.length) break;
      rows.push(...slice);
    }
    return rows;
  };
  report.frames = read('frames', counts.frames);
  report.events = read('events', counts.events);
  report.measures = read('measures', counts.measures);
  window.__probe.stop();
  await post('/__probe/report', { nonce, report });
})();
`;

const json = (res, body) => {
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

const send = (res, type, body) => {
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function createFloorControlHost({ reportDir, log = console.log } = {}) {
  if (reportDir) mkdirSync(reportDir, { recursive: true });
  const state = {
    plan: { finish: false, label: 'control', contactMs: CONTACT_BANK_MS },
    report: null,
    progress: null,
  };

  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/__probe/plan') return json(res, state.plan);
    // Same inert husk page the probe host serves: the litter matcher treats
    // this path as a constant meaning "dead page", and the floor host's
    // catch-all would otherwise answer it with a LIVE page that adopts the
    // current plan.
    if (pathname === STAND_DOWN_PATH) {
      return send(res, 'text/html', STAND_DOWN_PAGE_HTML);
    }
    if (pathname === '/__probe/state') {
      return json(res, { ready: state.progress, hasReport: !!state.report });
    }
    if (pathname === '/__probe/control.js') return send(res, 'text/javascript', CONTROL);
    if (pathname === '/__probe/bootstrap.js') {
      return send(res, 'text/javascript', FLOOR_BOOTSTRAP_SOURCE);
    }
    if (pathname === '/__probe/probe.js') {
      return send(res, 'text/javascript', readFileSync(PROBE_SOURCE, 'utf8'));
    }
    if (req.method === 'PUT' && pathname === '/__probe/control') {
      const patch = await readBody(req);
      state.plan = { ...state.plan, ...patch };
      if (state.plan.reset) {
        state.report = null;
        state.progress = null;
        delete state.plan.reset;
      }
      return json(res, state.plan);
    }
    if (req.method === 'POST' && pathname.startsWith('/__probe/')) {
      const payload = await readBody(req);
      if (pathname === '/__probe/report') {
        // The plan nonce arms the stale-run gate in reportRejectionReason;
        // omitting it here left that gate disabled on the floor path, so a
        // restored floor page could bank an earlier run's cadence under the
        // current preflight (issue 1307).
        const rejection = reportRejectionReason(state.report, payload, state.plan.nonce);
        if (rejection) {
          log(`ignored ${rejection} for ${state.plan.label}`);
          return json(res, {});
        }
        if (keepIncomingReport(state.report, payload)) {
          state.report = payload;
          if (reportDir) {
            writeFileSync(join(reportDir, `${state.plan.label}.json`), JSON.stringify(payload));
          }
          log(`report received for ${state.plan.label}`);
        }
      } else if (pathname === '/__probe/ready') {
        if (payload.nonce !== state.plan.nonce) return json(res, {});
        state.progress = payload;
        log('floor control ready');
      }
      return json(res, {});
    }
    return send(res, 'text/html; charset=utf-8', PAGE);
  });

  return { server, state };
}

// `server.close()` stops the listener accepting new connections and then waits for
// the established ones to end on their own. The device's browser holds its
// keep-alive sockets open long after the capture is done, so those sockets keep the
// event loop non-empty and the process never exits — a verification that passed every
// check still hangs, which is invisible interactively and fatal in a chained
// unattended run. Destroying them is the only thing that releases the loop.
export function closeFloorControlHost(server) {
  return new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
}

export function serveFloorControl({
  port = Number(argFlag('port', DEFAULT_PORT)),
  reportDir = argFlag('report-dir', DEFAULT_REPORT_DIR),
} = {}) {
  const { server } = createFloorControlHost({ reportDir });
  server.listen(port, '0.0.0.0', () => console.log(`floor control on ${port}`));
  return server;
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    serveFloorControl();
  });
}
