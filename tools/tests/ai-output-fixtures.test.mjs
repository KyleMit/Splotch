import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { AI_OUTPUT_FIXTURES, aiOutputFor } from '../../web/tests/artifacts/ai-output-fixtures.ts';
import { PAGE_INVENTORY_VIEWPORTS } from '../page-inventory/lib/page-inventory-report.mjs';

// The mocks that stand in for /api/generate-image answer with a committed
// picture, and nothing but the picture's own pixels keeps it usable: a fixture
// swapped for a re-render of the wrong shape or a contact-sheet copy of itself
// would still load, still be served, and still fail nothing — the result modal
// would just compose around a picture the product never hands it, which is the
// review distortion this index exists to prevent.
const EXPECTED_LANDSCAPE = { landscape: true, portrait: false };

// The result stage draws the picture at its natural size at the largest, and the
// card projects a box for it that is always inset from the viewport by a gutter
// on both axes. So a picture whose long side covers the longest side any
// inventory viewport has cannot be outgrown by that box, and one that falls
// under it leaves the card standing open around a picture too small to fill it.
const COVERED_PX = Math.max(...PAGE_INVENTORY_VIEWPORTS.map((view) => view.width));

describe('AI output fixtures', () => {
  it.each(Object.entries(AI_OUTPUT_FIXTURES))(
    'files the %s picture under its own shape, large enough to fill the stage',
    async (orientation, path) => {
      const { width, height } = await sharp(path).metadata();
      expect(width > height).toBe(EXPECTED_LANDSCAPE[orientation]);
      expect(Math.max(width, height)).toBeGreaterThanOrEqual(COVERED_PX);
    }
  );

  it.each([
    ['a landscape viewport', { width: 844, height: 390 }, 'landscape'],
    ['a portrait viewport', { width: 390, height: 844 }, 'portrait'],
    // A square drawing has no landscape picture to match — the endpoint sends it
    // to a square output canvas, and the taller fixture is the closer stand-in.
    ['a square viewport', { width: 600, height: 600 }, 'portrait'],
    ['an unmeasurable viewport', null, 'portrait'],
  ])('serves %s the %s picture', async (_label, viewport, orientation) => {
    const { width, height } = await sharp(aiOutputFor(viewport)).metadata();
    expect(width > height).toBe(EXPECTED_LANDSCAPE[orientation]);
  });
});
