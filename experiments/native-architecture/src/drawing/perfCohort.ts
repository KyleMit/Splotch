import type { AppendOutcome, Stroke } from './model';
import type { PaperInput } from './paperInput';

// The native log tag (Android) and category (iOS) every line is written under, and the line's
// own `probe` field, so a host filter on either finds it.
export const PERF_LOG_TAG = 'SplotchPerf';
// SplotchPerfLog (ios/HelloWorld/SplotchPerfLog.swift, android .../SplotchPerfLog.kt) writes one
// line to the device log under PERF_LOG_TAG; native-perf-probe.test.mjs reads both sides.
export const PERF_LOG_MODULE = 'SplotchPerfLog';
export const PERF_LINE_VERSION = 2;
// React commits the lifting packet's render after its handler returns, and the committed raster
// repaints in that commit; a cohort's line waits this long after its last contact lifts so the
// commits it caused count toward it. The next contact closes it sooner.
export const COHORT_SETTLE_MS = 250;

export type PerfTimer = 'liveFlush' | 'sceneRecord';
export type PerfClock<Handle> = Readonly<{
  now: () => number;
  schedule: (run: () => void, delayMs: number) => Handle;
  cancel: (handle: Handle) => void;
}>;
// How a native sample timestamp is compared with performance.now(): the clock both read, and how
// much longer than the real interval a timestamp's resolution can make one read.
export type ClockJoin = Readonly<{ clock: string; errorMs: number }>;
export type PerfLineContext = Readonly<{ platform: string; build?: string; clockJoin: ClockJoin }>;

type Timing = { n: number; totalMs: number; maxMs: number };
type Cohort = {
  index: number;
  openedAt: number;
  endedAt: number;
  packets: number;
  samples: number;
  maxSamplesPerPacket: number;
  outcomes: Record<AppendOutcome, number>;
  strokes: number;
  points: number;
  inkCommits: number;
  surfaceCommits: number;
  timers: Record<PerfTimer, Timing>;
  // Per hand-off that carried new samples: from its newest sample, and from its oldest.
  submissions: number[];
  oldestSubmissions: number[];
  // Hand-offs while a contact was held, and the intervals between consecutive ones.
  handoffs: number;
  handoffGaps: number[];
  lastHandoffAt: number | null;
  firstSampleAt: number | null;
  firstDotMs: number | null;
};

function changedSamples(packet: PaperInput) {
  const changed = new Set(packet.changed);
  let samples = 0;
  for (const contact of packet.contacts)
    if (changed.has(contact.identifier)) samples += contact.samples.length;
  return samples;
}

const round = (ms: number) => Math.round(ms * 100) / 100;

function nearestRank(sorted: readonly number[], fraction: number) {
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

// Count and nearest-rank p50, p95, max and min of a set of millisecond intervals.
export function intervalSummary(intervals: readonly number[]) {
  if (intervals.length === 0) return { n: 0 };
  const sorted = [...intervals].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50Ms: round(nearestRank(sorted, 0.5)),
    p95Ms: round(nearestRank(sorted, 0.95)),
    maxMs: round(sorted[sorted.length - 1]),
    minMs: round(sorted[0]),
  };
}

const timing = ({ n, totalMs, maxMs }: Timing) => ({
  n,
  totalMs: round(totalMs),
  maxMs: round(maxMs),
});

function formatPerfLine(cohort: Cohort, context: PerfLineContext): string {
  return JSON.stringify({
    probe: PERF_LOG_TAG,
    v: PERF_LINE_VERSION,
    build: context.build || undefined,
    platform: context.platform,
    cohort: cohort.index,
    cohortMs: round(cohort.endedAt - cohort.openedAt),
    strokes: cohort.strokes,
    points: cohort.points,
    packets: cohort.packets,
    samples: cohort.samples,
    maxSamplesPerPacket: cohort.maxSamplesPerPacket,
    ...cohort.outcomes,
    inkLayoutEffectCommits: cohort.inkCommits,
    surfaceLayoutEffectCommits: cohort.surfaceCommits,
    liveFlush: timing(cohort.timers.liveFlush),
    sceneRecord: timing(cohort.timers.sceneRecord),
    inputToSubmission: intervalSummary(cohort.submissions),
    oldestToSubmission: intervalSummary(cohort.oldestSubmissions),
    firstDotMs: cohort.firstDotMs === null ? null : round(cohort.firstDotMs),
    handoffs: cohort.handoffs,
    submissionGap: intervalSummary(cohort.handoffGaps),
    clockJoin: context.clockJoin,
  });
}

function openCohort(index: number, openedAt: number): Cohort {
  return {
    index,
    openedAt,
    endedAt: openedAt,
    packets: 0,
    samples: 0,
    maxSamplesPerPacket: 0,
    outcomes: { appended: 0, duplicate: 0, minDistanceRejected: 0 },
    strokes: 0,
    points: 0,
    inkCommits: 0,
    surfaceCommits: 0,
    timers: {
      liveFlush: { n: 0, totalMs: 0, maxMs: 0 },
      sceneRecord: { n: 0, totalMs: 0, maxMs: 0 },
    },
    submissions: [],
    oldestSubmissions: [],
    handoffs: 0,
    handoffGaps: [],
    lastHandoffAt: null,
    firstSampleAt: null,
    firstDotMs: null,
  };
}

// One cohort runs from the first packet received while no contact is held to the packet that
// leaves none held. Render work after that still counts toward it until it settles; its line is
// written only then, and never while a later cohort is drawing.
export function createPerfCohorts<Handle>(
  clock: PerfClock<Handle>,
  context: PerfLineContext,
  emit: (line: string) => void
) {
  let nextIndex = 1;
  let open: Cohort | null = null;
  let closing: Cohort | null = null;
  let settle: Handle | null = null;
  const lines: string[] = [];
  let sampleAt = 0;
  // The newest and oldest native sample timestamps taken since the last flush, and those a flush
  // has recorded as ops that no submitted picture has carried yet. A picture carries only
  // recorded samples: one built before the next flush (a rebuild) lacks the samples taken since.
  type Span = { newest: number; oldest: number };
  let taken: Span | null = null;
  let recorded: Span | null = null;
  const widen = (span: Span | null, next: Span): Span =>
    span
      ? { newest: Math.max(span.newest, next.newest), oldest: Math.min(span.oldest, next.oldest) }
      : next;

  function finalize() {
    if (closing) lines.push(formatPerfLine(closing, context));
    closing = null;
  }

  function flush() {
    settle = null;
    finalize();
    if (open) return;
    for (const line of lines.splice(0)) emit(line);
  }

  const active = () => open ?? closing;

  function include(timestamp: number) {
    taken = widen(taken, { newest: timestamp, oldest: timestamp });
  }

  return {
    packet(packet: PaperInput) {
      if (!open) {
        finalize();
        open = openCohort(nextIndex++, clock.now());
        taken = null;
        recorded = null;
      }
      const samples = changedSamples(packet);
      open.packets += 1;
      open.samples += samples;
      open.maxSamplesPerPacket = Math.max(open.maxSamplesPerPacket, samples);
    },
    idle() {
      if (!open) return;
      open.endedAt = clock.now();
      closing = open;
      open = null;
      if (settle !== null) clock.cancel(settle);
      settle = clock.schedule(flush, COHORT_SETTLE_MS);
    },
    stroke(timestamp: number) {
      const cohort = active();
      if (!cohort) return;
      cohort.firstSampleAt ??= timestamp;
      include(timestamp);
    },
    sampleTime(timestamp: number) {
      sampleAt = timestamp;
    },
    append(outcome: AppendOutcome) {
      const cohort = active();
      if (!cohort) return;
      cohort.outcomes[outcome] += 1;
      if (outcome === 'appended') include(sampleAt);
    },
    drained(strokes: readonly Stroke[]) {
      const cohort = active();
      if (!cohort) return;
      cohort.strokes += strokes.length;
      for (const stroke of strokes) cohort.points = Math.max(cohort.points, stroke.points.length);
    },
    inkCommit() {
      const cohort = active();
      if (cohort) cohort.inkCommits += 1;
    },
    surfaceCommit() {
      const cohort = active();
      if (cohort) cohort.surfaceCommits += 1;
    },
    timed(timer: PerfTimer, elapsedMs: number) {
      const record = active()?.timers[timer];
      if (!record) return;
      record.n += 1;
      record.totalMs += elapsedMs;
      record.maxMs = Math.max(record.maxMs, elapsedMs);
    },
    // The samples taken since the last flush have become ops.
    flushed() {
      if (taken) recorded = widen(recorded, taken);
      taken = null;
    },
    // A hand-off carries every sample recorded as ops since the last one.
    submitted() {
      const cohort = active();
      if (!cohort) return;
      const now = clock.now();
      if (cohort === open) {
        cohort.handoffs += 1;
        if (cohort.lastHandoffAt !== null) cohort.handoffGaps.push(now - cohort.lastHandoffAt);
        cohort.lastHandoffAt = now;
      }
      if (!recorded) return;
      cohort.submissions.push(now - recorded.newest);
      cohort.oldestSubmissions.push(now - recorded.oldest);
      if (cohort.firstDotMs === null && cohort.firstSampleAt !== null)
        cohort.firstDotMs = now - cohort.firstSampleAt;
      recorded = null;
    },
  };
}
