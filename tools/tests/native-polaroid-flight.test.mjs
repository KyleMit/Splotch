import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  CSS_EASE,
  DISCARD_FADE_MS,
  FLASH_MS,
  POLAROID_Z_INDEX,
  POLAROID_FADE_KEYFRAMES,
  POLAROID_FADE_MS,
  POLAROID_FLASH_KEYFRAMES,
  POLAROID_FRAME,
  POLAROID_SHOW_KEYFRAMES,
} from '../../experiments/native-architecture/src/rsdDrawing/polaroidFlight.ts';
import {
  keyframeTimeline,
  keyframeValue,
} from '../../experiments/native-architecture/src/rsdDrawing/keyframeMotion.ts';
import { POLAROID_FLIGHT_MS } from '../../web/src/lib/drawing/screenshotTiming.ts';
import { polaroidCssSize } from '../../web/src/lib/drawing/polaroidGeometry.ts';
import { scale, zIndex } from '../../web/src/lib/design/tokens.ts';

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
const css = read('web/src/app.css').replace(/\/\*[\s\S]*?\*\//g, '');
const native = read('experiments/native-architecture/src/rsdDrawing/RsdPolaroidFlight.tsx');

// The body of the first block whose prelude is `prelude`, braces balanced.
function block(prelude, source = css) {
  const start = source.indexOf(`${prelude} {`);
  expect(start, prelude).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = source.indexOf('{', start); index < source.length; index++) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(source.indexOf('{', start) + 1, index);
  }
  throw new Error(`Unclosed ${prelude}`);
}

function declaration(body, property) {
  return body
    .match(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`))?.[1]
    .replace(/\s+/g, ' ')
    .trim();
}

function bezier(value) {
  if (value === 'linear') return [0, 0, 1, 1];
  if (value === 'ease-out') return [0, 0, 0.58, 1];
  if (value === 'ease') return [0.25, 0.1, 0.25, 1];
  return value
    .match(/cubic-bezier\(([^)]+)\)/)[1]
    .split(',')
    .map(Number);
}

// A translate term: the button offset's multiple, or 0 at the center.
function fromMultiple(term) {
  if (term === '0') return 0;
  if (term.startsWith('var(--from-')) return 1;
  return Number(term.match(/\*\s*([\d.]+)\)$/)[1]);
}

function transform(value) {
  if (!value) return { from: 0, scale: 1, rotate: 0 };
  const translate = value.match(/translate3d\((calc\([^)]*\)\)|[^,]+),\s*(calc\([^)]*\)\)|[^,]+),/);
  const from = translate ? fromMultiple(translate[1].trim()) : 0;
  if (translate) expect(fromMultiple(translate[2].trim())).toBe(from);
  return {
    from,
    scale: Number(value.match(/scale\(([^)]+)\)/)?.[1] ?? 1),
    rotate: Number(value.match(/rotate\((-?[\d.]+)deg\)/)?.[1] ?? 0),
  };
}

// Each keyframe offset of an @keyframes rule, with the declarations its block sets.
function keyframes(name, source = css) {
  const body = block(`@keyframes ${name}`, source);
  return [...body.matchAll(/([\d%,\s]+)\{([^}]*)\}/g)].flatMap(([, offsets, declarations]) =>
    offsets
      .split(',')
      .map((offset) => offset.trim())
      .filter(Boolean)
      .map((offset) => ({ at: Number(offset.replace('%', '')) / 100, declarations }))
  );
}

const resting = {
  from: 0,
  scale: 1,
  rotate: 0,
  opacity: Number(declaration(block('.polaroid-frame'), 'opacity')),
};

describe('the native save polaroid against app.css', () => {
  it('flies the polaroid-show keyframes, offsets, curves and duration', () => {
    const frame = block('.polaroid-frame');
    expect(declaration(frame, 'animation')).toBe('polaroid-show 1.9s linear forwards');
    expect(POLAROID_FLIGHT_MS).toBe(1900);
    const shipping = keyframes('polaroid-show').map(({ at, declarations }) => ({
      at,
      ...transform(declaration(declarations, 'transform')),
      opacity: Number(declaration(declarations, 'opacity')),
      easing: declaration(declarations, 'animation-timing-function'),
    }));
    expect(POLAROID_SHOW_KEYFRAMES.map(({ easing: _easing, ...keyframe }) => keyframe)).toEqual(
      shipping.map(({ easing: _easing, ...keyframe }) => keyframe)
    );
    for (const [index, keyframe] of POLAROID_SHOW_KEYFRAMES.slice(0, -1).entries())
      expect(keyframe.easing, `${keyframe.at}`).toEqual(bezier(shipping[index].easing));
  });

  it('fades the Reduce Motion polaroid-fade keyframes between the frame resting style', () => {
    expect(declaration(block('.polaroid-frame[data-start-reduced-motion]'), 'animation-name')).toBe(
      'polaroid-fade'
    );
    expect(
      declaration(block('.polaroid-frame[data-start-reduced-motion]'), 'animation-duration')
    ).toBe(`${POLAROID_FADE_MS / 1000}s`);
    const inner = keyframes('polaroid-fade').map(({ at, declarations }) => ({
      at,
      ...transform(declaration(declarations, 'transform')),
      opacity: Number(declaration(declarations, 'opacity')),
      easing: bezier('linear'),
    }));
    expect(POLAROID_FADE_KEYFRAMES).toEqual([
      { at: 0, ...resting, easing: bezier('linear') },
      ...inner,
      { at: 1, ...resting, easing: bezier('linear') },
    ]);
  });

  it('flashes the polaroid-flash keyframes for --duration-slow, and drops the flash under Reduce Motion', () => {
    const flash = block('.polaroid-flash');
    expect(declaration(flash, 'animation')).toBe(
      'polaroid-flash var(--duration-slow) ease-out forwards'
    );
    const base = Number(declaration(flash, 'opacity'));
    const peaks = keyframes('polaroid-flash').map(({ at, declarations }) => ({
      at,
      opacity: Number(declaration(declarations, 'opacity')),
      easing: bezier('ease-out'),
    }));
    expect(POLAROID_FLASH_KEYFRAMES).toEqual([
      { at: 0, opacity: base, easing: bezier('ease-out') },
      ...peaks,
      { at: 1, opacity: base, easing: bezier('ease-out') },
    ]);
    expect(declaration(block('.polaroid-flash[data-start-reduced-motion]'), 'animation')).toBe(
      'none'
    );
    expect(FLASH_MS).toBe(seconds(scale.durationSlow));
    expect(native).toMatch(/calm\s*\?\s*null/);
  });

  it('frames the picture on the polaroid paper with the app.css padding, corners and shadow', () => {
    const frame = block('.polaroid-frame');
    expect(declaration(frame, 'padding')).toBe(
      `${POLAROID_FRAME.paddingTopPx}px ${POLAROID_FRAME.paddingInlinePx}px ${POLAROID_FRAME.paddingBottomPx}px`
    );
    expect(declaration(frame, 'border-radius')).toBe(`${POLAROID_FRAME.radiusPx}px`);
    expect(declaration(frame, 'background')).toBe('var(--polaroid-paper)');
    const rgba = (shadow) =>
      shadow.replace(
        /rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/g,
        (_, r, g, b, alpha) => `rgba(${r}, ${g}, ${b}, ${Number(alpha) / 100})`
      );
    expect(rgba(declaration(frame, 'box-shadow'))).toBe(POLAROID_FRAME.shadow);
    const image = block('.polaroid-image');
    expect(declaration(image, 'border-radius')).toBe(
      `${native.match(/const IMAGE_RADIUS_PX = (\d+);/)[1]}px`
    );
    expect(declaration(image, 'background')).toBe('var(--polaroid-paper)');
    expect(declaration(block('.polaroid-overlay'), 'z-index')).toBe('var(--z-polaroid)');
    expect(POLAROID_Z_INDEX).toBe(zIndex.zPolaroid);
    expect(native).toContain('zIndex: POLAROID_Z_INDEX');
    expect(native).toContain('backgroundColor: DRAWING_POLAROID.paper');
    expect(native).toContain('backgroundColor: fixedColors.polaroidPaper');
  });

  it('fades a failed save out over --duration-base with the CSS ease', () => {
    expect(declaration(block('.polaroid-overlay.polaroid-discarded'), 'transition')).toBe(
      'opacity var(--duration-base) ease'
    );
    expect(CSS_EASE).toEqual(bezier('ease'));
    expect(DISCARD_FADE_MS).toBe(seconds(scale.durationBase));
  });

  it('sizes the polaroid by the shipping rule the shipping flight uses', () => {
    expect(read('web/src/lib/drawing/polaroidAnimation.ts')).toContain('polaroidCssSize(');
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

describe('the native flyout shell against app.css', () => {
  it("uses shipping's complete transform and opacity keyframe tracks", async () => {
    const { FLYOUT_ENTER_MS, FLYOUT_ENTER_POSE_KEYFRAMES, FLYOUT_ENTER_FADE_KEYFRAMES } =
      await import('../../experiments/native-architecture/src/rsdDrawing/flyoutKeyframes.ts');
    expect(declaration(block('.flyout-menu'), 'animation')).toBe(
      `flyout-shell ${FLYOUT_ENTER_MS}ms linear both`
    );
    const frames = keyframes('flyout-shell');
    const pose = frames
      .filter(({ declarations }) => declaration(declarations, 'transform'))
      .map(({ at, declarations }) => ({
        at,
        scale: transform(declaration(declarations, 'transform')).scale,
        easing: bezier(declaration(declarations, 'animation-timing-function') ?? 'linear'),
      }));
    expect(
      FLYOUT_ENTER_POSE_KEYFRAMES.map(({ at, scale, easing }) => ({ at, scale, easing }))
    ).toEqual(pose);
    const opacity = frames
      .filter(({ declarations }) => declaration(declarations, 'opacity') !== undefined)
      .map(({ at, declarations }) => ({
        at,
        opacity: Number(declaration(declarations, 'opacity')),
        easing: bezier(declaration(declarations, 'animation-timing-function') ?? 'linear'),
      }));
    expect(FLYOUT_ENTER_FADE_KEYFRAMES).toEqual(opacity);
    const offsetPx = Number(
      declaration(block('.flyout-menu'), '--flyout-from-y').replace('px', '')
    );
    expect(FLYOUT_ENTER_POSE_KEYFRAMES.map(({ offsetPx }) => offsetPx)).toEqual([offsetPx, 0, 0]);
  });
});

it("uses shipping's drawer cascade start pose and fixed tool slots", () => {
  const drawer = read('experiments/native-architecture/src/rsdDrawing/RsdDrawerCascade.tsx');
  const pose = declaration(block('@keyframes btn-cascade'), 'transform');
  const x = Number(/translateX\((-?[\d.]+)px\)/.exec(pose)[1]);
  const size = transform(pose).scale;
  expect(drawer).toContain(`const DRAWER_CASCADE_FROM_X_PX = ${x};`);
  expect(drawer).toContain(`const DRAWER_CASCADE_FROM_SCALE = ${size};`);
  const panel = read('experiments/native-architecture/src/rsdDrawing/RsdDrawerTools.tsx');
  const names = {
    brush: 'BrushControl',
    stroke: 'StrokeControl',
    camera: 'ScreenshotButton',
    ai: 'AiImageButton',
    undo: 'UndoButton',
  };
  for (const [key, name] of Object.entries(names)) {
    const source = read(`web/src/lib/components/${name}.svelte`);
    const [, index] = /style:--i=["{](\d+)/.exec(source);
    expect(panel).toMatch(new RegExp(`${key}: ${index}(?:[, }])`));
  }
});

it("deals flyout options on shipping's offsets, curve and stagger", async () => {
  const {
    FLYOUT_OPTION_KEYFRAMES,
    FLYOUT_OPTION_ENTER_MS,
    FLYOUT_OPTION_DELAY_MS,
    FLYOUT_OPTION_STAGGER_MS,
  } = await import('../../experiments/native-architecture/src/rsdDrawing/flyoutKeyframes.ts');
  const frames = keyframes('flyout-option').map(({ at, declarations }) => {
    const pose = declaration(declarations, 'transform');
    return {
      at,
      y: Number(/translateY\((-?[\d.]+)px\)/.exec(pose)?.[1] ?? 0),
      rotate: Number(/rotate\((-?[\d.]+)deg\)/.exec(pose)?.[1] ?? 0),
      opacity: Number(declaration(declarations, 'opacity') ?? 1),
      easing: bezier(declaration(declarations, 'animation-timing-function') ?? 'linear'),
    };
  });
  expect(FLYOUT_OPTION_KEYFRAMES).toEqual(frames);
  const options = block('.flyout-menu > button');
  expect(declaration(options, 'animation')).toBe(
    `flyout-option ${FLYOUT_OPTION_ENTER_MS}ms linear backwards`
  );
  expect(declaration(options, 'animation-delay')).toBe(
    `calc(${FLYOUT_OPTION_DELAY_MS}ms + var(--i) * var(--stagger))`
  );
  expect(declaration(block('.flyout-menu'), '--stagger')).toBe(`${FLYOUT_OPTION_STAGGER_MS}ms`);
});

it("squashes the camera through shipping's exact capture keyframes", async () => {
  const { CAMERA_CAPTURE_MS, CAMERA_CAPTURE_KEYFRAMES } =
    await import('../../experiments/native-architecture/src/rsdDrawing/cameraKeyframes.ts');
  expect(declaration(block(".screenshot-capture-feedback [data-icon='camera']"), 'animation')).toBe(
    `screenshot-capture ${CAMERA_CAPTURE_MS}ms linear`
  );
  const frames = keyframes('screenshot-capture').map(({ at, declarations }) => ({
    at,
    scale: transform(declaration(declarations, 'transform')).scale,
    rotate: transform(declaration(declarations, 'transform')).rotate,
    easing: bezier(declaration(declarations, 'animation-timing-function') ?? 'linear'),
  }));
  expect(CAMERA_CAPTURE_KEYFRAMES).toEqual(frames);
  const feedback = read('web/src/lib/drawing/screenshotFeedback.ts');
  expect(feedback).toMatch(
    /stampMotionAtStart\(button\);\s*button\.classList\.add\(CAPTURE_FEEDBACK_CLASS\)/
  );
  expect(read('web/src/lib/platform/reducedMotion.ts')).toContain(
    'node.toggleAttribute(START_REDUCED_MOTION_ATTRIBUTE, prefersReducedMotion());'
  );
});

it("blooms paint rings on shipping's independent scale and opacity clocks", async () => {
  const motion =
    await import('../../experiments/native-architecture/src/rsdDrawing/swatchKeyframes.ts');
  const source = read('web/src/lib/components/ColorSwatch.svelte');
  const glide = bezier(scale.easeGlide);
  const ring = (name, field) =>
    keyframes(name, source)
      .filter(
        ({ declarations }) =>
          declaration(declarations, field === 'scale' ? 'transform' : 'opacity') !== undefined
      )
      .map(({ at, declarations }) => ({
        at,
        [field]:
          field === 'scale'
            ? transform(declaration(declarations, 'transform')).scale
            : Number(declaration(declarations, 'opacity')),
        easing: glide,
      }));
  expect(motion.SWATCH_BLOOM_SCALE_KEYFRAMES).toEqual(ring('swatch-ring-expand', 'scale'));
  expect(motion.SWATCH_BLOOM_FADE_KEYFRAMES).toEqual(ring('swatch-ring-expand', 'opacity'));
  expect(motion.SWATCH_TRAIL_SCALE_KEYFRAMES).toEqual(ring('swatch-ring-trail', 'scale'));
  expect(motion.SWATCH_TRAIL_FADE_KEYFRAMES).toEqual(ring('swatch-ring-trail', 'opacity'));
  expect(
    declaration(
      block('.color-swatch.ring-animate:not(.gradient-swatch)::before', source),
      'animation'
    )
  ).toBe(`swatch-ring-expand ${motion.SWATCH_BLOOM_MS}ms var(--ease-glide) forwards`);
  expect(
    declaration(
      block('.color-swatch.ring-animate:not(.gradient-swatch)::after', source),
      'animation'
    )
  ).toBe(
    `swatch-ring-trail ${motion.SWATCH_BLOOM_TRAIL_MS}ms ${motion.SWATCH_BLOOM_TRAIL_DELAY_MS}ms var(--ease-glide) forwards`
  );
  const trailWidth =
    /\.color-swatch:not\(\.gradient-swatch\)::after\s*\{\s*border-width:\s*([\d.]+)px;/.exec(
      source
    );
  expect(Number(trailWidth?.[1])).toBe(motion.SWATCH_BLOOM_TRAIL_WIDTH_PX);
});

it("keeps the landscape-phone flyout entrance on shipping's horizontal axis", () => {
  const prelude = '@media (orientation: landscape) and (max-height: 599.98px)';
  const phone = [
    ...css.matchAll(/@media \(orientation: landscape\) and \(max-height: 599\.98px\)/g),
  ]
    .map(({ index }) => block(prelude, css.slice(index)))
    .find((body) => body.includes('.actions-panel .flyout-menu {'));
  expect(phone).toBeDefined();
  const menu = block('.actions-panel .flyout-menu', phone);
  expect(declaration(menu, 'transform-origin')).toBe('0 100%');
  expect(declaration(menu, '--flyout-from-x')).toBe('-6px');
  expect(declaration(menu, '--flyout-from-y')).toBe('0px');
  const panel = read('experiments/native-architecture/src/rsdDrawing/RsdActionsPanel.tsx');
  expect(panel).toContain("portrait: layout.mode !== 'row'");
  expect(panel).toContain("originX: layout.mode === 'row' ? layout.size / 2 : 0");
});

it('resumes the camera keyframe clock at its elapsed phase without replaying the beginning', async () => {
  const { CAMERA_CAPTURE_MS, CAMERA_CAPTURE_KEYFRAMES } =
    await import('../../experiments/native-architecture/src/rsdDrawing/cameraKeyframes.ts');
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
