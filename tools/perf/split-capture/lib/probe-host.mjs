// Serves the perf build with the probe bootstrapped into the page, and collects
// the report the page uploads when its gesture is done.
//
// Everything but the drawing route's HTML is proxied to the real preview server,
// so the bundle, headers, and env module under test are the ones `perf:serve`
// hands out. The HTML gains exactly one same-origin `<script src>`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { ROOT } from '../../../lib/proc.mjs';
import { pageBootstrapSource } from './page-bootstrap.mjs';
import { PROBE_HOST_PROTOCOL } from './probe-host-protocol.mjs';
import { keepIncomingReport, reportRejectionReason } from './report-store.mjs';
import { STAND_DOWN_PAGE_HTML, STAND_DOWN_PATH } from './chrome-tabs.mjs';

const PROBE_SOURCE = join(ROOT, 'tools', 'perf', 'probes', 'real-screen-probe.js');
// A dropped chunk fetch does not fail visibly: the module import throws, the
// route never hydrates, and the capture then measures a page whose buttons are
// server-rendered markup wired to nothing.
const UPSTREAM_ATTEMPTS = 3;
// The probe banks contact time; the runner, not the probe, decides when a phase
// ends, so this is deliberately far longer than any gesture.
const DEFAULT_CONTACT_MS = 600_000;

const json = (res, body) => {
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

const script = (res, body) => {
  res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
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

export function createProbeHost({ upstream, reportDir, log = console.log } = {}) {
  if (!upstream) throw new Error('createProbeHost requires an upstream');
  if (reportDir) mkdirSync(reportDir, { recursive: true });

  const state = {
    plan: { brush: 'pen', contactMs: DEFAULT_CONTACT_MS, finish: false, label: 'run' },
    report: null,
    progress: null,
    pulse: null,
    refill: null,
    // The last stale-page stand-down that adopted THIS plan's nonce (reset with
    // the plan). For a manual capture there is exactly one page, so a stale
    // stand-down means the human's URL lacked the run identity — the runner
    // fails fast on it instead of waiting out the full ready budget.
    stalePage: null,
    // How many times ANY page asked for the plan since the last reset. First
    // contact, not identity: a launched app that never loads the page makes no
    // request at all, and that silence is what the runner needs to detect fast
    // (issue 1316 — a locked iPad and a clean bundled build both look like a
    // successful launch followed by three minutes of nothing).
    planRequests: 0,
  };

  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');

    if (pathname === '/__probe/plan') {
      state.planRequests += 1;
      return json(res, state.plan);
    }
    // Where a stale page parks itself. Standing down to about:blank left a husk
    // nothing could prove ownership of — and closing unproven pages is exactly
    // the operator-tab hazard the litter clearer must not have. A husk on this
    // origin is this transport's by construction. Served inertly HERE, before
    // the HTML proxy below: a host missing this route proxies the path to the
    // app, gets a 404 page back WITH the bootstrap injected, and the husk
    // becomes a self-reloading page on the device being measured.
    if (pathname === STAND_DOWN_PATH) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(STAND_DOWN_PAGE_HTML);
    }
    if (pathname === '/__probe/state') {
      return json(res, {
        protocol: PROBE_HOST_PROTOCOL,
        upstream,
        plan: state.plan,
        ready: state.progress,
        hasReport: !!state.report,
        pulse: state.pulse,
        refill: state.refill,
        planRequests: state.planRequests,
        stalePage: state.stalePage,
      });
    }
    if (pathname === '/__probe/bootstrap.js') return script(res, pageBootstrapSource());
    if (pathname === '/__probe/probe.js') {
      return script(res, readFileSync(PROBE_SOURCE, 'utf8'));
    }
    if (req.method === 'PUT' && pathname === '/__probe/control') {
      const patch = await readBody(req);
      state.plan = { ...state.plan, ...patch };
      if (state.plan.reset) {
        state.report = null;
        state.progress = null;
        state.pulse = null;
        state.refill = null;
        state.planRequests = 0;
        state.stalePage = null;
        delete state.plan.reset;
      }
      return json(res, state.plan);
    }
    if (req.method === 'POST' && pathname.startsWith('/__probe/')) {
      const payload = await readBody(req);
      if (pathname === '/__probe/report') {
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
          const events = payload.report?.events?.length ?? 0;
          log(
            `report received for ${state.plan.label} (${events} events)` +
              (payload.error ? ` — ${payload.error}` : '')
          );
        }
      } else if (pathname === '/__probe/log') {
        log(`page log: ${JSON.stringify(payload)}`);
        if (payload.kind === 'stale-page' && payload.nonce === state.plan.nonce) {
          state.stalePage = payload;
        }
      } else if (pathname === '/__probe/pulse') {
        // Nonce-gated like readiness, and max-not-last like the report store:
        // on the native paths identity is adopted rather than proven, so a
        // leftover backgrounded page on this origin can pulse 0 under the
        // current nonce — and a last-writer pulse would let it overwrite the
        // real page's count and abort a good capture.
        if (
          payload.nonce === state.plan.nonce &&
          (!state.pulse || payload.events >= state.pulse.events)
        ) {
          state.pulse = payload;
        }
      } else if (pathname === '/__probe/refill') {
        if (
          payload.nonce === state.plan.nonce &&
          payload.request?.sequence === state.plan.eraserRefillRequest?.sequence &&
          payload.request?.afterStroke === state.plan.eraserRefillRequest?.afterStroke &&
          (!state.refill || payload.request.sequence >= state.refill.request.sequence)
        ) {
          state.refill = payload;
        }
      } else if (pathname === '/__probe/ready') {
        // A suspended tab from an earlier run answers the same plan; only the
        // page that started under this nonce may report readiness.
        if (payload.nonce !== state.plan.nonce) return json(res, {});
        state.progress = payload;
        log(`probe ready ${payload.brush} ${payload.committed ?? ''}`);
      }
      return json(res, {});
    }

    let response = null;
    for (let attempt = 0; attempt < UPSTREAM_ATTEMPTS && !response; attempt += 1) {
      response = await fetch(`${upstream}${req.url}`, {
        method: req.method,
        headers: { ...req.headers, host: new URL(upstream).host },
      }).catch(() => null);
    }
    if (!response) {
      log(`upstream failed for ${req.url}`);
      res.writeHead(502, { 'content-type': 'text/plain' });
      return res.end('upstream unreachable');
    }
    const headers = Object.fromEntries(response.headers.entries());
    delete headers['content-encoding'];
    delete headers['content-length'];
    if ((headers['content-type'] ?? '').includes('text/html')) {
      const html = await response.text();
      headers['content-type'] = 'text/html; charset=utf-8';
      headers['cache-control'] = 'no-store';
      res.writeHead(response.status, headers);
      return res.end(
        html.replace('</body>', '<script src="/__probe/bootstrap.js"></script></body>')
      );
    }
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  });

  return { server, state };
}
