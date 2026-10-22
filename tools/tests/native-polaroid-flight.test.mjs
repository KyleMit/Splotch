import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  CSS_EASE,
  DISCARD_FADE_MS,
  FLASH_MS,
  POLAROID_FADE_KEYFRAMES,
  POLAROID_FADE_MS,
  POLAROID_FLASH_KEYFRAMES,
  POLAROID_FRAME,
  POLAROID_Z_INDEX,
  POLAROID_SHOW_KEYFRAMES,
} from '../../src/rsdDrawing/polaroidFlight.ts';
import { keyframeTimeline, keyframeValue } from '../../src/rsdDrawing/keyframeMotion.ts';
import { POLAROID_FLIGHT_MS } from '../../src/lib/drawing/screenshotTiming.ts';
import { polaroidCssSize } from '../../src/lib/drawing/polaroidGeometry.ts';
import { scale, zIndex } from '../../src/lib/design/tokens.ts';

// A recording Animated: a timing is returned as data for the test to read, and each curve squares
// its input and remembers the control points it was built from.
const curves = vi.hoisted(() => []);
vi.mock('react-native', () => ({
  Animated: { timing: (value, config) => ({ value, ...config }) },
  Easing: {
    bezier: (...points) => {
      curves.push(points);
      return (time) => time * time;
    },
  },
}));

const MS_PER_SECOND = 1000;
const seconds = (token) => Number.parseFloat(token) * MS_PER_SECOND;
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const native = read('src/rsdDrawing/RsdPolaroidFlight.tsx');

function bezier(value) {
  if (value === 'linear') return [0, 0, 1, 1];
  if (value === 'ease-out') return [0, 0, 0.58, 1];
  if (value === 'ease') return [0.25, 0.1, 0.25, 1];
  return value
    .match(/cubic-bezier\(([^)]+)\)/)[1]
    .split(',')
    .map(Number);
}

describe('the native save polaroid against app.css', () => {
  it('flies the polaroid-show keyframes, offsets, curves and duration', () => {
    expect(POLAROID_FLIGHT_MS).toBe(1900);
    expect(
      POLAROID_SHOW_KEYFRAMES.map((frame) => [
        frame.at,
        frame.from,
        frame.scale,
        frame.rotate,
        frame.opacity,
      ])
    ).toEqual([
      [0, 1, 0.12, -16, 0],
      [0.07, 1.04, 0.14, -18, 0.55],
      [0.28, 0, 1.05, -6.5, 1],
      [0.36, 0, 0.995, -2.8, 1],
      [0.44, 0, 1.008, -4.6, 1],
      [0.52, 0, 1, -4, 1],
      [0.78, 0, 1, -4, 1],
      [1, 1, 0.12, -16, 0],
    ]);
    expect(POLAROID_SHOW_KEYFRAMES.slice(0, -1).map((frame) => frame.easing)).toEqual([
      [0.4, 0, 0.6, 1],
      [0.16, 1, 0.3, 1],
      [0.45, 0, 0.55, 1],
      [0.45, 0, 0.55, 1],
      [0.33, 1, 0.68, 1],
      [0.22, 1, 0.36, 1],
      [0.22, 1, 0.36, 1],
    ]);
  });

  it('flashes the polaroid-flash keyframes for --duration-slow, and drops the flash under Reduce Motion', () => {
    expect(
      POLAROID_FLASH_KEYFRAMES.map((frame) => [frame.at, frame.opacity, frame.easing])
    ).toEqual([
      [0, 0, [0, 0, 0.58, 1]],
      [0.15, 0.85, [0, 0, 0.58, 1]],
      [1, 0, [0, 0, 0.58, 1]],
    ]);
    expect(FLASH_MS).toBe(seconds(scale.durationSlow));
    expect(native).toMatch(/calm\s*\?\s*null/);
  });

  it('frames the picture on the polaroid paper with the app.css padding, corners and shadow', () => {
    expect(POLAROID_FRAME).toEqual({
      paddingTopPx: 16,
      paddingInlinePx: 16,
      paddingBottomPx: 64,
      radiusPx: 3,
      shadow:
        '0 14px 40px rgba(0, 0, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 0 0 1px rgba(0, 0, 0, 0.04)',
    });
    expect(Number(/const IMAGE_RADIUS_PX = (\d+);/.exec(native)[1])).toBe(1);
    expect(POLAROID_Z_INDEX).toBe(zIndex.zPolaroid);
    expect(native).toContain('zIndex: POLAROID_Z_INDEX');
    expect(native).toContain('backgroundColor: DRAWING_POLAROID.paper');
    expect(native).toContain('backgroundColor: fixedColors.polaroidPaper');
  });

  it('fades a failed save out over --duration-base with the CSS ease', () => {
    expect(CSS_EASE).toEqual(bezier('ease'));
    expect(DISCARD_FADE_MS).toBe(seconds(scale.durationBase));
  });

  it('sizes the polaroid by the shipping rule the shipping flight uses', () => {
    expect(native).toContain('polaroidCssSize(flight.paper, window)');
    expect(polaroidCssSize({ width: 1024, height: 768 }, { width: 390, height: 844 })).toEqual({
      width: 260,
      height: 195,
    });
    expect(polaroidCssSize({ width: 0, height: 768 }, { width: 390, height: 844 })).toBeNull();
  });
});

describe('the keyframe timeline', () => {
  it('runs the whole flight as one native-driven timing', () => {
    const progress = { interpolate: (config) => config };
    const timing = keyframeTimeline(progress, POLAROID_SHOW_KEYFRAMES, POLAROID_FLIGHT_MS);
    expect(timing).toMatchObject({
      value: progress,
      toValue: 1,
      duration: POLAROID_FLIGHT_MS,
      useNativeDriver: true,
    });
  });

  it('eases each keyframe gap under the curve its starting keyframe names', () => {
    curves.length = 0;
    const timing = keyframeTimeline({}, POLAROID_SHOW_KEYFRAMES, POLAROID_FLIGHT_MS);
    expect(curves).toEqual(POLAROID_SHOW_KEYFRAMES.slice(0, -1).map((keyframe) => keyframe.easing));
    for (const [index, keyframe] of POLAROID_SHOW_KEYFRAMES.slice(0, -1).entries()) {
      const next = POLAROID_SHOW_KEYFRAMES[index + 1];
      expect(timing.easing(keyframe.at)).toBeCloseTo(keyframe.at);
      expect(timing.easing((keyframe.at + next.at) / 2)).toBeCloseTo(
        keyframe.at + (next.at - keyframe.at) / 4
      );
    }
    expect(timing.easing(1)).toBe(1);
  });

  it('interpolates each property linearly across the keyframe offsets', () => {
    const progress = { interpolate: (config) => config };
    expect(keyframeValue(progress, POLAROID_SHOW_KEYFRAMES, (keyframe) => keyframe.scale)).toEqual({
      inputRange: POLAROID_SHOW_KEYFRAMES.map((keyframe) => keyframe.at),
      outputRange: POLAROID_SHOW_KEYFRAMES.map((keyframe) => keyframe.scale),
      extrapolate: 'clamp',
    });
  });
});
it('keeps drawer tools in fixed cascade slots', () => {
  const panel = read('src/rsdDrawing/RsdDrawerTools.tsx');
  for (const [key, index] of Object.entries({ brush: 0, stroke: 1, camera: 3, ai: 4, undo: 5 }))
    expect(panel).toMatch(new RegExp(key + ': ' + index + '(?:[, }])'));
});

it("keeps the landscape-phone flyout entrance on shipping's horizontal axis", () => {
  const panel = read('src/rsdDrawing/RsdActionsPanel.tsx');
  expect(panel).toContain("portrait: layout.mode !== 'row'");
  expect(panel).toContain("originX: layout.mode === 'row' ? layout.size / 2 : 0");
});

it('resumes the camera keyframe clock at its elapsed phase without replaying the beginning', async () => {
  const { CAMERA_CAPTURE_MS, CAMERA_CAPTURE_KEYFRAMES } =
    await import('../../src/rsdDrawing/cameraKeyframes.ts');
  const value = { setValue: vi.fn() };
  const full = keyframeTimeline({}, CAMERA_CAPTURE_KEYFRAMES, CAMERA_CAPTURE_MS);
  const elapsed = CAMERA_CAPTURE_MS / 2;
  const resumed = keyframeTimeline(value, CAMERA_CAPTURE_KEYFRAMES, CAMERA_CAPTURE_MS, 0, elapsed);
  const from = full.easing(elapsed / CAMERA_CAPTURE_MS);
  expect(value.setValue).toHaveBeenCalledExactlyOnceWith(from);
  expect(resumed.duration).toBe(CAMERA_CAPTURE_MS - elapsed);
  for (const phase of [0, 0.2, 0.6, 1]) {
    expect(from + (1 - from) * resumed.easing(phase)).toBeCloseTo(full.easing(0.5 + 0.5 * phase));
  }
});

it("fades the removed ink through shipping's scale, drift, duration and curve", async () => {
  const {
    UNDO_GHOST_AA_PAD_PX,
    UNDO_GHOST_MS,
    UNDO_GHOST_SCALE,
    UNDO_GHOST_DRIFT_FRACTION,
    UNDO_GHOST_EASE,
  } = await import('../../src/drawing/undoGhostGeometry.ts');
  expect({
    pad: UNDO_GHOST_AA_PAD_PX,
    ms: UNDO_GHOST_MS,
    scale: UNDO_GHOST_SCALE,
    drift: UNDO_GHOST_DRIFT_FRACTION,
  }).toEqual({ pad: 2, ms: 420, scale: 0.72, drift: 0.28 });
  expect(UNDO_GHOST_EASE).toEqual(bezier(scale.easeGlide));
});

it('pins page art arrivals and retirement release to shipping DrawingCanvas', async () => {
  const art = await import('../../src/drawing/pageArtKeyframes.ts');
  expect(art.PAGE_ART_ENTER_MS).toBe(seconds(scale.durationSlow));
  expect(art.PAGE_ART_CALM_MS).toBe(seconds(scale.durationBase));
  expect(art.PAGE_ART_CALM_EASE).toEqual(bezier('ease'));
  expect(
    art.PAGE_ART_FADE_KEYFRAMES.map((frame) => [frame.at, frame.opacity, frame.easing])
  ).toEqual([
    [0, 0, [0.22, 1, 0.36, 1]],
    [0.55, 1, [0.22, 1, 0.36, 1]],
    [1, 1, [0.22, 1, 0.36, 1]],
  ]);
  expect(
    art.PAGE_ART_SCALE_KEYFRAMES.map((frame) => [frame.at, frame.scale, frame.easing])
  ).toEqual([
    [0, 1.025, [0.22, 1, 0.36, 1]],
    [1, 1, [0.22, 1, 0.36, 1]],
  ]);
});

it('fades the Reduce Motion polaroid-fade keyframes between the frame resting style', () => {
  expect(POLAROID_FADE_MS).toBe(700);
  expect(
    POLAROID_FADE_KEYFRAMES.map((frame) => [
      frame.at,
      frame.from,
      frame.scale,
      frame.rotate,
      frame.opacity,
      frame.easing,
    ])
  ).toEqual([
    [0, 0, 1, 0, 0, [0, 0, 1, 1]],
    [0.15, 0, 1, -4, 1, [0, 0, 1, 1]],
    [0.7, 0, 1, -4, 1, [0, 0, 1, 1]],
    [1, 0, 1, 0, 0, [0, 0, 1, 1]],
  ]);
});
it("uses shipping's complete transform and opacity keyframe tracks", async () => {
  const { FLYOUT_ENTER_MS, FLYOUT_ENTER_POSE_KEYFRAMES, FLYOUT_ENTER_FADE_KEYFRAMES } =
    await import('../../src/rsdDrawing/flyoutKeyframes.ts');
  expect(FLYOUT_ENTER_MS).toBe(300);
  expect(FLYOUT_ENTER_POSE_KEYFRAMES.map((frame) => [frame.at, frame.scale, frame.easing])).toEqual(
    [
      [0, 0.9, [0.16, 1, 0.3, 1]],
      [0.72, 1.022, [0.33, 1, 0.68, 1]],
      [1, 1, [0, 0, 1, 1]],
    ]
  );
  expect(FLYOUT_ENTER_POSE_KEYFRAMES.map((frame) => frame.offsetPx)).toEqual([6, 0, 0]);
  expect(
    FLYOUT_ENTER_FADE_KEYFRAMES.map((frame) => [frame.at, frame.opacity, frame.easing])
  ).toEqual([
    [0, 0, [0.16, 1, 0.3, 1]],
    [0.52, 1, [0, 0, 1, 1]],
    [1, 1, [0, 0, 1, 1]],
  ]);
});
it("deals flyout options on shipping's offsets, curve and stagger", async () => {
  const {
    FLYOUT_OPTION_KEYFRAMES,
    FLYOUT_OPTION_ENTER_MS,
    FLYOUT_OPTION_DELAY_MS,
    FLYOUT_OPTION_STAGGER_MS,
  } = await import('../../src/rsdDrawing/flyoutKeyframes.ts');
  expect([FLYOUT_OPTION_ENTER_MS, FLYOUT_OPTION_DELAY_MS, FLYOUT_OPTION_STAGGER_MS]).toEqual([
    260, 40, 25,
  ]);
  expect(
    FLYOUT_OPTION_KEYFRAMES.map((frame) => [
      frame.at,
      frame.y,
      frame.rotate,
      frame.opacity,
      frame.easing,
    ])
  ).toEqual([
    [0, 11, -5, 0, [0.16, 1, 0.3, 1]],
    [0.58, -2, 1.6, 1, [0.45, 0, 0.55, 1]],
    [0.82, 0.5, -0.6, 1, [0.33, 1, 0.68, 1]],
    [1, 0, 0, 1, [0, 0, 1, 1]],
  ]);
});
it("squashes the camera through shipping's exact capture keyframes", async () => {
  const { CAMERA_CAPTURE_MS, CAMERA_CAPTURE_KEYFRAMES } =
    await import('../../src/rsdDrawing/cameraKeyframes.ts');
  expect(CAMERA_CAPTURE_MS).toBe(460);
  expect(
    CAMERA_CAPTURE_KEYFRAMES.map((frame) => [frame.at, frame.scale, frame.rotate, frame.easing])
  ).toEqual([
    [0, 1, 0, [0.16, 1, 0.3, 1]],
    [0.28, 1.14, -6, [0.45, 0, 0.55, 1]],
    [0.58, 0.985, 1.6, [0.45, 0, 0.55, 1]],
    [0.8, 1.012, -0.6, [0.33, 1, 0.68, 1]],
    [1, 1, 0, [0, 0, 1, 1]],
  ]);
});
it("blooms paint rings on shipping's independent scale and opacity clocks", async () => {
  const motion = await import('../../src/rsdDrawing/swatchKeyframes.ts');
  expect([
    motion.SWATCH_BLOOM_MS,
    motion.SWATCH_BLOOM_TRAIL_MS,
    motion.SWATCH_BLOOM_TRAIL_DELAY_MS,
    motion.SWATCH_BLOOM_TRAIL_WIDTH_PX,
  ]).toEqual([620, 700, 90, 3]);
  expect(
    motion.SWATCH_BLOOM_SCALE_KEYFRAMES.map((frame) => [frame.at, frame.scale, frame.easing])
  ).toEqual([
    [0, 0.34, [0.22, 1, 0.36, 1]],
    [1, 1.16, [0.22, 1, 0.36, 1]],
  ]);
  expect(
    motion.SWATCH_BLOOM_FADE_KEYFRAMES.map((frame) => [frame.at, frame.opacity, frame.easing])
  ).toEqual([
    [0, 0, [0.22, 1, 0.36, 1]],
    [0.26, 0.95, [0.22, 1, 0.36, 1]],
    [1, 0, [0.22, 1, 0.36, 1]],
  ]);
  expect(
    motion.SWATCH_TRAIL_SCALE_KEYFRAMES.map((frame) => [frame.at, frame.scale, frame.easing])
  ).toEqual([
    [0, 0.5, [0.22, 1, 0.36, 1]],
    [1, 1.34, [0.22, 1, 0.36, 1]],
  ]);
  expect(
    motion.SWATCH_TRAIL_FADE_KEYFRAMES.map((frame) => [frame.at, frame.opacity, frame.easing])
  ).toEqual([
    [0, 0, [0.22, 1, 0.36, 1]],
    [0.34, 0.4, [0.22, 1, 0.36, 1]],
    [1, 0, [0.22, 1, 0.36, 1]],
  ]);
});
it("winds Undo through shipping's exact anticipation, turns, curves and duration", async () => {
  const { UNDO_SPIN_MS, UNDO_SPIN_KEYFRAMES } =
    await import('../../src/rsdDrawing/undoKeyframes.ts');
  expect(UNDO_SPIN_MS).toBe(470);
  expect(UNDO_SPIN_KEYFRAMES.map((frame) => [frame.at, frame.rotate, frame.easing])).toEqual([
    [0, 0, [0.3, 0.8, 0.4, 1]],
    [0.11, 24, [0.45, 0.02, 0.36, 1]],
    [0.76, -334, [0.25, 0.7, 0.3, 1]],
    [0.9, -357, [0, 0, 1, 1]],
    [1, -360, [0, 0, 1, 1]],
  ]);
});
