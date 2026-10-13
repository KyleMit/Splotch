import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  validateAiOriginalModel,
  MAX_AI_MODEL_BYTES,
  AI_ORIGINAL_CURRENT_VERSIONS,
  AI_ORIGINAL_IMPORT_VERSIONS,
} from '../../experiments/native-architecture/src/platform/aiOriginalModel.ts';
import {
  drawingCapacity,
  emptyDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import {
  PAPER_WIDTH,
  PAPER_HEIGHT,
  MAX_BACKING_SCALE,
  MAX_PAPER_CSS_PX,
  MIN_PAPER_CSS_PX,
  MIN_BACKING_SCALE,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { MAGIC_RAINBOW_COUNT } from '../../experiments/native-architecture/src/drawing/brushes.ts';
const ROOT = join(import.meta.dirname, '../..');
const ANDROID = 'android/app/src/main/java/art/splotch/migration/probe/SplotchAIJournal.kt';
const APPLE = 'ios/HelloWorld/SplotchAIJournal.swift';
function nativeFiles() {
  return new Map(
    [ANDROID, APPLE].map((path) => [
      path,
      readFileSync(join(ROOT, 'experiments/native-architecture', path)),
    ])
  );
}
const IMPORTS = [
  { version: 1, strokes: [] },
  { version: 2, pageId: 'blank', strokes: [] },
  { version: 2, rainbow: 0, strokes: [] },
  { version: 3, pageId: 'blank', rainbow: 0, strokes: [] },
  { version: 4, pageId: 'blank', rainbow: 0, strokes: [] },
  { version: 5, pageId: 'blank', rainbow: 0, strokes: [] },
  { version: 7, pageId: 'blank', rainbow: 0, paper: { kind: 'unadopted' }, strokes: [] },
];
describe('native opaque original-model admission', () => {
  it.each(IMPORTS)('preserves the existing imported decode format$version', (value) => {
    const source = '  ' + JSON.stringify(value) + '\n';
    expect(() => validateAiOriginalModel(source, 'imported')).not.toThrow();
    expect(source).toBe('  ' + JSON.stringify(value) + '\n');
  });
  it.each([
    null,
    [],
    {},
    { version: 8, strokes: [] },
    { version: true, strokes: [] },
    { version: 2, strokes: [] },
    { version: 7, commands: [] },
    { version: 6, pageId: 'blank', rainbow: 0, paper: { kind: 'unadopted' }, strokes: [] },
    {
      version: 7,
      paper: { kind: 'unadopted', cssWidth: 1 },
      pageId: 'blank',
      rainbow: 0,
      strokes: [],
    },
  ])('rejects malformed or unsupported imported models %#', (value) => {
    expect(() => validateAiOriginalModel(JSON.stringify(value), 'imported')).toThrow();
  });
  it('rejects malformed JSON and an oversized UTF8 payload before a model can be admitted', () => {
    expect(() => validateAiOriginalModel('{', 'current')).toThrow();
    expect(() => validateAiOriginalModel(' '.repeat(MAX_AI_MODEL_BYTES + 1), 'current')).toThrow(
      'large'
    );
  });
  it('pins both native opaque envelopes to JS schema and allocation bounds', () => {
    const files = nativeFiles();
    const android = files.get(ANDROID).toString();
    const apple = files.get(APPLE).toString();
    expect(android).toContain(
      'currentOriginalVersions = setOf(' +
        AI_ORIGINAL_CURRENT_VERSIONS.map((v) => v + 'L').join(', ') +
        ')'
    );
    expect(apple).toContain(
      'currentOriginalVersions: Set<Int64> = [' + AI_ORIGINAL_CURRENT_VERSIONS.join(', ') + ']'
    );
    expect(android).toContain(
      'importedOriginalVersions = setOf(' +
        AI_ORIGINAL_IMPORT_VERSIONS.map((v) => v + 'L').join(', ') +
        ')'
    );
    expect(apple).toContain(
      'importedOriginalVersions: Set<Int64> = [' + AI_ORIGINAL_IMPORT_VERSIONS.join(', ') + ']'
    );
    const capacity = drawingCapacity(emptyDrawing());
    expect(android).toContain('maxDrawingContacts = ' + capacity.strokes);
    expect(apple).toContain('maxDrawingContacts = ' + capacity.strokes);
    expect(android).toContain('maxDrawingSamples = ' + capacity.points);
    expect(apple).toContain('maxDrawingSamples = ' + capacity.points);
    expect(android).toContain('drawingRainbowCount = ' + MAGIC_RAINBOW_COUNT + 'L');
    expect(apple).toContain('drawingRainbowCount: Int64 = ' + MAGIC_RAINBOW_COUNT);
    expect(android).toContain('drawingPaperWidth = ' + PAPER_WIDTH + '.0');
    expect(apple).toContain('drawingPaperWidth = ' + PAPER_WIDTH + '.0');
    expect(android).toContain('drawingPaperHeight = ' + PAPER_HEIGHT + '.0');
    expect(apple).toContain('drawingPaperHeight = ' + PAPER_HEIGHT + '.0');
    expect(android).toContain('maximumPaperCssPx = ' + MAX_PAPER_CSS_PX + '.0');
    expect(apple).toContain('minimumPaperCssPx = ' + MIN_PAPER_CSS_PX + '.0');
    expect(android).toContain('minimumPaperCssPx = ' + MIN_PAPER_CSS_PX + '.0');
    expect(apple).toContain('minimumBackingScale = ' + MIN_BACKING_SCALE);
    expect(android).toContain('minimumBackingScale = ' + MIN_BACKING_SCALE);
    expect(apple).toContain('maximumPaperCssPx = ' + MAX_PAPER_CSS_PX + '.0');
    expect(android).toContain('maximumBackingScale = ' + MAX_BACKING_SCALE + '.0');
    expect(apple).toContain('maximumBackingScale = ' + MAX_BACKING_SCALE + '.0');
    expect(android).toContain('maxModel = 8 * 1024 * 1024');
    expect(apple).toContain('maxModel = 8 * 1024 * 1024');
    expect(MAX_AI_MODEL_BYTES).toBe(8 * 1024 * 1024);
  });
});
