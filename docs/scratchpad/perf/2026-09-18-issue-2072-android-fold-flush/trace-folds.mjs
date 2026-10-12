import { readFileSync } from 'node:fs';
const t = JSON.parse(readFileSync(process.argv[2], 'utf8')); const ev = t.traceEvents ?? t;
const tn = {}; for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') tn[e.pid + ':' + e.tid] = e.args.name;
const pc = ev.filter((e) => e.name === 'CommandBufferService:PutChanged' && /RendererMainThread/.test(e.args?.handler ?? '')).sort((a, b) => a.ts - b.ts);
const rm = ev.filter((e) => tn[e.pid + ':' + e.tid] === 'CrRendererMain');
const rpid = rm.find((e) => e.name === 'RasterImplementation::RasterCHROMIUM')?.pid;
const issue = ev.filter((e) => e.pid === rpid && e.name === 'RasterImplementation::RasterCHROMIUM').map((e) => e.ts).sort((a, b) => a - b);
const t0 = issue[0];
// Cluster renderer raster issues into bursts separated by > 300 ms (one per fold).
const bursts = []; for (const ts of issue) { const last = bursts.at(-1); if (last && ts - last.end < 300000) { last.end = ts; last.n++; } else bursts.push({ start: ts, end: ts, n: 1 }); }
for (const bu of bursts) {
  const exec = pc.filter((e) => e.ts >= bu.start - 1000 && e.ts < bu.start + 1400000);
  const firstExec = exec.find((e) => e.ts >= bu.start);
  console.log(`issue burst @${((bu.start - t0) / 1e6).toFixed(2)}s n=${bu.n} | GPU flushes in next 1.4s: ${exec.length}, busy ${(exec.reduce((a, e) => a + e.dur, 0) / 1000).toFixed(0)} ms, first exec +${firstExec ? ((firstExec.ts - bu.start) / 1000).toFixed(0) : '-'} ms`);
}
const flushers = ev.filter((e) => e.pid === rpid && /GpuChannel::Flush|VerifyFlush|EnsureFlush|CommandBufferProxyImpl::Flush|ShallowFlush/.test(e.name));
const byT = {}; for (const e of flushers) { const k = (tn[e.pid + ':' + e.tid] ?? e.tid) + ' ' + e.name; byT[k] = (byT[k] ?? 0) + 1; } console.log(byT);
