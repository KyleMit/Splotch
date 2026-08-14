import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { AI_OUTPUT_FIXTURES, aiOutputFor } from '../../web/tests/artifacts/ai-output-fixtures.ts';
import { IMAGE_SIZES } from '../../web/src/lib/server/ai/imageSize.ts';
import { PAGE_INVENTORY_VIEWPORTS } from '../page-inventory/lib/page-inventory-report.mjs';

// The mocks that stand in for /api/generate-image answer with a committed
// picture, and nothing but the picture's own pixels keeps it usable: a fixture
// swapped for a re-render of the wrong shape, or a contact-sheet copy of itself,
// would still load, still be served, and still fail nothing — the result modal
// would just compose around a picture the product never hands it, which is the
// review distortion this index exists to prevent.
//
// So each one is held to the canvas the endpoint asks the image model for, read
// off IMAGE_SIZES rather than restated: the card takes its whole width from the
// picture's natural ratio (--result-aspect), so an off-contract aspect composes
// the card at a width no real response produces, and a picture below that size
// is never drawn up to fill the box the card projected for it.
const ENDPOINT_SIZES = Object.fromEntries(
  Object.entries(IMAGE_SIZES).map(([shape, size]) => [shape, size.split('x').map(Number)])
);

describe('AI output fixtures', () => {
  it.each(Object.entries(AI_OUTPUT_FIXTURES))(
    'ships the %s picture on the canvas the endpoint asks for',
    async (orientation, path) => {
      const [expectedWidth, expectedHeight] = ENDPOINT_SIZES[orientation];
      const { width, height } = await sharp(path).metadata();
      expect({ width, height }).toEqual({ width: expectedWidth, height: expectedHeight });
    }
  );

  // The other half of "large enough": the canvas each fixture is held to has to
  // cover the largest stage an inventory capture can ask for. The stage sits
  // inside the viewport with a gutter on both axes, so covering the longest side
  // any viewport has covers the box on both.
  it.each(Object.keys(AI_OUTPUT_FIXTURES))(
    'holds the %s picture to a canvas the largest inventory viewport cannot outgrow',
    (orientation) => {
      const longestViewportSide = Math.max(...PAGE_INVENTORY_VIEWPORTS.map((view) => view.width));
      expect(Math.max(...ENDPOINT_SIZES[orientation])).toBeGreaterThanOrEqual(longestViewportSide);
    }
  );

  it.each([
    ['a landscape viewport', 'landscape', { width: 844, height: 390 }],
    ['a portrait viewport', 'portrait', { width: 390, height: 844 }],
    // A square drawing has no landscape picture to match — the endpoint sends it
    // to a square output canvas, and the taller fixture is the closer stand-in.
    ['a square viewport', 'portrait', { width: 600, height: 600 }],
    ['an unmeasurable viewport', 'portrait', null],
  ])('serves %s the %s picture', async (_label, orientation, viewport) => {
    const [expectedWidth] = ENDPOINT_SIZES[orientation];
    const { width } = await sharp(aiOutputFor(viewport)).metadata();
    expect(width).toBe(expectedWidth);
  });
});
