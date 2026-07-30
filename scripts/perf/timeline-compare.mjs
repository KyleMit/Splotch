// Compare two Safari Web Inspector Timeline exports on the metric that attributes
// the real-screen lag: compositing at the stroke commit.
//
//   npm run perf:timeline:compare -- <baseline>.json <candidate>.json
//
// Why a second analyzer beside `perf:ios:analyze`: that one reports per-op engine
// cost from a single export. This answers "did the candidate build composite less
// per commit", which is a two-file question, and it reads durations the protocol
// Timeline domain cannot supply (it zeroes every timestamp — see
// timeline-records.mjs). Recording is therefore hand-driven; the procedure is in
// the profiling skill's ipad-device-profiling.md.
//
// The headline row is `long composites per commit`. Totals are NOT comparable
// across recordings, because a human draws a different amount every time.

import { readFileSync } from 'node:fs';
import { fail, isMain, runMain } from '../lib/proc.mjs';

// A composite this long is a dropped frame a child can see, not compositor noise:
// the observed beat on iPad Safari is 16.7 ms, while the stalls under
// investigation run ~245 ms.
const LONG_COMPOSITE_MS = 200;
const COUNTED_EVENT_TYPES = ['composite', 'recalculate-styles', 'layout', 'paint'];
const COMMIT_MARKER = 'engine.commit:start';

function readRecording(path) {
  const { recording } = JSON.parse(readFileSync(path, 'utf8'));
  if (!recording?.records) {
    fail(`${path} is not a Web Inspector Timeline export (expected a "recording.records" key).`);
  }
  const flat = [];
  const walk = (record) => {
    if (!record || typeof record !== 'object') return;
    if (record.type) flat.push(record);
    for (const child of record.children || []) walk(child);
  };
  for (const record of recording.records) walk(record);
  const durationMs = (record) => ((record.endTime ?? record.startTime) - record.startTime) * 1000;

  const byEvent = {};
  for (const record of flat) {
    if (!record.eventType) continue;
    const entry = (byEvent[record.eventType] ??= { n: 0, total: 0, max: 0 });
    entry.n++;
    entry.total += durationMs(record);
    entry.max = Math.max(entry.max, durationMs(record));
  }
  const composites = flat.filter((record) => record.eventType === 'composite').map(durationMs);
  return {
    windowS: recording.endTime - recording.startTime,
    byEvent,
    composites,
    longComposites: composites.filter((ms) => ms > LONG_COMPOSITE_MS),
    commits: (recording.markers || []).filter((marker) => marker.details === COMMIT_MARKER).length,
  };
}

export async function compareTimelines(argv = process.argv.slice(2)) {
  const [basePath, candidatePath] = argv;
  if (!basePath || !candidatePath) {
    fail('usage: npm run perf:timeline:compare -- <baseline>.json <candidate>.json');
  }
  const base = readRecording(basePath);
  const candidate = readRecording(candidatePath);

  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const mean = (values) => (values.length ? sum(values) / values.length : 0);
  const f = (value) => (value === undefined ? '—' : value.toFixed(1));
  const perCommit = (run) => (run.commits ? run.longComposites.length / run.commits : 0);

  console.log(`baseline : ${basePath}`);
  console.log(`candidate: ${candidatePath}\n`);
  console.table(
    COUNTED_EVENT_TYPES.map((eventType) => ({
      eventType,
      'base n': base.byEvent[eventType]?.n ?? 0,
      'base total ms': f(base.byEvent[eventType]?.total ?? 0),
      'base max': f(base.byEvent[eventType]?.max ?? 0),
      'cand n': candidate.byEvent[eventType]?.n ?? 0,
      'cand total ms': f(candidate.byEvent[eventType]?.total ?? 0),
      'cand max': f(candidate.byEvent[eventType]?.max ?? 0),
    }))
  );
  console.table([
    {
      metric: `composites > ${LONG_COMPOSITE_MS}ms`,
      baseline: base.longComposites.length,
      candidate: candidate.longComposites.length,
    },
    { metric: `${COMMIT_MARKER} marks`, baseline: base.commits, candidate: candidate.commits },
    {
      metric: 'long composites per commit',
      baseline: f(perCommit(base)),
      candidate: f(perCommit(candidate)),
    },
    {
      metric: 'mean long composite ms',
      baseline: f(mean(base.longComposites)),
      candidate: f(mean(candidate.longComposites)),
    },
    {
      metric: 'composite ms per second of recording',
      baseline: f(sum(base.composites) / base.windowS),
      candidate: f(sum(candidate.composites) / candidate.windowS),
    },
    { metric: 'recording window s', baseline: f(base.windowS), candidate: f(candidate.windowS) },
  ]);
  return { base, candidate };
}

if (isMain(import.meta.url)) runMain(compareTimelines);
