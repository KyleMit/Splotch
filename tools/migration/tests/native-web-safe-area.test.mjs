import { describe, expect, it } from 'vitest';
import { supportedOrientations } from '../../../web/src/lib/safeAreaMatrix/deviceProfile.ts';
import { DEVICE_PROFILES } from '../../../web/src/lib/safeAreaMatrix/devices.ts';
import { appliedInsets, diagnose } from '../../../web/src/lib/safeAreaMatrix/diagnostics.ts';
import {
  dialogProblems,
  galleryIndex,
  safeAreaScenarios,
  scenarioProblems,
} from '../check-native-web-safe-area.mjs';

const scenarios = safeAreaScenarios();
const byId = (id, orientation) =>
  scenarios.find((scenario) => scenario.profile.id === id && scenario.orientation === orientation);

// A read of the drawing screen that obeys every rule for the scenario: the insets resolved, each
// control centred in the claimable region, the expected bands painted at their insets' depth.
function obedientRead(scenario) {
  const viewport = { width: scenario.width, height: scenario.height };
  const { insets } = scenario;
  const centre = {
    x: insets.left + (viewport.width - insets.left - insets.right) / 2 - 10,
    y: insets.top + (viewport.height - insets.top - insets.bottom) / 2 - 10,
    width: 20,
    height: 20,
  };
  return {
    env: { ...insets },
    viewport,
    boxes: Object.fromEntries(scenario.controls.map(({ name }) => [name, centre])),
    fullscreenToggles: scenario.fullscreenToggle ? 1 : 0,
    overflow: { x: 0, y: 0 },
    bands: Object.fromEntries(
      ['top', 'left', 'right'].map((edge) => [
        edge,
        scenario.bandEdges.includes(edge) ? [insets[edge]] : [],
      ])
    ),
  };
}

describe('safe-area scenarios', () => {
  it('cover every profile in every orientation it offers', () => {
    const expected = DEVICE_PROFILES.flatMap((profile) =>
      supportedOrientations(profile).map((orientation) => `${profile.id} ${orientation}`)
    );
    expect(scenarios.map(({ profile, orientation }) => `${profile.id} ${orientation}`)).toEqual(
      expected
    );
  });

  it("expect the app's applied insets, whole-pixel, and diagnose()'s band", () => {
    for (const { profile, orientation, insets, bandEdges } of scenarios) {
      const applied = appliedInsets(profile, orientation);
      for (const edge of ['top', 'right', 'bottom', 'left'])
        expect(insets[edge]).toBe(Math.round(applied[edge]));
      expect(bandEdges).toEqual(diagnose(profile, orientation).bandEdges);
    }
  });

  it('expect the color button only on a landscape phone, the palette elsewhere', () => {
    const control = (scenario) =>
      scenario.controls.find(({ name }) => name === 'color button' || name === 'palette').name;
    expect(control(byId('iphone-island-59', 'landscape-left'))).toBe('color button');
    expect(control(byId('iphone-island-59', 'portrait'))).toBe('palette');
    expect(control(byId('ipad-home-indicator', 'landscape-left'))).toBe('palette');
  });

  it('expect the fullscreen toggle only in an Android browser tab', () => {
    for (const scenario of scenarios)
      expect(scenario.fullscreenToggle).toBe(
        scenario.profile.platform === 'android' && scenario.profile.surface === 'browser'
      );
  });
});

describe('scenarioProblems', () => {
  const scenario = byId('android-native-punch-gesture', 'landscape-left');

  it('passes a drawing screen that obeys every rule', () => {
    for (const each of scenarios) expect(scenarioProblems(each, obedientRead(each))).toEqual([]);
  });

  it.each([
    [
      'an inset that never reached the app',
      (read) => ({ ...read, env: { ...read.env, left: 0 } }),
      'env(safe-area-inset-left) is 0, not 38',
    ],
    [
      'a control that stopped rendering',
      (read) => ({ ...read, boxes: { ...read.boxes, 'settings button': null } }),
      'the settings button is missing',
    ],
    [
      'a control under the cutout',
      (read) => ({
        ...read,
        boxes: { ...read.boxes, 'drawer toggle': { x: 4, y: 100, width: 20, height: 20 } },
      }),
      "the drawer toggle's tap point (14, 110) is outside the claimable region",
    ],
    [
      'a fullscreen toggle outside an Android browser',
      (read) => ({ ...read, fullscreenToggles: 1 }),
      '1 fullscreen toggles, not 0',
    ],
    [
      'a page that scrolls',
      (read) => ({ ...read, overflow: { x: 0, y: 12 } }),
      'the page scrolls by 0×12',
    ],
    [
      'the cutout edge left unpainted',
      (read) => ({ ...read, bands: { ...read.bands, left: [] } }),
      'the left band is unpainted',
    ],
    [
      'the band on the far edge',
      (read) => ({ ...read, bands: { ...read.bands, right: [38] } }),
      'the right band is painted',
    ],
    [
      'a band short of its inset',
      (read) => ({ ...read, bands: { ...read.bands, left: [30] } }),
      'the left band is 30 px deep, not 38',
    ],
  ])('names %s', (_case, mutate, problem) => {
    expect(scenarioProblems(scenario, mutate(obedientRead(scenario)))).toEqual([problem]);
  });
});

describe('dialogProblems', () => {
  const scenario = byId('iphone-island-59', 'landscape-left');
  const viewport = { width: scenario.width, height: scenario.height };
  const { left, right } = scenario.insets;

  it('passes a card between the side insets', () => {
    const card = { x: left, y: 20, width: viewport.width - left - right, height: 300 };
    expect(dialogProblems(scenario, viewport, card)).toEqual([]);
  });

  it('names a card that reaches into either side inset, or no card at all', () => {
    expect(dialogProblems(scenario, viewport, { x: 0, y: 20, width: 400, height: 300 })).toEqual([
      "the coloring picker's card starts at 0, inside the left inset",
    ]);
    expect(
      dialogProblems(scenario, viewport, {
        x: 400,
        y: 20,
        width: viewport.width - 400,
        height: 300,
      })
    ).toEqual([`the coloring picker's card ends at ${viewport.width}, inside the right inset`]);
    expect(dialogProblems(scenario, viewport, null)).toEqual(['the coloring picker shows no card']);
  });
});

describe('galleryIndex', () => {
  it('shows every scenario under its profile and stays out of search', () => {
    const html = galleryIndex(scenarios);
    expect(html).toContain('<meta name="robots" content="noindex">');
    for (const { profile, orientation } of scenarios)
      expect(html).toContain(`src="${profile.id}-${orientation}.png"`);
    for (const profile of DEVICE_PROFILES)
      expect(html).toContain(profile.label.replace('&', '&amp;'));
  });
});
