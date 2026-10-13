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
