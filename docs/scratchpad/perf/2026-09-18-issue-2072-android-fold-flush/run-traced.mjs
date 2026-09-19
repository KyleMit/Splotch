// Diagnostic only: run-session-android.mjs plus a CDP trace from the settle
// phase to TRACE_UNTIL (default 'undo') + TRACE_UNDO_MS. The trace's own cost
// stretches the stall, so its intervals are never scored.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const PAYLOAD = process.env.PAYLOAD ?? new URL('../2026-09-18-issue-1750-ipad-baseline/session-payload.js', import.meta.url).pathname;
const [label, arm = 'restamp', mode = 'paced', extra = '{}'] = process.argv.slice(2);
const base = process.env.HARNESS_URL, serial = process.env.ANDROID_SERIAL, outDir = process.env.OUT_DIR;
const CDP_PORT = 9225;
const CATS = (process.env.CATS ?? 'toplevel,cc,gpu,viz,blink,blink.canvas,skia,benchmark,v8,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,disabled-by-default-skia,disabled-by-default-skia.gpu,disabled-by-default-gpu.service,disabled-by-default-cc.debug,shaders,gpu.capture,renderer.scheduler').split(',');
const adb = (...a) => { const r = spawnSync('adb', ['-s', serial, ...a], { encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); return r.stdout; };
const url = `${base}?run=${encodeURIComponent(label)}-${Date.now()}`;
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, 'com.android.chrome');
adb('forward', `tcp:${CDP_PORT}`, 'localabstract:chrome_devtools_remote');
let browser;
try {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  let page;
  for (let i = 0; i < 40 && !page; i++) { page = browser.contexts()[0].pages().find((p) => p.url() === url); if (!page) await new Promise((r) => setTimeout(r, 500)); }
  await page.bringToFront();
  await page.waitForFunction(() => window.__engineReady === true && !!window.__engine, null, { timeout: 60000 });
  await page.evaluate((c) => (window.__cfg = c), { arm, mode, ...JSON.parse(extra) });
  await page.evaluate(readFileSync(PAYLOAD, 'utf8') + ';0');
  const log = (m) => console.error(new Date().toISOString().slice(11, 19), m);
  log('injected');
  const wsUrl = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl.replace(/ws:\/\/[^/]+/, `ws://127.0.0.1:${CDP_PORT}`);
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let nextId = 1; const pending = new Map(); const listeners = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method) listeners.get(d.method)?.(d.params); };
  const cdp = {
    send: (method, params = {}) => new Promise((r, j) => { const id = nextId++; pending.set(id, (d) => (d.error ? j(new Error(JSON.stringify(d.error))) : r(d.result))); ws.send(JSON.stringify({ id, method, params })); }),
    on: (method, fn) => listeners.set(method, fn),
  };
  log('cdp session');
  const done = new Promise((r) => cdp.on('Tracing.tracingComplete', r));
  for (;;) { const pr = await page.evaluate(() => window.__sessionProgress); if (process.env.VERBOSE) log(pr); if (pr === 'settle') break; await new Promise((r) => setTimeout(r, 250)); }
  await cdp.send('Tracing.start', { traceConfig: { includedCategories: CATS, recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReturnAsStream' });
  log('tracing started');
  while ((await page.evaluate(() => window.__sessionProgress)) !== (process.env.TRACE_UNTIL ?? 'undo')) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, Number(process.env.TRACE_UNDO_MS ?? 4500)));
  log('ending');
  await cdp.send('Tracing.end');
  log('end sent');
  const { stream } = await done;
  log('complete');
  let text = '';
  for (;;) { const c = await cdp.send('IO.read', { handle: stream, size: 1 << 20 }); text += c.base64Encoded ? Buffer.from(c.data, 'base64').toString() : c.data; if (c.eof) break; }
  await cdp.send('IO.close', { handle: stream });
  ws.close();
  let result = null;
  while (!result) { await new Promise((r) => setTimeout(r, 1000)); result = await page.evaluate(() => window.__session ?? null); }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${label}.json`), JSON.stringify({ label, harnessUrl: base, device: { platform: 'android' }, host: { wallFromInjectMs: 0, at: new Date().toISOString() }, result }));
  writeFileSync(join(outDir, `${label}.trace.json`), text);
  console.log(label, result.error ?? result.entry, text.length, 'bytes');
  await page.close();
} finally {
  await browser?.close().catch(() => {});
  spawnSync('adb', ['-s', serial, 'forward', '--remove', `tcp:${CDP_PORT}`]);
}
