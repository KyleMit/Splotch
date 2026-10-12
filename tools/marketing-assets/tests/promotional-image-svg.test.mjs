import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PALETTE_COLORS } from '../../../web/src/lib/palette.ts';
import { ROOT } from '../../lib/proc.mjs';
import { parseSvg } from '../gen-promotional-image.mjs';

// A generator that ran on import would replay onto the shipped web/static/large-image.png;
// its first step, starting the dev server, rejects here instead. The call is kept in a
// plain list because Vitest clears vi.fn call history before each test.
const serverStarts = vi.hoisted(() => []);
vi.mock('../../app-driver/lib/app-driver.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  ensureDevServer: async (port) => {
    serverStarts.push(port);
    throw new Error('gen-promotional-image ran on import');
  },
}));

const COMMITTED_SVG = readFileSync(
  join(ROOT, 'tools/marketing-assets/assets/promotional-image.svg'),
  'utf8'
);
const PATH = '<path d="M 0 0 L 10 10" stroke="#86aed3" stroke-width="14"/>';
const REPLAYED = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';
const svgWith = (body, { viewBox = '0 0 100 100', group = REPLAYED } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><g ${group}>${body}</g></svg>`;
const MINIMAL_PARSE = {
  width: 100,
  height: 100,
  strokes: [
    {
      label: 'Blue',
      strokeWidth: 14,
      pts: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    },
  ],
};

describe('promotional image SVG parser', () => {
  it('imports without starting the generator', () => {
    expect(serverStarts).toEqual([]);
  });

  it('replays all 66 committed strokes at the viewBox scale with palette swatches', () => {
    const { width, height, strokes } = parseSvg(COMMITTED_SVG);
    expect({ width, height }).toEqual({ width: 2265, height: 1388 });
    expect(strokes).toHaveLength(66);
    const paletteLabels = PALETTE_COLORS.map(({ label }) => label);
    for (const { label } of strokes) expect(paletteLabels).toContain(label);
  });

  it('parses a minimal path into one labelled stroke', () => {
    expect(parseSvg(svgWith(PATH))).toEqual(MINIMAL_PARSE);
  });

  it('inherits the presentation through nested groups', () => {
    expect(parseSvg(svgWith(`<g>${PATH}</g>`))).toEqual(MINIMAL_PARSE);
  });

  it('accepts the presentation set on the stroke itself', () => {
    const svg = svgWith(PATH.replace('/>', ` ${REPLAYED}/>`), { group: '' });
    expect(parseSvg(svg)).toEqual(MINIMAL_PARSE);
  });

  it.each([
    [
      'an unmapped stroke color',
      svgWith(PATH.replace('#86aed3', '#123456')),
      'Unmapped stroke color #123456 on <path>',
    ],
    [
      'a curve command',
      svgWith(PATH.replace('L 10 10', 'C 1 1 2 2 3 3')),
      'Unsupported path token C (expected L) in d="M 0 0 C 1 1 2 2 3 3"',
    ],
    [
      'a second subpath',
      svgWith(PATH.replace('L 10 10', 'M 10 10')),
      'Unsupported path token M (expected L) in d="M 0 0 M 10 10"',
    ],
    [
      'a comma-separated coordinate',
      svgWith(PATH.replace('L 10 10', 'L 10,10')),
      'L x in d="M 0 0 L 10,10" is not a number: 10,10',
    ],
    [
      'a <line>',
      svgWith('<line x1="0" y1="0" x2="10" y2="10" stroke="#86aed3" stroke-width="14"/>'),
      'Unsupported SVG element <line>',
    ],
    [
      'a transform',
      svgWith(`<g transform="rotate(4)">${PATH}</g>`),
      'Unsupported attribute transform on <g>',
    ],
    [
      'a path with no stroke',
      svgWith(PATH.replace(' stroke="#86aed3"', '')),
      '<path> is missing stroke',
    ],
    [
      'a circle with no radius',
      svgWith('<circle cx="5" cy="5" stroke="#86aed3" stroke-width="8"/>'),
      '<circle> is missing r',
    ],
    [
      'a zero stroke width',
      svgWith(PATH.replace('stroke-width="14"', 'stroke-width="0"')),
      '<path> stroke-width must be positive: 0',
    ],
    [
      'a negative radius',
      svgWith('<circle cx="5" cy="5" r="-20" stroke="#86aed3" stroke-width="8"/>'),
      '<circle> r must be positive: -20',
    ],
    [
      'a filled group',
      svgWith(PATH, { group: REPLAYED.replace('fill="none"', 'fill="red"') }),
      '<path> needs fill="none" on it or a parent <g>, got "red"',
    ],
    [
      "a group that leaves SVG's default black fill",
      svgWith(PATH, { group: REPLAYED.replace('fill="none" ', '') }),
      '<path> needs fill="none" on it or a parent <g>, got unset',
    ],
    [
      'a filled circle',
      svgWith('<circle cx="5" cy="5" r="5" fill="red" stroke="#86aed3" stroke-width="8"/>'),
      '<circle> needs fill="none" on it or a parent <g>, got "red"',
    ],
    [
      'square caps',
      svgWith(PATH, { group: REPLAYED.replace('linecap="round"', 'linecap="square"') }),
      '<path> needs stroke-linecap="round" on it or a parent <g>, got "square"',
    ],
    [
      "a path that overrides its group's round joins",
      svgWith(PATH.replace('/>', ' stroke-linejoin="miter"/>')),
      '<path> needs stroke-linejoin="round" on it or a parent <g>, got "miter"',
    ],
    [
      'a path that is not self-closing',
      svgWith(PATH.replace('/>', '></path>')),
      '<path> must be self-closing',
    ],
    [
      'a viewBox that is not zero-origin',
      svgWith(PATH, { viewBox: '10 0 100 100' }),
      '<svg> needs a viewBox of "0 0 <width> <height>", got 10 0 100 100',
    ],
    [
      'a zero-width viewBox',
      svgWith(PATH, { viewBox: '0 0 0 100' }),
      'viewBox width must be positive: 0',
    ],
    ['a comment', svgWith(`<!-- note -->${PATH}`), 'Unsupported SVG markup <!-- note -->'],
    ['text outside the tags', svgWith(`${PATH}stray`), 'Unexpected text outside SVG tags'],
    [
      'a nested <svg>',
      svgWith(`<svg viewBox="0 0 10 10">${PATH}</svg>`),
      'Only one <svg> element is supported',
    ],
    ['a path after </svg>', `${svgWith(PATH)}${PATH}`, '<path> is outside the <svg> root'],
    ['a missing </svg>', svgWith(PATH).replace('</svg>', ''), 'Unclosed <svg>'],
    ['a missing </g>', svgWith(PATH).replace('</g>', ''), 'Mismatched </svg> (open element: <g>)'],
    ['markup with no <svg> root', `<g ${REPLAYED}>${PATH}</g>`, '<g> is outside the <svg> root'],
    ['an empty document', '', 'No <svg> root'],
    ['an SVG with no strokes', svgWith(''), 'SVG has no strokes to replay'],
  ])('refuses %s', (_case, svg, message) => {
    expect(() => parseSvg(svg)).toThrow(new Error(message));
  });
});
