import { describe, expect, it } from 'vitest';
import {
  COHORT_SETTLE_MS,
  createPerfCohorts,
  PERF_LINE_VERSION,
  PERF_LOG_TAG,
} from '../../experiments/native-architecture/src/drawing/perfCohort.ts';
import {
  appendPoint,
  sampleOutcome,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const CLOCK_JOIN = { clock: 'mach_absolute_time', errorMs: 0 };

function harness(context = { platform: 'ios', build: 'abc1234', clockJoin: CLOCK_JOIN }) {
  const clock = { at: 0, timers: new Map(), nextTimer: 0 };
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
    (line) => lines.push(JSON.parse(line))
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
        draftRecord: { n: 0, totalMs: 0, maxMs: 0 },
        sceneRecord: { n: 0, totalMs: 0, maxMs: 0 },
        inputToSubmission: { n: 0 },
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
    for (const ms of [1.234, 3.5, 0.25]) cohorts.timed('draftRecord', ms);
    cohorts.timed('sceneRecord', 0.5);
    cohorts.idle();
    advance(COHORT_SETTLE_MS);
    expect(lines[0].draftRecord).toEqual({ n: 3, totalMs: 4.98, maxMs: 3.5 });
    expect(lines[0].sceneRecord).toEqual({ n: 1, totalMs: 0.5, maxMs: 0.5 });
  });

  it('measures each submitted picture from the newest sample it carries', () => {
    const { cohorts, lines, clock, advance } = harness();
    clock.at = 1000;
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    cohorts.stroke(990);
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
  });

  it('reports nearest-rank percentiles over every submission', () => {
    const { cohorts, lines, clock, advance } = harness();
    cohorts.packet(packet('start', [{ identifier: 'a', samples: 1 }]));
    for (let interval = 1; interval <= 20; interval += 1) {
      cohorts.stroke(clock.at - interval);
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
    cohorts.timed('draftRecord', 9);
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
});
