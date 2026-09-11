// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { summarizeActionGroup } from '../lib/action-stats.mjs';
import { DUAL_FRAME_STAMP_EPOCH } from '../lib/frame-stamps.mjs';

const ACTION_PROBE = readFileSync(join(ROOT, 'tools', 'perf', 'probes', 'action-probe.js'), 'utf8');

function visualEffectEvent(type, details) {
  const event = new Event(type, { bubbles: true });
  for (const [key, value] of Object.entries(details)) {
    Object.defineProperty(event, key, { value });
  }
  return event;
}

function installFrameClock() {
  let callbacks = [];
  vi.stubGlobal('requestAnimationFrame', (callback) => callbacks.push(callback));
  return () => {
    const pending = callbacks;
    callbacks = [];
    for (const callback of pending) callback(performance.now() + 0.01);
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  delete window.__actionProbe;
});

describe('action probe visual-effect attribution', () => {
  it('names a transitioning target and closes its effect when the target is removed', async () => {
    const tickFrame = installFrameClock();
    Function(ACTION_PROBE)();
    tickFrame();
    tickFrame();

    const chip = document.createElement('button');
    chip.id = 'active-page';
    chip.className = 'active-page-chip pressed';
    document.body.append(chip);

    window.__actionProbe.begin('clear page', '#active-page', ['click']);
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    chip.dispatchEvent(
      visualEffectEvent('transitionrun', {
        propertyName: 'transform',
        pseudoElement: '',
      })
    );
    tickFrame();
    tickFrame();
    chip.remove();
    await Promise.resolve();
    tickFrame();
    tickFrame();

    const sample = window.__actionProbe.finish();
    expect(sample.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'transitionrun',
          target: 'button#active-page.active-page-chip.pressed',
          property: 'transform',
        }),
        expect.objectContaining({
          type: 'dom-mutation',
          removed: ['button#active-page.active-page-chip.pressed'],
        }),
        expect.objectContaining({
          type: 'visual-effect-detached',
          target: 'button#active-page.active-page-chip.pressed',
          effects: ['transition:transform:'],
        }),
      ])
    );
    expect(sample.postActionFrames.map((frame) => frame.visualEffectsActive)).toEqual([
      true,
      false,
      false,
    ]);
  });
});

// A vsync grid the test owns on both clocks: each tick hands the pending rAF
// callbacks the next scheduled stamp, and `performance.now()` inside them
// answers that stamp plus however late the callback is said to have run.
// `vsyncs` advances the stamp by more than one period, as a skipped frame does.
function installVsyncClock({ intervalMs = 16.7 } = {}) {
  let callbacks = [];
  let vsync = 0;
  let now = 0;
  const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback) => callbacks.push(callback));
  return {
    nowSpy,
    tick(lateMs = 0, { vsyncs = 1 } = {}) {
      vsync += intervalMs * vsyncs;
      now = vsync + lateMs;
      const pending = callbacks;
      callbacks = [];
      nowSpy.mockClear();
      for (const callback of pending) callback(vsync);
      return nowSpy.mock.calls.length;
    },
    at(ms) {
      now = ms;
    },
  };
}

describe('action probe frame stamps (ADR-0163)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('declares the dual-channel epoch the scorer’s constant names', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    Function(ACTION_PROBE)();
    expect(window.__actionProbe.frameStampEpoch).toBe(DUAL_FRAME_STAMP_EPOCH);
  });

  it('records the scheduled stamp and the actual callback time for every frame, at one clock read each', () => {
    const clock = installVsyncClock();
    Function(ACTION_PROBE)();
    clock.tick();
    clock.tick();

    const button = document.createElement('button');
    button.id = 'night-mode';
    document.body.append(button);
    window.__actionProbe.begin('toggle', '#night-mode', ['click']);
    clock.at(33.4 + 2);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // The issue-1696 shape: one callback runs 20 ms after its vsync, the next
    // right behind it. The scheduled channel stays a clean grid throughout.
    const clockReadsPerFrame = [clock.tick(0), clock.tick(20), clock.tick(4), clock.tick(0)];
    expect(clockReadsPerFrame).toEqual([1, 1, 1, 1]);

    clock.at(150);
    const sample = window.__actionProbe.finish();
    expect(sample.frameStampEpoch).toBe(DUAL_FRAME_STAMP_EPOCH);
    // The first frame after the click (scheduled 50.1) is the first-frame
    // reading, and stays a scheduled-clock figure; it straddles the action, so
    // the post-action frames are the three that start after it.
    expect(sample.firstFrameMs).toBeCloseTo(50.1 - 35.4, 5);
    const frames = sample.postActionFrames;
    const closeTo = (values) => values.map((ms) => expect.closeTo(ms, 5));
    expect(frames.map((frame) => frame.gapMs)).toEqual(closeTo([16.7, 16.7, 16.7]));
    expect(frames.map((frame) => frame.endFromActionMs)).toEqual(
      closeTo([66.8 - 35.4, 83.5 - 35.4, 100.2 - 35.4])
    );
    expect(frames.map((frame) => frame.ranFromActionMs)).toEqual(
      closeTo([86.8 - 35.4, 87.5 - 35.4, 100.2 - 35.4])
    );
    expect(frames.map((frame) => frame.actualGapMs)).toEqual(closeTo([36.7, 0.7, 12.7]));
    // The boundary row is retained whichever side of the action it ran on;
    // this one ran on its stamp, before the click.
    expect(sample.lastPreActionFrame).toMatchObject({
      endFromActionMs: expect.closeTo(33.4 - 35.4, 5),
      ranFromActionMs: expect.closeTo(33.4 - 35.4, 5),
    });
  });
});

// Chrome's rAF-aligned input: the click is dispatched inside the frame task
// for the vsync at 66.8, after that vsync and before the frame's rAF callback,
// which runs at 71.8 still stamped 66.8. That frame renders the click, yet its
// stamp precedes the action. It follows a skipped vsync, so its scheduled gap
// (33.4) is one no scored frame carries.
function captureRafAlignedClick() {
  const clock = installVsyncClock();
  Function(ACTION_PROBE)();
  clock.tick();
  clock.tick();

  const button = document.createElement('button');
  button.id = 'night-mode';
  document.body.append(button);
  window.__actionProbe.begin('toggle', '#night-mode', ['click']);
  clock.at(70);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  clock.tick(5, { vsyncs: 2 });
  clock.tick();
  clock.tick();
  clock.tick();

  clock.at(150);
  return window.__actionProbe.finish();
}

function armToggle() {
  const button = document.createElement('button');
  button.id = 'night-mode';
  document.body.append(button);
  window.__actionProbe.begin('toggle', '#night-mode', ['click']);
  return () => button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('action probe onset rows (ADR-0163, issue 1713)', () => {
  afterEach(() => vi.restoreAllMocks());

  const closeTo = (values) => values.map((ms) => expect.closeTo(ms, 5));

  it('retains the frame stamped before the action and run after it, with both clocks', () => {
    const sample = captureRafAlignedClick();
    expect(sample.lastPreActionFrame).toEqual({
      gapMs: expect.closeTo(33.4, 5),
      startFromActionMs: expect.closeTo(33.4 - 70, 5),
      endFromActionMs: expect.closeTo(66.8 - 70, 5),
      visualEffectsActive: false,
      ranFromActionMs: expect.closeTo(71.8 - 70, 5),
      actualGapMs: expect.closeTo(71.8 - 33.4, 5),
    });
    expect(sample.firstActionFrame).toEqual({
      gapMs: expect.closeTo(16.7, 5),
      startFromActionMs: expect.closeTo(66.8 - 70, 5),
      endFromActionMs: expect.closeTo(83.5 - 70, 5),
      visualEffectsActive: false,
      ranFromActionMs: expect.closeTo(83.5 - 70, 5),
      actualGapMs: expect.closeTo(83.5 - 71.8, 5),
    });
    expect(sample.firstFrameMs).toBe(sample.firstActionFrame.endFromActionMs);
    for (const row of [sample.lastPreActionFrame, sample.firstActionFrame]) {
      expect(Object.keys(row)).toEqual(Object.keys(sample.postActionFrames[0]));
    }
    const roundTripped = JSON.parse(JSON.stringify(sample));
    expect(roundTripped.lastPreActionFrame).toEqual(sample.lastPreActionFrame);
    expect(roundTripped.firstActionFrame).toEqual(sample.firstActionFrame);
  });

  it('joins the onset rows to postActionFrames as one contiguous run on both clocks', () => {
    const sample = captureRafAlignedClick();
    const run = [sample.lastPreActionFrame, sample.firstActionFrame, ...sample.postActionFrames];
    for (let index = 1; index < run.length; index++) {
      const [previous, row] = [run[index - 1], run[index]];
      expect(row.startFromActionMs).toBeCloseTo(previous.endFromActionMs, 5);
      expect(row.ranFromActionMs - row.actualGapMs).toBeCloseTo(previous.ranFromActionMs, 5);
    }
  });

  it('leaves every per-action field and every scored figure as it was without the onset rows', () => {
    const sample = captureRafAlignedClick();

    // firstFrameMs reads the next vsync, exactly as it did before the rows were kept.
    expect(sample.firstFrameMs).toBeCloseTo(83.5 - 70, 5);
    expect(sample.frameGapsMs).toEqual(closeTo([16.7, 16.7, 16.7]));
    expect(sample.settleFrameGapsMs).toEqual([]);
    expect(sample.postActionFrameGapsMs).toEqual(closeTo([16.7, 16.7]));
    expect(sample.postActionFrames.map((frame) => frame.endFromActionMs)).toEqual(
      closeTo([100.2 - 70, 116.9 - 70])
    );
    expect(sample.topFrameGaps.map((frame) => frame.endFromActionMs).sort()).toEqual(
      closeTo([83.5 - 70, 100.2 - 70, 116.9 - 70])
    );

    const summary = summarizeActionGroup([sample], 'toggle');
    expect(summary.frames.max).toBeCloseTo(16.7, 5);
    expect(summary.frameStamps.frames).toBe(summary.frameSamples.scored);

    const { lastPreActionFrame: boundary, firstActionFrame: first, ...withoutOnsetRows } = sample;
    const absurd = (row) => ({
      ...row,
      gapMs: 1000,
      startFromActionMs: 0,
      endFromActionMs: 1000,
      visualEffectsActive: true,
      ranFromActionMs: 9999,
      actualGapMs: 1000,
    });
    expect(summarizeActionGroup([withoutOnsetRows], 'toggle')).toEqual(summary);
    expect(
      summarizeActionGroup(
        [{ ...sample, lastPreActionFrame: absurd(boundary), firstActionFrame: absurd(first) }],
        'toggle'
      )
    ).toEqual(summary);
  });

  it('records the boundary row as null, not omitted, when no frame preceded the action', () => {
    const clock = installVsyncClock();
    Function(ACTION_PROBE)();
    const click = armToggle();
    clock.at(5);
    click();
    clock.tick();
    clock.tick();
    clock.tick();

    clock.at(80);
    const sample = window.__actionProbe.finish();
    expect(sample.firstFrameMs).toBeCloseTo(33.4 - 5, 5);
    expect(sample).toHaveProperty('lastPreActionFrame', null);
    expect(JSON.parse(JSON.stringify(sample))).toHaveProperty('lastPreActionFrame', null);
    // The one overlap ADR-0163 names: with no row before it, the first frame's
    // scheduled start can fall after the action, which makes it a post-action frame too.
    expect(sample.firstActionFrame).toEqual(sample.postActionFrames[0]);
  });

  it('records the first action frame as null, not omitted, when no frame followed the action', () => {
    const clock = installVsyncClock();
    Function(ACTION_PROBE)();
    clock.tick();
    clock.tick();
    const click = armToggle();
    clock.at(40);
    click();

    clock.at(45);
    const sample = window.__actionProbe.finish();
    expect(sample.firstFrameMs).toBeNull();
    expect(sample.postActionFrames).toEqual([]);
    expect(sample.lastPreActionFrame.endFromActionMs).toBeCloseTo(33.4 - 40, 5);
    expect(sample).toHaveProperty('firstActionFrame', null);
    expect(JSON.parse(JSON.stringify(sample))).toHaveProperty('firstActionFrame', null);
  });

  // WebKit's whole-millisecond rAF stamp can equal actionAt. The strict `<`
  // files that frame as the first action frame, and a finish before the next
  // vsync leaves postActionFrames empty; both onset rows stay on record anyway.
  it('keeps both onset rows when a stamp ties the action and no post-action frame exists', () => {
    const clock = installVsyncClock({ intervalMs: 16 });
    Function(ACTION_PROBE)();
    clock.tick();
    clock.tick();
    const click = armToggle();
    clock.at(48);
    click();
    clock.tick();

    const sample = window.__actionProbe.finish();
    expect(sample.firstFrameMs).toBe(0);
    expect(sample.postActionFrames).toEqual([]);
    expect(sample.lastPreActionFrame).toMatchObject({ endFromActionMs: -16, ranFromActionMs: -16 });
    expect(sample.firstActionFrame).toMatchObject({ endFromActionMs: 0, ranFromActionMs: 0 });
  });
});

describe('action probe mutation attribution', () => {
  it('reports descriptor truncation without inspecting nodes beyond the cap', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    Function(ACTION_PROBE)();

    const target = document.createElement('button');
    target.id = 'open-coloring-books';
    document.body.append(target);
    window.__actionProbe.begin('open coloring books', '#open-coloring-books', ['click']);
    target.click();

    const noise = Array.from({ length: 20 }, (_, index) => {
      const node = document.createElement('div');
      node.className = `noise-${index}`;
      return node;
    });
    const dialog = document.createElement('dialog');
    dialog.id = 'coloring-book-dialog';
    Object.defineProperty(dialog, 'className', {
      get() {
        throw new Error('nodes beyond the descriptor cap must not be inspected');
      },
    });
    document.body.append(...noise, dialog);
    await Promise.resolve();

    const sample = window.__actionProbe.finish();
    const mutation = sample.activities.find((activity) => activity.addedTotal === 21);
    expect(mutation).toEqual(
      expect.objectContaining({
        type: 'dom-mutation',
        added: noise.slice(0, 8).map((node) => `div.${node.className}`),
        addedTotal: 21,
        addedTruncated: true,
      })
    );
    expect(mutation.added).not.toContain('dialog#coloring-book-dialog');
  });

  it('caps mutation details while preserving every activity timestamp', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    Function(ACTION_PROBE)();

    const target = document.createElement('button');
    target.id = 'open-settings';
    document.body.append(target);
    window.__actionProbe.begin('open Settings', '#open-settings', ['click']);
    target.click();

    for (let index = 0; index < 40; index++) {
      const node = document.createElement('div');
      node.className = `mutation-${index}`;
      document.body.append(node);
      await Promise.resolve();
    }

    const sample = window.__actionProbe.finish();
    const mutations = sample.activities.filter((activity) => activity.type === 'dom-mutation');
    expect(mutations).toHaveLength(40);
    expect(mutations.filter((activity) => activity.targets)).toHaveLength(32);
    expect(mutations[32]).toEqual(
      expect.objectContaining({ type: 'dom-mutation', detailsOmitted: true })
    );
    expect(Object.keys(mutations[33]).sort()).toEqual(['atFromActionMs', 'type']);
  });

  it('bounds homogeneous-node inspection and distinguishes deduplication from truncation', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    Function(ACTION_PROBE)();

    const target = document.createElement('button');
    target.id = 'open-coloring-books';
    document.body.append(target);
    window.__actionProbe.begin('open coloring books', '#open-coloring-books', ['click']);
    target.click();

    for (let index = 0; index < 50; index++) target.setAttribute('data-index', String(index));
    await Promise.resolve();

    let classNameInspections = 0;
    const tiles = Array.from({ length: 100 }, () => {
      const node = document.createElement('div');
      Object.defineProperty(node, 'className', {
        get() {
          classNameInspections++;
          return 'tile';
        },
      });
      return node;
    });
    document.body.append(...tiles);
    await Promise.resolve();

    const sample = window.__actionProbe.finish();
    const deduplicated = sample.activities.find((activity) => activity.targetsTotal === 50);
    expect(deduplicated).toEqual(
      expect.objectContaining({ targets: ['button#open-coloring-books'], targetsTotal: 50 })
    );
    expect(deduplicated).not.toHaveProperty('targetsTruncated');
    const truncated = sample.activities.find((activity) => activity.addedTotal === 100);
    expect(truncated).toEqual(
      expect.objectContaining({ added: ['div.tile'], addedTotal: 100, addedTruncated: true })
    );
    expect(classNameInspections).toBe(128);
  });
});
