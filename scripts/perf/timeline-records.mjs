// Counts the rendering work a run did, off the WebKit Inspector Protocol's
// Timeline domain — the compositor side the `engine.*` marks structurally cannot
// see, without a hand-driven Web Inspector recording.
//
// WHAT IT CAN AND CANNOT TELL YOU, measured on iPad13,8 / iPadOS 26.5:
//
// `Timeline.enable` + `Timeline.start` works over the protocol and streams
// `Timeline.eventRecorded` with the full record tree — RenderingFrame, Composite,
// Paint, RecalculateStyles, Layout, EventDispatch, FireAnimationFrame. But **every
// record arrives with `startTime: 0` and `endTime: 0`**, mid-recording ones
// included. So this yields COUNTS AND STRUCTURE, never durations, and no record
// can be attributed to a moment or a phase.
//
// That is why a Web Inspector *export* is still the only source of paint/composite
// durations (`npm run perf:ios:analyze`, and the runbook's Timeline section). The
// skill notes previously said the protocol's stream "is not the shape the analyzer
// parses"; the specific reason is the zeroed timestamps.
//
// Counts are still a real A/B signal: "composites per in-contact frame" compares
// across suppression conditions, which is how the per-event blend nudge's
// compositor cost gets measured rather than argued. Because records carry no time,
// a counted run must be SINGLE-PHASE for the number to mean anything.

// Instruments that matter for a canvas workload. `Timeline.setInstruments` was
// tried and rejected: with an explicit instrument list (and with autocapture
// disabled) the rendering records stopped arriving altogether.
const RENDERING_RECORD_TYPES = [
  'RenderingFrame',
  'Composite',
  'Paint',
  'RecalculateStyles',
  'ScheduleStyleRecalculation',
  'Layout',
  'InvalidateLayout',
  'FireAnimationFrame',
  'EventDispatch',
  'FunctionCall',
];

export function createTimelineCounter() {
  const counts = new Map();
  let records = 0;

  const walk = (record) => {
    if (!record || typeof record !== 'object') return;
    if (record.type) counts.set(record.type, (counts.get(record.type) ?? 0) + 1);
    for (const child of record.children ?? []) walk(child);
  };

  return {
    onEvent(method, params) {
      if (method !== 'Timeline.eventRecorded') return;
      records++;
      walk(params?.record);
    },
    async start(session) {
      for (const method of ['Timeline.enable', 'Timeline.start']) {
        const reply = await session.command(method, {});
        if (reply.error) throw new Error(`${method} failed: ${reply.error.message}`);
      }
    },
    async stop(session) {
      await session.command('Timeline.stop', {}).catch(() => {});
    },
    summary() {
      return {
        topLevelRecords: records,
        counts: Object.fromEntries(
          [...counts].sort(([, a], [, b]) => b - a).filter(([type]) => counts.get(type) > 0)
        ),
      };
    },
  };
}

// Per in-contact frame, which is the comparable form: a phase that drew for
// longer did more of everything.
export function timelineRows(summary, contactFrames) {
  if (!summary || !contactFrames) return [];
  return RENDERING_RECORD_TYPES.filter((type) => summary.counts[type] !== undefined).map(
    (type) => ({
      record: type,
      count: summary.counts[type],
      'per frame': Math.round((summary.counts[type] / contactFrames) * 100) / 100,
    })
  );
}
