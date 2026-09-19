// Builds this package from the local capture directory (EVIDENCE_ROOT), sanitizing as it copies:
// run files lose `harnessUrl` (a LAN address) and are gzipped otherwise byte-for-byte as JSON;
// traces are cut to the scored page's renderer and the GPU process, and to the event names
// trace-hist.mjs and trace-folds.mjs read, with the trace's host metadata dropped; scripts and
// review records have the device serial, LAN address, and home paths replaced. MANIFEST.json
// records every packaged file's SHA-256 beside the SHA-256 of the original it came from.
//   EVIDENCE_ROOT=<dir> ANDROID_SERIAL=<serial> node package.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.env.EVIDENCE_ROOT;
const serial = process.env.ANDROID_SERIAL;
if (!root || !serial) throw new Error('set EVIDENCE_ROOT and ANDROID_SERIAL');
const here = new URL('.', import.meta.url).pathname;
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const manifest = [];
const SERIAL = new RegExp(serial, 'g');
const LAN = /192\.168\.\d+\.\d+/g;
const HOME_EVIDENCE = /\/Users\/[^/\s"']+\/\.splotch-rig\/evidence\/android-2072-120hz/g;
const HOME = /\/Users\/[^/\s"']+/g;
const scrub = (text) =>
  text.replace(SERIAL, '<serial>').replace(LAN, '<lan-ip>').replace(HOME_EVIDENCE, '<evidence>').replace(HOME, '<home>');

function put(rel, bytes, source, note) {
  mkdirSync(dirname(join(here, rel)), { recursive: true });
  writeFileSync(join(here, rel), bytes);
  const original = readFileSync(join(root, source));
  manifest.push({ file: rel, sha256: sha(bytes), source, sourceSha256: sha(original), transform: note });
}
const verbatim = (rel, source = rel) => put(rel, readFileSync(join(root, source)), source, 'verbatim');
const scrubbed = (rel, source = rel) =>
  put(rel, scrub(readFileSync(join(root, source), 'utf8')), source, 'serial, LAN address, and home paths replaced');

function runFile(dir, file) {
  const run = JSON.parse(readFileSync(join(root, dir, file), 'utf8'));
  delete run.harnessUrl;
  put(`runs/${dir}/${file}.gz`, gzipSync(JSON.stringify(run)), `${dir}/${file}`, 'harnessUrl removed; gzipped JSON');
}

const FRAME_EVENTS = ['FrameRequestCallbackCollection::ExecuteFrameCallbacks', 'ProxyMain::BeginMainFrame'];
const RENDERER_EVENTS = new Set([...FRAME_EVENTS, 'RasterImplementation::RasterCHROMIUM', 'Canvas2DResourceProvider::Snapshot']);
const GPU_EVENTS = new Set(['RasterDecoderImpl::DoRasterCHROMIUM', 'CommandBufferService:PutChanged']);
const FLUSH = /GpuChannel::Flush|VerifyFlush|EnsureFlush|CommandBufferProxyImpl::Flush|ShallowFlush/;

function traceExtract(label) {
  const source = `traced/${label}.trace.json`;
  const events = JSON.parse(readFileSync(join(root, source), 'utf8')).traceEvents;
  const frames = events.filter((e) => FRAME_EVENTS.includes(e.name));
  const count = {};
  for (const e of frames) count[e.pid] = (count[e.pid] ?? 0) + 1;
  const renderer = +Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
  const gpu = events.find((e) => e.name === 'RasterDecoderImpl::DoRasterCHROMIUM').pid;
  const keep = events
    .filter(
      (e) =>
        (e.ph === 'M' && (e.name === 'thread_name' || e.name === 'process_name') && (e.pid === renderer || e.pid === gpu)) ||
        (e.pid === renderer && (RENDERER_EVENTS.has(e.name) || FLUSH.test(e.name))) ||
        (e.pid === gpu && GPU_EVENTS.has(e.name))
    )
    .map(({ ph, cat, name, pid, tid, ts, dur, args }) => ({
      ph, cat, name, pid, tid, ts, dur,
      ...(ph === 'M' ? { args: { name: args.name } } : name === 'CommandBufferService:PutChanged' ? { args: { handler: args.handler } } : {}),
    }));
  put(`traces/${label}.extract.json.gz`, gzipSync(JSON.stringify({ traceEvents: keep })), source,
    `renderer pid and GPU pid only; names read by trace-hist.mjs/trace-folds.mjs; ${keep.length} of ${events.length} events; host metadata dropped`);
}

for (const f of readdirSync(join(root, 'scored')).filter((f) => f.endsWith('.json')).sort()) runFile('scored', f);
for (const f of ['tr-ctl.json', 'tr-trt.json']) runFile('traced', f);
for (const label of ['tr-ctl', 'tr-trt']) traceExtract(label);
verbatim('original/control.diagnostic-only.diff', 'control.diff');
// Kept as .txt so the Markdown formatter never rewrites the frozen plan's hashed bytes.
verbatim('original/PLAN.md.txt', 'PLAN.md');
for (const f of ['cadence-probe.log', 'run-set-scored.out', 'phase-cadence.mjs', 'export-compact.mjs',
  'reproduce.mjs', 'compact.json', 'scored-summary.json', 'scored-cadence.json', 'harness.sha256', 'raw.sha256']) verbatim(`original/${f}`, f);
verbatim('original/prechecks.log', 'scored/prechecks.log');
verbatim('original/driver.log', 'scored/driver.log');
verbatim('original/trace-analysis.txt', 'traced/trace-analysis.txt');
for (const f of ['cadence-probe.mjs', 'run-set.sh', 'rival-method-findings.json', 'rival-evidence-findings.json',
  'rival-evidence2-findings.json', 'rival-evidence3-findings.json']) scrubbed(`original/${f}`, f);
writeFileSync(join(here, 'MANIFEST.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`${manifest.length} files packaged`);
