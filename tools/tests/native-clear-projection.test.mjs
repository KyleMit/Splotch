import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACCEPT_ZONE_HIDE_DELAY_MS,
  CLEAR_SHEET_CORNER_PULL,
  CLEAR_SHEET_CURVE,
  CLEAR_SHEET_DURATION_MS,
  CLEAR_SHEET_END_SCALE,
  CLEAR_SHEET_END_TURN_DEG,
  COACHMARK_AUTO_DISMISS_MS,
  COACHMARK_LOOP_MS,
  FLOOD_COMMITTED_OPACITY,
  FLOOD_RELEASE_MS,
  GHOST_TRAVEL_OVERSHOOT,
  HOLD_DURATION_MS,
  MOVEMENT_THRESHOLD_PX,
  MULTI_CLICK_THRESHOLD,
  MULTI_CLICK_WINDOW_MS,
  RETURN_HOME_MS,
  WASH_REACH_DIAGONAL_FRACTION,
} from '../../experiments/native-architecture/src/clear/dragToClear.ts';
import {
  CLEAR_DOCK_LANDSCAPE_TOP_FLOOR_PX,
  CLEAR_DOCK_LANDSCAPE_TOP_MARGIN_PX,
  CLEAR_DOCK_OVERHANG_PX,
  CLEAR_DOCK_PORTRAIT_TOP_PX,
  CLEAR_DOCK_SIZE_PX,
  CLEAR_ICON_SIZE_PX,
} from '../../experiments/native-architecture/src/clear/clearDock.ts';
import { CLEAR_PAGE_TURN_GAIN } from '../../experiments/native-architecture/src/audio/pageTurnSound.ts';
import { WEB_IMPACT_MS } from '../../experiments/native-architecture/src/platform/clearHaptics.web.ts';

const root = join(import.meta.dirname, '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const shipping = {
  gesture: read('web/src/lib/actions/dragToClear.ts'),
  inkMotion: read('web/src/lib/drawing/inkMotion.ts'),
  appCss: read('web/src/app.css'),
  button: read('web/src/lib/components/ClearButton.svelte'),
  coachmark: read('web/src/lib/components/ClearCoachmark.svelte'),
  haptics: read('web/src/lib/platform/haptics.ts'),
  sound: read('web/src/lib/audio/clearSound.ts'),
};

// Every native literal and the shipping pattern that owns it; group 1 is the shipping value.
const PROJECTIONS = [
  ['gesture', 'HOLD_DURATION_MS', /const HOLD_DURATION_MS = ([\d.]+);/],
  ['gesture', 'MOVEMENT_THRESHOLD_PX', /const MOVEMENT_THRESHOLD_PX = ([\d.]+);/],
  ['gesture', 'MULTI_CLICK_WINDOW_MS', /const MULTI_CLICK_WINDOW_MS = ([\d.]+);/],
  ['gesture', 'MULTI_CLICK_THRESHOLD', /const MULTI_CLICK_THRESHOLD = ([\d.]+);/],
  ['gesture', 'ACCEPT_ZONE_HIDE_DELAY_MS', /const ACCEPT_ZONE_HIDE_DELAY_MS = ([\d.]+);/],
  ['gesture', 'WASH_REACH_DIAGONAL_FRACTION', /const WASH_REACH_DIAGONAL_FRACTION = ([\d.]+);/],
  ['inkMotion', 'CLEAR_SHEET_DURATION_MS', /const CLEAR_SHEET_DURATION_MS = ([\d.]+);/],
  ['inkMotion', 'CLEAR_SHEET_CORNER_PULL', /const CLEAR_SHEET_CORNER_PULL = ([\d.]+);/],
  ['appCss', 'CLEAR_SHEET_DURATION_MS', /animation: clear-sheet ([\d.]+)ms /],
  [
    'appCss',
    'CLEAR_SHEET_END_SCALE',
    /@keyframes clear-sheet \{[^@]*?to \{\s*transform: scale\(([\d.]+)\) rotate\([\d.]+deg\);/,
  ],
  [
    'appCss',
    'CLEAR_SHEET_END_TURN_DEG',
    /@keyframes clear-sheet \{[^@]*?to \{\s*transform: scale\([\d.]+\) rotate\(([\d.]+)deg\);/,
  ],
  ['button', 'RETURN_HOME_MS', /transition: transform ([\d.]+)ms var\(--ease-pop\);/],
  ['button', 'FLOOD_RELEASE_MS', /transition: opacity ([\d.]+)ms linear;/],
  [
    'button',
    'FLOOD_COMMITTED_OPACITY',
    /\.clear-preview:global\(\.committed\) \{\s*opacity: ([\d.]+);/,
  ],
  ['coachmark', 'COACHMARK_AUTO_DISMISS_MS', /const COACHMARK_AUTO_DISMISS_MS = ([\d.]+);/],
  ['coachmark', 'GHOST_TRAVEL_OVERSHOOT', /const GHOST_TRAVEL_OVERSHOOT = ([\d.]+);/],
];
const SECONDS_PROJECTIONS = [
  ['coachmark', 'COACHMARK_LOOP_MS', /animation: coachmarkDrag ([\d.]+)s /],
];
const native = {
  ACCEPT_ZONE_HIDE_DELAY_MS,
  CLEAR_SHEET_CORNER_PULL,
  CLEAR_SHEET_CURVE,
  CLEAR_SHEET_DURATION_MS,
  CLEAR_SHEET_END_SCALE,
  CLEAR_SHEET_END_TURN_DEG,
  COACHMARK_AUTO_DISMISS_MS,
  COACHMARK_LOOP_MS,
  FLOOD_COMMITTED_OPACITY,
  FLOOD_RELEASE_MS,
  GHOST_TRAVEL_OVERSHOOT,
  HOLD_DURATION_MS,
  MOVEMENT_THRESHOLD_PX,
  MULTI_CLICK_THRESHOLD,
  MULTI_CLICK_WINDOW_MS,
  RETURN_HOME_MS,
  WASH_REACH_DIAGONAL_FRACTION,
  CLEAR_PAGE_TURN_GAIN,
  WEB_IMPACT_MS,
};

function assertProjection(sources) {
  for (const [owner, name, pattern] of PROJECTIONS) {
    const match = pattern.exec(sources[owner]);
    assert.ok(match, `Missing shipping ${name} in ${owner}`);
    assert.equal(native[name], Number(match[1]), name);
  }
  for (const [owner, name, pattern] of SECONDS_PROJECTIONS) {
    const match = pattern.exec(sources[owner]);
    assert.ok(match, `Missing shipping ${name} in ${owner}`);
    assert.equal(native[name], Number(match[1]) * 1000, name);
  }
  const curve = /animation: clear-sheet [\d.]+ms cubic-bezier\(([^)]+)\)/.exec(sources.appCss);
  assert.ok(curve, 'Missing shipping clear-sheet curve');
  assert.deepEqual([...native.CLEAR_SHEET_CURVE], curve[1].split(',').map(Number));
  const impact = /const WEB_IMPACT_MS = ([\d.]+);/.exec(sources.haptics);
  assert.equal(native.WEB_IMPACT_MS, Number(impact?.[1]), 'WEB_IMPACT_MS');
  const gain = /const CLEAR_PAGE_TURN_GAIN = ([\d.]+);/.exec(sources.sound);
  assert.equal(native.CLEAR_PAGE_TURN_GAIN, Number(gain?.[1]), 'CLEAR_PAGE_TURN_GAIN');
}

// The shipping coachmark is a wordless mime hidden from assistive technology; the native one
// copies that, so any copy the shipping markup gains has to be ported deliberately.
function coachmarkCopy(source) {
  const markup = source.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
  assert.match(markup, /class="clear-coachmark"[^>]*aria-hidden="true"/);
  return markup
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const shippingClip = readFileSync(join(root, 'web/static/sounds/clear-page-turn.mp3'));
const nativeClip = readFileSync(
  join(root, 'experiments/native-architecture/src/audio/clear-page-turn.mp3')
);

describe('native drag-to-clear projections of the shipping gesture', () => {
  it('pins every reused gesture, motion, coachmark, haptic and gain literal', () => {
    expect(() => assertProjection(shipping)).not.toThrow();
  });

  it.each(PROJECTIONS.map(([owner, name, pattern]) => [name, owner, pattern]))(
    'rejects a changed shipping %s',
    (_name, owner, pattern) => {
      const changed = shipping[owner].replace(pattern, (match, value) =>
        match.replace(value, String(Number(value) + 1))
      );
      expect(changed).not.toBe(shipping[owner]);
      expect(() => assertProjection({ ...shipping, [owner]: changed })).toThrow();
    }
  );

  it('rejects a changed shipping page-turn curve, haptic or gain', () => {
    for (const [owner, from, to] of [
      ['appCss', 'cubic-bezier(0.32, 0.02, 0.42, 1)', 'cubic-bezier(0.3, 0.02, 0.42, 1)'],
      ['haptics', 'const WEB_IMPACT_MS = 15;', 'const WEB_IMPACT_MS = 20;'],
      ['sound', 'const CLEAR_PAGE_TURN_GAIN = 1;', 'const CLEAR_PAGE_TURN_GAIN = 0.5;'],
      ['coachmark', 'animation: coachmarkDrag 2.8s ', 'animation: coachmarkDrag 3s '],
    ]) {
      const changed = shipping[owner].replace(from, to);
      expect(changed, owner).not.toBe(shipping[owner]);
      expect(() => assertProjection({ ...shipping, [owner]: changed }), owner).toThrow();
    }
  });

  it('keeps the coachmark wordless and hidden from assistive technology like the shipping one', () => {
    expect(coachmarkCopy(shipping.coachmark)).toBe('');
    const worded = shipping.coachmark.replace(
      '<div class="coachmark-ghost"',
      '<p>Drag me to clear</p><div class="coachmark-ghost"'
    );
    expect(coachmarkCopy(worded)).toBe('Drag me to clear');
    const announced = shipping.coachmark.replace(
      'class="clear-coachmark" class:visible={tutorialVisible} aria-hidden="true"',
      'class="clear-coachmark" class:visible={tutorialVisible}'
    );
    expect(announced).not.toBe(shipping.coachmark);
    expect(() => coachmarkCopy(announced)).toThrow();
  });

  it('bundles the shipping page-turn clip byte for byte', () => {
    expect(digest(nativeClip)).toBe(digest(shippingClip));
    const changed = Buffer.from(nativeClip);
    changed[0] ^= 1;
    expect(digest(changed)).not.toBe(digest(shippingClip));
  });
});

// The docked tab, its finish per state and the accept ring's inks. The face and ring keep their
// values inside RSD styles and object literals, so those are read back from the native source.
const PORTRAIT_MEDIA = '@media (orientation: portrait)';
const nativeSource = {
  face: read('experiments/native-architecture/src/rsdDrawing/RsdClearFace.tsx'),
  ring: read('experiments/native-architecture/src/rsdDrawing/RsdClearRing.tsx'),
  control: read('experiments/native-architecture/src/rsdDrawing/RsdClearControl.tsx'),
};
const dockShipping = { ...shipping, ring: read('web/src/lib/components/ClearRing.svelte') };

function sectionOf(source, section) {
  if (!section) return source;
  const cut = source.indexOf(PORTRAIT_MEDIA);
  assert.ok(cut > 0, 'Missing the shipping portrait media block');
  return section === 'main' ? source.slice(0, cut) : source.slice(cut);
}

function nativeSourceValue(owner, pattern) {
  const match = pattern.exec(nativeSource[owner]);
  assert.ok(match, `Missing native ${pattern}`);
  return match[1];
}

// Shipping CSS colors in React Native's notation: the alarm channels substituted and slash-alpha
// rgb() turned into the rgba() form the native parser reads.
function nativeCss(value, alarm) {
  return value
    .replace(/var\(--alarm-rgb\)/g, alarm)
    .replace(
      /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)%\)/g,
      (_, red, green, blue, alpha) => `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 100})`
    )
    .replace(/rgb\((\d+) (\d+) (\d+)\)/g, 'rgb($1, $2, $3)');
}

const percent = (match, group) => Number(match[group]) / 100;
const ACCEPT_ZONE =
  /\.clear-accept-zone \{\s*position: fixed;[^}]*color: rgb\(var\(--alarm-rgb\) \/ (\d+)%\);\s*background: radial-gradient\(\s*circle,\s*rgb\(var\(--alarm-rgb\) \/ 0%\) (\d+)%,\s*rgb\(var\(--alarm-rgb\) \/ (\d+)%\) 100%/;
const THRESHOLD_ZONE =
  /\.clear-accept-zone:global\(\.threshold-reached\) \{\s*color: rgb\(var\(--alarm-rgb\) \/ (\d+)%\);[^}]*?background: radial-gradient\(\s*circle,\s*rgb\(var\(--alarm-rgb\) \/ 0%\) (\d+)%,\s*rgb\(var\(--alarm-rgb\) \/ (\d+)%\) 100%/;
const ringInk = (key) =>
  new RegExp(
    `${key}: \\{ rgb: ALARM_RGB, strokeOpacity: ([\\d.]+), washOpacity: ([\\d.]+), washFrom: ([\\d.]+),`
  );
const native3 = (owner, pattern) => {
  const match = pattern.exec(nativeSource[owner]);
  assert.ok(match, `Missing native ${pattern}`);
  return match.slice(1, 4).map(Number);
};

// [name, shipping owner, section, shipping pattern, shipping value from its match, native value]
const DOCK_PROJECTIONS = [
  [
    'overhang',
    'button',
    'main',
    /\.clear-container \{[^}]*right: calc\(-(\d+)px \+ var\(--safe-area-right\)\);/,
    (match) => Number(match[1]),
    () => CLEAR_DOCK_OVERHANG_PX,
  ],
  [
    'lid margin',
    'button',
    'main',
    /:global\(\.clear-icon\) \{[^}]*margin-right: (\d+)px;/,
    (match) => Number(match[1]),
    () => CLEAR_DOCK_OVERHANG_PX,
  ],
  [
    'landscape top floor',
    'button',
    'main',
    /top: max\((\d+)px, calc\(\d+px \+ var\(--safe-area-top\)\)\);/,
    (match) => Number(match[1]),
    () => CLEAR_DOCK_LANDSCAPE_TOP_FLOOR_PX,
  ],
  [
    'landscape top margin',
    'button',
    'main',
    /top: max\(\d+px, calc\((\d+)px \+ var\(--safe-area-top\)\)\);/,
    (match) => Number(match[1]),
    () => CLEAR_DOCK_LANDSCAPE_TOP_MARGIN_PX,
  ],
  [
    'landscape size',
    'button',
    'main',
    /\.clear-button \{\s*position: relative;\s*width: (\d+)px;\s*height: \1px;/,
    (match) => Number(match[1]),
    () => CLEAR_DOCK_SIZE_PX.landscape,
  ],
  [
    'landscape icon',
    'button',
    'main',
    /:global\(\.clear-icon\) \{\s*width: (\d+)px;\s*height: \1px;/,
    (match) => Number(match[1]),
    () => CLEAR_ICON_SIZE_PX.landscape,
  ],
  [
    'portrait top',
    'button',
    'portrait',
    /\.clear-container \{\s*top: calc\((\d+)px \+ var\(--safe-area-top\)\);/,
    (match) => Number(match[1]),
    () => CLEAR_DOCK_PORTRAIT_TOP_PX,
  ],
  [
    'portrait size',
    'button',
    'portrait',
    /\.clear-button \{\s*width: (\d+)px;\s*height: \1px;/,
    (match) => Number(match[1]),
    () => CLEAR_DOCK_SIZE_PX.portrait,
  ],
  [
    'portrait icon',
    'button',
    'portrait',
    /:global\(\.clear-icon\) \{\s*width: (\d+)px;\s*height: \1px;/,
    (match) => Number(match[1]),
    () => CLEAR_ICON_SIZE_PX.portrait,
  ],
  [
    'delete-ready scale',
    'button',
    'main',
    /\.clear-button:global\(\.delete-ready\) \{[^}]*transform: scale\(([\d.]+)\);/,
    (match) => Number(match[1]),
    () => Number(nativeSourceValue('control', /const DELETE_READY_SCALE = ([\d.]+);/)),
  ],
  [
    'lift-off squash',
    'button',
    'main',
    /@keyframes clear-lift-off \{\s*50% \{\s*transform: scale\(([\d.]+), [\d.]+\);/,
    (match) => Math.round((Number(match[1]) - 1) * 1000) / 1000,
    () => Number(nativeSourceValue('control', /const LIFT_SQUASH = ([\d.]+);/)),
  ],
  [
    'docked shadow',
    'button',
    'main',
    /\.clear-button \{\s*position: relative;[^}]*box-shadow: ([^;]+);/,
    (match, alarm) => nativeCss(match[1], alarm),
    () => nativeSourceValue('face', /dockedFinish: \{[^}]*boxShadow: '([^']+)'/),
  ],
  [
    'lifted shadow',
    'button',
    'main',
    /\.clear-button:global\(\.dragging\) \{[^}]*box-shadow: ([^;]+);/,
    (match, alarm) => nativeCss(match[1], alarm),
    () => nativeSourceValue('face', /liftedFinish: \{[^}]*boxShadow: '([^']+)'/),
  ],
  [
    'delete-ready gradient',
    'button',
    'main',
    /\.clear-button:global\(\.delete-ready\) \{[^}]*background: ([^;]+);/,
    (match, alarm) => nativeCss(match[1], alarm),
    () => nativeSourceValue('face', /deleteReadyFinish: \{[^}]*backgroundImage: '([^']+)'/),
  ],
  [
    'delete-ready glow',
    'button',
    'main',
    /\.clear-button:global\(\.delete-ready\) \{[^}]*box-shadow: ([^;]+);/,
    (match, alarm) => nativeCss(match[1], alarm),
    () => nativeSourceValue('face', /deleteReadyFinish: \{[^}]*boxShadow: '([^']+)'/),
  ],
  [
    'coachmark ghost shadow',
    'coachmark',
    null,
    /\.coachmark-button \{[^}]*box-shadow: ([^;]+);/,
    (match, alarm) => nativeCss(match[1], alarm),
    () => nativeSourceValue('face', /ghostFinish: \{[^}]*boxShadow: '([^']+)'/),
  ],
  [
    'ring stroke width',
    'ring',
    null,
    /--ring-stroke-width: (\d+)px;/,
    (match) => Number(match[1]),
    () => Number(nativeSourceValue('ring', /const RING_STROKE_WIDTH_PX = (\d+);/)),
  ],
  [
    'alarm red',
    'button',
    null,
    /--alarm-rgb: (\d+ \d+ \d+);/,
    (match) => nativeCss(`rgb(${match[1]})`, ''),
    () => nativeSourceValue('ring', /const ALARM_RGB = '([^']+)';/),
  ],
  [
    'accept ring ink short of the threshold',
    'button',
    'main',
    ACCEPT_ZONE,
    (match) => [percent(match, 1), percent(match, 3), percent(match, 2)],
    () => native3('ring', ringInk('short')),
  ],
  [
    'accept ring ink past the threshold',
    'button',
    'main',
    THRESHOLD_ZONE,
    (match) => [percent(match, 1), percent(match, 3), percent(match, 2)],
    () => native3('ring', ringInk('reached')),
  ],
];

function assertDockProjection(sources) {
  const alarm = /--alarm-rgb: (\d+ \d+ \d+);/.exec(sources.button)?.[1];
  assert.ok(alarm, 'Missing shipping --alarm-rgb');
  for (const [name, owner, section, pattern, shippingValue, nativeValue] of DOCK_PROJECTIONS) {
    const match = pattern.exec(sectionOf(sources[owner], section));
    assert.ok(match, `Missing shipping ${name}`);
    assert.deepEqual(nativeValue(), shippingValue(match, alarm), name);
  }
  // CSS radial-gradient(circle, …) with no size keyword reaches 100% at the box's farthest corner,
  // which is the half-diagonal extent the native ring wash draws.
  assert.match(
    sources.button,
    /\.clear-accept-zone \{\s*position: fixed;[^}]*radial-gradient\(\s*circle,/
  );
  assert.match(nativeSource.ring, /const WASH_EXTENT_PERCENT = 50 \* Math\.SQRT2;/);
  for (const finish of ['dockedFinish', 'liftedFinish', 'ghostFinish'])
    assert.match(
      nativeSource.face,
      new RegExp(`${finish}: \\{\\s*backgroundImage: fixedColors\\.clearGradientRest,`),
      finish
    );
  assert.match(
    block(sources.button, '.clear-button {'),
    /background: var\(--clear-gradient-rest\);/
  );
  assert.match(
    block(sources.coachmark, '.coachmark-button {'),
    /background: var\(--clear-gradient-rest\);/
  );
}

function block(source, opener) {
  const start = source.indexOf(opener);
  assert.ok(start >= 0, `Missing shipping ${opener}`);
  return source.slice(start, source.indexOf('}', start));
}

// Rewrites the first capture of a shipping pattern inside its section, leaving the rest intact.
function changeShipping(sources, owner, section, pattern) {
  const source = sources[owner];
  const cut = section ? source.indexOf(PORTRAIT_MEDIA) : 0;
  const [from, to] =
    section === 'portrait' ? [cut, source.length] : [0, section ? cut : source.length];
  const match = new RegExp(pattern.source, 'd').exec(source.slice(from, to));
  const [start, end] = match.indices[1];
  const value = match[1];
  const changed = /^[\d.]+$/.test(value)
    ? String(Number(value) + 1)
    : value.replace(/\d/, (d) => String((Number(d) + 1) % 10));
  return {
    ...sources,
    [owner]: source.slice(0, from + start) + changed + source.slice(from + end),
  };
}

describe('native Clear Button dock, finish and accept ring projections of the shipping styles', () => {
  it('pins the docked tab geometry, every finish and both accept ring inks', () => {
    expect(() => assertDockProjection(dockShipping)).not.toThrow();
  });

  it.each(
    DOCK_PROJECTIONS.map(([name, owner, section, pattern]) => [name, owner, section, pattern])
  )('rejects a changed shipping %s', (_name, owner, section, pattern) => {
    const changed = changeShipping(dockShipping, owner, section, pattern);
    expect(changed[owner]).not.toBe(dockShipping[owner]);
    expect(() => assertDockProjection(changed)).toThrow();
  });

  it('rejects a shipping ring wash sized to the ring or a rest gradient no longer the token', () => {
    for (const [owner, from, to] of [
      [
        'button',
        'radial-gradient(\n      circle,\n      rgb(var(--alarm-rgb) / 0%) 55%',
        'radial-gradient(\n      circle closest-side,\n      rgb(var(--alarm-rgb) / 0%) 55%',
      ],
      ['button', 'background: var(--clear-gradient-rest);', 'background: #f00;'],
      ['coachmark', 'background: var(--clear-gradient-rest);', 'background: #f00;'],
    ]) {
      const changed = dockShipping[owner].replace(from, to);
      expect(changed, to).not.toBe(dockShipping[owner]);
      expect(() => assertDockProjection({ ...dockShipping, [owner]: changed }), to).toThrow();
    }
  });
});

// The Clear Button's one accessible name; its drag states announce nothing further in shipping.
const shippingClearLabel = (source) =>
  /<button\s+class="clear-button"\s+id="clearButton"\s+aria-label="([^"]+)"/.exec(source)?.[1];
const nativeClearLabel = (source) => /accessibilityLabel="([^"]+)"/.exec(source)?.[1];

describe('native Clear Button accessible name', () => {
  it('names the button exactly as the shipping Clear Button does', () => {
    expect(shippingClearLabel(shipping.button)).toBe('Clear drawing');
    expect(nativeClearLabel(nativeSource.control)).toBe(shippingClearLabel(shipping.button));
  });

  it('rejects a renamed shipping or native label', () => {
    const shippingRenamed = shipping.button.replace(
      'aria-label="Clear drawing"',
      'aria-label="Clear"'
    );
    expect(shippingRenamed).not.toBe(shipping.button);
    expect(nativeClearLabel(nativeSource.control)).not.toBe(shippingClearLabel(shippingRenamed));
    const nativeRenamed = nativeSource.control.replace(
      'accessibilityLabel="Clear drawing"',
      'accessibilityLabel="Clear"'
    );
    expect(nativeRenamed).not.toBe(nativeSource.control);
    expect(nativeClearLabel(nativeRenamed)).not.toBe(shippingClearLabel(shipping.button));
  });
});
