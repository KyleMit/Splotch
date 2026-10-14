import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { expect, it } from 'vitest';
import { records, root, mount } from './rsd-native-selection-host.mjs';
import { flat } from './rsd-native-toolbar-fixture.mjs';
import { PaperTexture } from '../../../experiments/native-architecture/src/drawing/PaperTexture.tsx';

const REPOSITORY = join(import.meta.dirname, '../../..');
const read = (path) => readFileSync(join(REPOSITORY, path), 'utf8');

// Every shipping surface that paints the grain (paperTexture.test.ts's consumers).
const PAPER_SITES = [
  'web/src/lib/components/DrawingCanvas.svelte',
  'web/src/lib/components/BareToolbarPaper.svelte',
  'web/src/lib/components/GlassPanes.svelte',
  'web/src/app.css',
];

// Shipping's paper rules size no background, so a CSS tile spans the image's own pixels in CSS
// pixels. Natively a repeating image tiles in device pixels, a third of that on a 3x phone.
// Negative control: a grain laid out at the paper's own size, unscaled, fails at every density
// above 1.
it.each([1, 2, 3, 3.5])(
  'tiles the paper grain one image pixel per point on a %sx screen, as shipping does per CSS pixel',
  async (density) => {
    for (const site of PAPER_SITES) {
      const rules = read(site)
        .split('}')
        .filter((rule) => rule.includes('var(--paper-texture)'));
      expect(rules.length, site).toBeGreaterThan(0);
      expect(
        rules.filter((rule) => rule.includes('background-size')),
        site
      ).toEqual([]);
    }
    records.dimensions = { width: 402, height: 874, scale: density, fontScale: 1 };
    records.props.length = 0;
    const element = createElement(PaperTexture);
    if (!root) await mount(element);
    else await act(async () => root.render(element));
    const grain = flat(records.props.findLast((props) => props.testID === 'paper-grain').style);
    expect(grain).toMatchObject({ transform: [{ scale: density }], transformOrigin: 'top left' });
    for (const extent of [grain.width, grain.height]) {
      const covered = Number.parseFloat(extent) * density;
      expect(covered).toBeGreaterThanOrEqual(100);
      expect(covered).toBeLessThan(100 + density / 100 + Number.EPSILON);
    }
    expect(
      flat(records.props.findLast((props) => props.testID === 'paper-texture').style)
    ).toMatchObject({ overflow: 'hidden' });
    records.dimensions = { width: 402, height: 874, scale: 1, fontScale: 1 };
  }
);
