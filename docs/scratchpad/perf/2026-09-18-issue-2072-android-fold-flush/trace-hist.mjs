import { readFileSync } from 'node:fs';
const t = JSON.parse(readFileSync(process.argv[2], 'utf8')); const ev = t.traceEvents ?? t;
const tn = {}; for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') tn[e.pid + ':' + e.tid] = e.args.name;
// rAF callbacks (blink category) when traced, else main-frame starts (cc).
const FRAME_EVENTS = ['FrameRequestCallbackCollection::ExecuteFrameCallbacks', 'ProxyMain::BeginMainFrame'];
const frameName = FRAME_EVENTS.find((n) => ev.some((e) => e.name === n));
const raf = ev.filter((e) => e.name === frameName);
const cnt = {}; for (const e of raf) cnt[e.pid] = (cnt[e.pid] ?? 0) + 1; const rpid = +Object.entries(cnt).sort((x, y) => y[1] - x[1])[0][0];
const st = [...new Set(raf.filter((e) => e.pid === rpid).map((e) => e.ts))].sort((a, b) => a - b);
let a = 0, b = 0; for (let i = 1; i < st.length; i++) if (st[i] - st[i - 1] > b - a) { a = st[i - 1]; b = st[i]; }
const BIN = 1000000;
const series = (pred) => { const h = {}; for (const e of ev) if (pred(e)) { const k = Math.floor((e.ts - a) / BIN); h[k] = (h[k] ?? 0) + 1; } return h; };
const r = series((e) => e.pid === rpid && e.name === 'RasterImplementation::RasterCHROMIUM');
const g = series((e) => e.name === 'RasterDecoderImpl::DoRasterCHROMIUM');
const snap = series((e) => e.pid === rpid && e.name === 'Canvas2DResourceProvider::Snapshot');
const keys = [...new Set([...Object.keys(r), ...Object.keys(g)].map(Number))].sort((x, y) => x - y);
console.log('bin(s rel gap start)  renderer-RasterCHROMIUM  gpu-DoRasterCHROMIUM  renderer-Snapshot');
for (const k of keys) console.log(String(k).padStart(5), String(r[k] ?? 0).padStart(8), String(g[k] ?? 0).padStart(8), String(snap[k] ?? 0).padStart(8));
const rThreads = {}; for (const e of ev) if (e.pid === rpid && e.name === 'RasterImplementation::RasterCHROMIUM') rThreads[tn[e.pid + ':' + e.tid]] = (rThreads[tn[e.pid + ':' + e.tid]] ?? 0) + 1; console.log(rThreads);
