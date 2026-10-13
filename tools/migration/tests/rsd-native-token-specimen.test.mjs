import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { scale, themes } from '../../../web/src/lib/design/tokens.ts';
import { resolvedStyles, TokenSpecimen } from './rsd-token-specimen.mjs';

let root, host;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(
        'div',
        null,
        ['light', 'dark'].map((mode) => createElement(TokenSpecimen, { key: mode, mode }))
      )
    )
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  resolvedStyles.clear();
});

const style = (testID) => {
  const resolved = resolvedStyles.get(testID);
  expect(resolved, testID).toBeDefined();
  return resolved;
};

const rgba = (value) =>
  value.replace(
    /rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/g,
    (_, red, green, blue, alpha) => `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 100})`
  );

it.each(['light', 'dark'])(
  'resolves every %s color swatch to the shipping value through the released native renderer',
  (mode) => {
    const swatches = [...resolvedStyles.keys()].filter((id) => id.startsWith(`${mode}-color-`));
    expect(swatches.length).toBeGreaterThan(0);
    for (const id of swatches) {
      const key = id.slice(`${mode}-color-`.length);
      expect(style(id).backgroundColor, id).toBe(rgba(themes[mode][key]));
    }
  }
);

it.each(['light', 'dark'])('resolves the %s shadows, radii and type scale natively', (mode) => {
  expect(style(`${mode}-shadowControl`).boxShadow).toBe(rgba(scale.shadowControl));
  expect(style(`${mode}-shadowPop`).boxShadow).toBe(rgba(scale.shadowPop));
  expect(style(`${mode}-floatShadow`).boxShadow).toBe(rgba(themes[mode].floatShadow));
  expect(style(`${mode}-radiusMd`).borderRadius).toBe(Number.parseFloat(scale.radiusMd));
  expect(style(`${mode}-radiusBlob1`).borderTopLeftRadius).toMatch(/^\d+(?:\.\d+)?%$/);
  expect(style(`${mode}-fontSizeXl`).fontSize).toBe(Number.parseFloat(scale.fontSizeXl));
  expect(style(`${mode}-gradient`).experimental_backgroundImage).toBe(scale.clearGradientRest);
  expect(style(`${mode}-fixed-scrimPill`).backgroundColor).toBe(rgba(scale.scrimPill));
  expect(style(`${mode}-control`).opacity).toBe(Number(scale.disabledOpacity));
});
