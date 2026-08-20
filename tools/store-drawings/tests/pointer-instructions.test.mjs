import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  convertSvg,
  flattenSvgPath,
  generateModule,
  generateStoreDrawings,
} from '../gen-pointer-instructions.mjs';
import { softColorMetrics } from '../evaluate-drawing-fidelity.mjs';
import {
  fitInstructionScene,
  sceneStrokeReplayPoints,
  sceneStrokePoints,
  strokeReplayPoints,
} from '../lib/drawing-instructions.mjs';
import { STORE_DRAWINGS, STORE_DRAWING_SCENES } from '../generated/store-drawings.mjs';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const drawingsRoot = join(repoRoot, 'tools/store-drawings/samples');
const generatedPath = join(repoRoot, 'tools/store-drawings/generated/store-drawings.mjs');

describe('store drawing conversion', () => {
  it('flattens cubic paths and closes them into pointer coordinates', () => {
    const points = flattenSvgPath('M0,0C0,10 10,10 10,0Z');

    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1)).toEqual({ x: 0, y: 0 });
    expect(points.length).toBeGreaterThan(4);
    expect(Math.max(...points.map(({ y }) => y))).toBeGreaterThan(7);
  });

  it('rejects SVG surface that cannot become real pointer strokes', () => {
    const source = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

    expect(() => convertSvg(source, 'square-wide.svg')).toThrow('unsupported tags rect');
  });

  it.each([
    '<g fill="none" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" transform="translate(5 0)">',
    '<path d="M0,0C0,0 1,0 1,0" stroke-width="1" transform="translate(5 0)"/>',
  ])('rejects transforms instead of compiling changed geometry: %s', (element) => {
    const path = '<path d="M0,0C0,0 1,0 1,0" stroke-width="1"/>';
    const group = '<g fill="none" stroke="#000000" stroke-linecap="round" stroke-linejoin="round">';
    const source = `<svg viewBox="0 0 10 10">${
      element.startsWith('<g') ? `${element}${path}</g>` : `${group}${element}</g>`
    }</svg>`;

    expect(() => convertSvg(source, 'transform-wide.svg')).toThrow(
      'unsupported attribute transform'
    );
  });

  it('merges contiguous paths that quantize to the same color and stroke size', () => {
    const source =
      '<svg viewBox="0 0 100 100">' +
      '<g fill="none" stroke="#000000" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M0,0C10,0 20,0 30,0" stroke-width="2"/>' +
      '<path d="M30,0C40,0 50,0 60,0" stroke-width="2"/>' +
      '<path d="M60,0C70,0 80,0 90,0" stroke-width="10"/>' +
      '</g></svg>';

    const drawing = convertSvg(source, 'continuation-wide.svg');

    expect(drawing.strokes).toHaveLength(2);
    expect(drawing.strokes[0].points.at(-2)).toBe(60);
    expect(drawing.strokes[0].points.at(-1)).toBe(0);
    expect(drawing.strokes[0].size).not.toBe(drawing.strokes[1].size);
  });

  it('generates all seven named drawings as finite static instructions', () => {
    const drawings = generateStoreDrawings(drawingsRoot);

    expect(drawings.map(({ key }) => key)).toEqual([
      'balloon-tall',
      'boat-tall',
      'dinosaur-wide',
      'home-wide',
      'house-tall',
      'house-wide',
      'island-tall',
    ]);
    for (const drawing of drawings) {
      expect(drawing.strokes.length).toBeGreaterThan(50);
      for (const stroke of drawing.strokes) {
        expect(stroke.points.length % 2).toBe(0);
        expect(stroke.points.length).toBeGreaterThanOrEqual(2);
        expect(stroke.points.every(Number.isFinite)).toBe(true);
        expect(stroke.size).toBeGreaterThanOrEqual(1);
        expect(stroke.size).toBeLessThanOrEqual(5);
        expect(stroke.color).toBeGreaterThanOrEqual(0);
        expect(stroke.color).toBeLessThan(drawing.colors.length);
      }
      for (const [index, stroke] of drawing.strokes.slice(1).entries()) {
        const previous = drawing.strokes[index];
        const continues =
          previous.color === stroke.color &&
          previous.size === stroke.size &&
          previous.points.at(-2) === stroke.points[0] &&
          previous.points.at(-1) === stroke.points[1];
        expect(continues, `${drawing.key}: stroke ${index + 2} should have merged`).toBe(false);
      }
    }
  });

  it('keeps the committed instruction module in generator lockstep', () => {
    const expected = generateModule(generateStoreDrawings(drawingsRoot));

    expect(readFileSync(generatedPath, 'utf8')).toBe(expected);
    expect(expected).not.toContain('.svg');
    expect(expected).not.toMatch(/\bd:\s*["']/);
    expect(expected).toContain('page, box, options');
  });

  it('exports a named function and scene for every generated drawing', () => {
    expect(Object.keys(STORE_DRAWINGS)).toEqual(Object.keys(STORE_DRAWING_SCENES));
    expect(Object.values(STORE_DRAWINGS).every((draw) => typeof draw === 'function')).toBe(true);
  });
});

describe('instruction scene fitting', () => {
  const scene = {
    width: 200,
    height: 100,
    colors: [{ kind: 'palette', label: 'Blue' }],
    strokes: [{ color: 0, size: 3, points: [0, 0, 200, 100] }],
  };

  it('contain-fits and centers source coordinates in the live canvas', () => {
    const box = { width: 300, height: 300 };

    expect(fitInstructionScene(scene, box)).toEqual({ scale: 1.5, x: 0, y: 75 });
    expect(sceneStrokePoints(scene, box, scene.strokes[0])).toEqual([
      { x: 0, y: 75 },
      { x: 300, y: 225 },
    ]);
  });

  it('expands the same six samples and endpoint hold as pointer replay', () => {
    expect(
      strokeReplayPoints([
        { x: 0, y: 0 },
        { x: 6, y: 12 },
      ])
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 6 },
      { x: 4, y: 8 },
      { x: 5, y: 10 },
      { x: 6, y: 12 },
      { x: 6, y: 12 },
    ]);
  });

  it('preserves an inset scene box in canvas-local engine coordinates', () => {
    const replay = sceneStrokeReplayPoints(
      scene,
      { x: 50, y: 100, width: 300, height: 300 },
      { x: 10, y: 20 },
      scene.strokes[0]
    );

    expect(replay[0]).toEqual({ x: 40, y: 155 });
    expect(replay.at(-1)).toEqual({ x: 340, y: 305 });
  });
});

describe('fidelity metrics', () => {
  const pixel = (rgba) => ({ rgba: Uint8Array.from(rgba), width: 1, height: 1 });

  it('rejects a color swap even when the silhouettes are identical', () => {
    const red = pixel([255, 0, 0, 255]);
    const blue = pixel([0, 0, 255, 255]);

    expect(softColorMetrics(red, red).iou).toBe(1);
    expect(softColorMetrics(red, blue).iou).toBe(0);
  });
});
