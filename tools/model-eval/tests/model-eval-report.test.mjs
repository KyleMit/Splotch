import { describe, expect, it } from 'vitest';
import { renderReportHtml, statsFor } from '../lib/model-eval-report.mjs';
import { VARIANTS } from '../lib/model-eval.mjs';

const [gemini, , low] = VARIANTS;

function row(id, variant, overrides = {}) {
  return {
    id,
    category: id.split('__')[0],
    variant: variant.key,
    variantLabel: variant.label,
    sample: 1,
    kind: 'image',
    ms: 8_000,
    cost: 0.0204,
    imageTokens: 158,
    outBytes: 1_000_000,
    outFmt: 'png',
    _thumb: `assets/out__${id}__${variant.key}__1.jpg`,
    ...overrides,
  };
}

const results = [
  row('coloring-manual__cow__wide', gemini, { ms: 7_600, cost: 0.0389 }),
  row('coloring-manual__cow__wide', low, { ms: 26_700 }),
  row('line__cat__square', gemini, { ms: 8_100, cost: 0.0389 }),
  row('line__cat__square', low, {
    kind: 'error',
    ms: null,
    cost: null,
    _thumb: null,
    reason:
      '500 An error occurred while processing your request. Please include the request ID req_1.',
  }),
];
const variants = [gemini, low];
const inThumb = {
  'coloring-manual__cow__wide': 'assets/in__coloring-manual__cow__wide.jpg',
  line__cat__square: 'assets/in__line__cat__square.jpg',
};

function render(extra = {}) {
  return renderReportHtml({
    runId: '2026-08-14T03-49-18-372Z-bakeoff',
    results,
    samples: 1,
    concurrency: 6,
    variants,
    inThumb,
    agg: Object.fromEntries(variants.map((v) => [v.key, statsFor(results, v.key)])),
    ...extra,
  });
}

describe('renderReportHtml', () => {
  it('prints cost in cents and time in seconds, rounded to what was measured', () => {
    const html = render();
    expect(html).toContain('3.9¢<small>per image</small>');
    expect(html).toContain('2.0¢<small>per image</small>');
    expect(html).toContain('27 s<small>median</small>');
    expect(html).toContain('8.1 s<small>median</small>');
    expect(html).toContain('$39 per 1,000');
  });

  it('emits one hide rule per variant for the gallery toolbar', () => {
    const html = render();
    for (const v of variants) {
      expect(html).toContain(`.gallery.off-${v.key} [data-v="${v.key}"]{display:none}`);
      expect(html).toContain(`data-v="${v.key}" aria-pressed="true"`);
    }
  });

  it('names categories and drawings for a reader, not by filename', () => {
    const html = render();
    expect(html).toContain('Coloring page, colored by hand');
    expect(html).toContain('<option value="cat-line">Outlines only</option>');
    expect(html).toContain('<h4><b>cow</b><span>wide</span></h4>');
  });

  it('reports a failed call by its first sentence and links to the drawing', () => {
    const html = render();
    expect(html).toContain('500 An error occurred while processing your request.');
    expect(html).not.toContain('req_1');
    expect(html).toContain('href="#draw-line__cat__square"');
    expect(html).toContain('1 of 4</span>');
  });

  it('marks the variant production runs today and totals the spend', () => {
    const html = render();
    expect(html).toContain('in production now');
    expect(html).toContain('<b>$0.10</b> spent');
    expect(html).toContain('Aug 14, 2026');
  });

  it('drops the verdict block when no verdict is supplied', () => {
    expect(render()).not.toContain('class="verdict"');
    expect(render({ verdictHtml: '<div class="pick">x</div>' })).toContain('class="verdict"');
  });
});
