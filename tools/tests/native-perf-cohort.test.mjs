import { describe, expect, it } from 'vitest';
import {
  COHORT_SETTLE_MS,
  createPerfCohorts,
  PERF_LINE_VERSION,
  PERF_LOG_TAG,
} from '../../src/drawing/perfCohort.ts';
import { appendPoint, sampleOutcome } from '../../src/drawing/model.ts';

const CLOCK_JOIN = { clock: 'mach_absolute_time', errorMs: 0 };

function harness(context = { platform: 'ios', build: 'abc1234', clockJoin: CLOCK_JOIN }) {
  const clock = { at: 0, timers: new Map(), nextTimer: 0, gc: { count: 0, ms: 0 } };
  const lines = [];
  const cohorts = createPerfCohorts(
    {
      now: () => clock.at,
      schedule: (run, delayMs) => {
        const id = ++clock.nextTimer;
        clock.timers.set(id, { run, due: clock.at + delayMs });
        return id;
      },
      cancel: (id) => clock.timers.delete(id),
    },
    context,
    (line) => lines.push(JSON.parse(line)),
    () => clock.gc
  );
  function advance(ms) {
    clock.at += ms;
    for (const [id, { run, due }] of [...clock.timers])
      if (due <= clock.at) {
        clock.timers.delete(id);
        run();
      }
  }
  return { cohorts, lines, clock, advance };
}

function packet(phase, contacts, changed = contacts.map(({ identifier }) => identifier)) {
  return {
    sequence: 0,
    phase,
    changed,
    contacts: contacts.map(({ identifier, samples }) => ({
      identifier,
      startedAt: 0,
      tool: 'touch',
      samples: Array.from({ length: samples }, (_, index) => ({
        pageX: index,
        pageY: index,
        timestamp: index,
      })),
    })),
    viewport: { width: 1024, height: 768, bottomInset: 0 },
  };
}

const stroke = (points) => ({
  brush: 'pen',
  color: 'Red',
  width: 8,
  points: Array.from({ length: points }, (_, x) => ({ x, y: 0 })),
});

describe('sampleOutcome', () => {
  // Negative control: classifying by whether the stroke grew would call both rejections duplicates.
  it('names what the stroke keeps of each sample, as appendPoint keeps it', () => {
    const points = [{ x: 10, y: 10 }];
    for (const [point, includeEndpoint, outcome] of [
      [{ x: 20, y: 20 }, false, 'appended'],
      [{ x: 10, y: 10 }, true, 'duplicate'],
      [{ x: 10, y: 10 }, false, 'duplicate'],
      [{ x: 10.5, y: 10 }, false, 'minDistanceRejected'],
      [{ x: 10.5, y: 10 }, true, 'appended'],
    ]) {
      expect(sampleOutcome(points, point, includeEndpoint)).toBe(outcome);
      expect(appendPoint(points, point, includeEndpoint).length > points.length).toBe(
        outcome === 'appended'
      );
    }
  });
});

describe('createPerfCohorts', () => {
  it('counts one cohort from its first packet to the packet that leaves no contact held', () => {
    const { cohorts, lines, advance } = harness();
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    cohorts.stroke(0);
    advance(8);
    cohorts.packet(packet('move', [{ identifier: 'a', samples: 4 }]));
    for (const outcome of ['appended', 'duplicate', 'appended', 'minDistanceRejected'])
      cohorts.append(outcome);
    advance(8);
    cohorts.packet(packet('end', [{ identifier: 'a', samples: 1 }]));
    cohorts.append('duplicate');
    cohorts.drained([stroke(3)]);
    cohorts.idle();
    expect(lines).toEqual([]);
    advance(COHORT_SETTLE_MS - 1);
    expect(lines).toEqual([]);
    advance(1);
    expect(lines).toEqual([
      {
        probe: PERF_LOG_TAG,
        v: PERF_LINE_VERSION,
        build: 'abc1234',
        platform: 'ios',
        cohort: 1,
        cohortMs: 16,
        strokes: 1,
        points: 3,
        packets: 3,
        samples: 6,
        maxSamplesPerPacket: 4,
        appended: 2,
        duplicate: 2,
        minDistanceRejected: 1,
        inkLayoutEffectCommits: 0,
        surfaceLayoutEffectCommits: 0,
        liveFlush: { n: 0, totalMs: 0, maxMs: 0 },
        sceneRecord: { n: 0, totalMs: 0, maxMs: 0 },
        handoff: { n: 0, totalMs: 0, maxMs: 0 },
        pictureRelease: { n: 0, totalMs: 0, maxMs: 0 },
        audioVolume: { n: 0, totalMs: 0, maxMs: 0 },
        inputToSubmission: { n: 0 },
        oldestToSubmission: { n: 0 },
        firstDotMs: null,
        handoffs: 0,
        submissionGap: { n: 0 },
        longestGap: null,
        packetGap: { n: 2, p50Ms: 8, p95Ms: 8, maxMs: 8, minMs: 8 },
        receiptLag: { n: 3, p50Ms: 5, p95Ms: 16, maxMs: 16, minMs: 0 },
        memoryWarnings: 0,
        gc: { n: 0, ms: 0 },
        clockJoin: CLOCK_JOIN,
      },
    ]);
  });

  it('counts samples only for the contacts a packet changes', () => {
    const { cohorts, lines, advance } = harness();
    cohorts.packet(
      packet(
        'move',
        [
          { identifier: 'a', samples: 3 },
          { identifier: 'b', samples: 5 },
        ],
        ['a']
      )
    );
    cohorts.idle();
    advance(COHORT_SETTLE_MS);
    expect(lines[0]).toMatchObject({ packets: 1, samples: 3, maxSamplesPerPacket: 3 });
  });

  // Two fingers that overlap in time are one cohort however their lifts interleave.
  it('holds overlapping contacts in one cohort and numbers the next one', () => {
    const { cohorts, lines, advance } = harness();
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    cohorts.packet(
      packet(
        'start',
        [
          { identifier: 'a', samples: 1 },
          { identifier: 'b', samples: 1 },
        ],
        ['b']
      )
    );
    cohorts.packet(packet('end', [{ identifier: 'a', samples: 1 }]));
    cohorts.drained([]);
    cohorts.packet(packet('end', [{ identifier: 'b', samples: 1 }]));
    cohorts.drained([stroke(2), stroke(7)]);
    cohorts.idle();
    advance(COHORT_SETTLE_MS);
    cohorts.packet(packet('start', [{ identifier: 'c', samples: 1 }]));
    cohorts.drained([stroke(1)]);
    cohorts.idle();
    advance(COHORT_SETTLE_MS);
    expect(
      lines.map(({ cohort, packets, strokes, points }) => [cohort, packets, strokes, points])
    ).toEqual([
      [1, 4, 2, 7],
      [2, 1, 1, 1],
    ]);
  });

  it('counts render work after the last lift toward the cohort until it settles', () => {
    const { cohorts, lines, advance } = harness();
    cohorts.inkCommit();
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    cohorts.surfaceCommit();
    cohorts.idle();
    advance(10);
    cohorts.inkCommit();
    cohorts.surfaceCommit();
    cohorts.timed('sceneRecord', 2);
    advance(COHORT_SETTLE_MS);
    cohorts.inkCommit();
    expect(lines[0]).toMatchObject({
      cohortMs: 0,
      inkLayoutEffectCommits: 1,
      surfaceLayoutEffectCommits: 2,
      sceneRecord: { n: 1, totalMs: 2, maxMs: 2 },
    });
  });

  // Negative control: writing at the next packet would log on the drawing path of the next stroke.
  it('closes a settling cohort at the next contact and writes both lines once that one settles', () => {
    const { cohorts, lines, advance } = harness();
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    cohorts.idle();
    advance(50);
    cohorts.packet(packet('start', [{ identifier: 'b', samples: 2 }]));
    cohorts.inkCommit();
    advance(COHORT_SETTLE_MS);
    expect(lines).toEqual([]);
    cohorts.idle();
    advance(COHORT_SETTLE_MS);
    expect(
      lines.map(({ cohort, samples, inkLayoutEffectCommits }) => [
        cohort,
        samples,
        inkLayoutEffectCommits,
      ])
    ).toEqual([
      [1, 1, 0],
      [2, 2, 1],
    ]);
  });

  it('times each recording and keeps its count, total and slowest', () => {
    const { cohorts, lines, advance } = harness();
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    for (const ms of [1.234, 3.5, 0.25]) cohorts.timed('liveFlush', ms);
    cohorts.timed('sceneRecord', 0.5);
    cohorts.idle();
    advance(COHORT_SETTLE_MS);
    expect(lines[0].liveFlush).toEqual({ n: 3, totalMs: 4.98, maxMs: 3.5 });
    expect(lines[0].sceneRecord).toEqual({ n: 1, totalMs: 0.5, maxMs: 0.5 });
  });

  // Negative controls: measuring each hand-off from its newest sample in place of its oldest, or
  // timing the first dot at the latest hand-off instead of the first, fails here.
  it('measures each submitted picture from the newest and the oldest sample it carries', () => {
    const { cohorts, lines, clock, advance } = harness();
    clock.at = 1000;
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    cohorts.stroke(990);
    cohorts.flushed();
    advance(4);
    cohorts.submitted();
    cohorts.submitted();
    for (const [sample, appended] of [
      [996, true],
      [1000, true],
      [1002, false],
    ]) {
      cohorts.sampleTime(sample);
      cohorts.append(appended ? 'appended' : 'duplicate');
    }
    cohorts.flushed();
    advance(16);
    cohorts.submitted();
    cohorts.idle();
    advance(COHORT_SETTLE_MS);
    expect(lines[0].inputToSubmission).toEqual({
      n: 2,
      p50Ms: 14,
      p95Ms: 20,
      maxMs: 20,
      minMs: 14,
    });
    expect(lines[0].oldestToSubmission).toEqual({
      n: 2,
      p50Ms: 14,
      p95Ms: 24,
      maxMs: 24,
      minMs: 14,
    });
    expect(lines[0].firstDotMs).toBe(14);
  });

  // A picture built before the next flush, as a rebuild is, lacks the samples taken since the last
  // one; they are measured at the hand-off that carries them. Negative control: counting every
  // sample taken at any hand-off reads 8 ms here and then nothing for the hand-off that carried it.
  it('measures a sample at the first hand-off after a flush records it', () => {
    const { cohorts, lines, clock, advance } = harness();
    clock.at = 100;
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    cohorts.stroke(100);
    cohorts.flushed();
    cohorts.submitted();
    cohorts.sampleTime(108);
    cohorts.append('appended');
    advance(16);
    cohorts.submitted();
    advance(14);
    cohorts.flushed();
    advance(5);
    cohorts.submitted();
    cohorts.idle();
    advance(COHORT_SETTLE_MS);
    expect(lines[0].inputToSubmission).toEqual({
      n: 2,
      p50Ms: 0,
      p95Ms: 27,
      maxMs: 27,
      minMs: 0,
    });
    expect(lines[0].handoffs).toBe(3);
  });

  // Negative control: counting a hand-off made after the last lift adds one more hand-off and a
  // gap across the settle, which is not ink cadence.
  it('counts hand-offs while a contact is held and the gaps between them', () => {
    const { cohorts, lines, clock, advance } = harness();
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    cohorts.stroke(clock.at);
    cohorts.flushed();
    for (const gap of [0, 8, 16]) {
      advance(gap);
      cohorts.submitted();
    }
    cohorts.idle();
    advance(COHORT_SETTLE_MS - 1);
    cohorts.submitted();
    advance(1);
    expect(lines[0]).toMatchObject({
      handoffs: 3,
      submissionGap: { n: 2, p50Ms: 8, p95Ms: 16, maxMs: 16, minMs: 8 },
      firstDotMs: 0,
    });
  });

  it('reports nearest-rank percentiles over every submission', () => {
    const { cohorts, lines, clock, advance } = harness();
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    for (let interval = 1; interval <= 20; interval += 1) {
      cohorts.stroke(clock.at - interval);
      cohorts.flushed();
      cohorts.submitted();
    }
    cohorts.idle();
    advance(COHORT_SETTLE_MS);
    expect(lines[0].inputToSubmission).toEqual({
      n: 20,
      p50Ms: 10,
      p95Ms: 19,
      maxMs: 20,
      minMs: 1,
    });
  });

  it('starts each cohort without an earlier cohort’s unsubmitted sample', () => {
    const { cohorts, lines, advance } = harness();
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    cohorts.stroke(-100);
    cohorts.sampleTime(-90);
    cohorts.append('appended');
    cohorts.flushed();
    cohorts.sampleTime(-80);
    cohorts.append('appended');
    cohorts.idle();
    advance(COHORT_SETTLE_MS);
    cohorts.packet(packet('start', [{ identifier: 'b', samples: 1 }]));
    cohorts.submitted();
    cohorts.idle();
    advance(COHORT_SETTLE_MS);
    expect(lines.map(({ inputToSubmission }) => inputToSubmission.n)).toEqual([0, 0]);
  });

  it('records nothing while no cohort is open and omits a missing build', () => {
    const { cohorts, lines, advance } = harness({ platform: 'android', clockJoin: CLOCK_JOIN });
    cohorts.idle();
    cohorts.append('appended');
    cohorts.drained([stroke(4)]);
    cohorts.timed('liveFlush', 9);
    cohorts.inkCommit();
    cohorts.surfaceCommit();
    advance(COHORT_SETTLE_MS);
    expect(lines).toEqual([]);
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    cohorts.idle();
    advance(COHORT_SETTLE_MS);
    expect(lines[0]).not.toHaveProperty('build');
    expect(lines[0]).toMatchObject({ platform: 'android', strokes: 0, appended: 0 });
  });

  // Negative controls: attributing the first gap instead of the longest reads 8 ms and no
  // collection; counting from the cohort's opening instead of the gap's start counts every packet.
  it('attributes the longest gap between hand-offs to the packets, warnings and collections in it', () => {
    const { cohorts, lines, clock, advance } = harness();
    clock.gc = { count: 4, ms: 30 };
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    cohorts.submitted();
    advance(8);
    cohorts.packet(packet('move', [{ identifier: 'a', samples: 1 }]));
    cohorts.submitted();
    advance(2);
    cohorts.memoryWarning();
    clock.gc = { count: 5, ms: 170 };
    advance(138);
    for (let packets = 0; packets < 3; packets += 1)
      cohorts.packet(packet('move', [{ identifier: 'a', samples: 1 }]));
    cohorts.submitted();
    advance(8);
    cohorts.packet(packet('end', [{ identifier: 'a', samples: 1 }]));
    cohorts.submitted();
    cohorts.idle();
    clock.gc = { count: 6, ms: 171 };
    advance(COHORT_SETTLE_MS);
    expect(lines[0]).toMatchObject({
      handoffs: 4,
      submissionGap: { n: 3, maxMs: 140 },
      longestGap: { ms: 140, atMs: 8, packets: 3, memoryWarnings: 1, gcs: 1, gcMs: 140 },
      memoryWarnings: 1,
      gc: { n: 2, ms: 141 },
    });
  });

  it('reports no collections where the runtime does not count them', () => {
    const { cohorts, lines, clock, advance } = harness();
    clock.gc = null;
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    cohorts.submitted();
    advance(10);
    cohorts.submitted();
    cohorts.idle();
    advance(COHORT_SETTLE_MS);
    expect(lines[0]).toMatchObject({
      gc: null,
      longestGap: { ms: 10, atMs: 0, packets: 0, memoryWarnings: 0, gcs: null, gcMs: null },
    });
  });

  // Negative control: measuring a packet's lag from its oldest sample reads the second as 14 ms.
  it('measures packet arrival gaps and the lag from each packet’s newest sample', () => {
    const { cohorts, lines, clock, advance } = harness();
    clock.at = 10;
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    advance(4);
    cohorts.packet(packet('move', [{ identifier: 'a', samples: 5 }]));
    advance(30);
    cohorts.packet(packet('end', [{ identifier: 'a', samples: 1 }], []));
    cohorts.idle();
    advance(COHORT_SETTLE_MS);
    expect(lines[0]).toMatchObject({
      packetGap: { n: 2, p50Ms: 4, p95Ms: 30, maxMs: 30, minMs: 4 },
      receiptLag: { n: 2, p50Ms: 10, p95Ms: 10, maxMs: 10, minMs: 10 },
    });
  });
});
