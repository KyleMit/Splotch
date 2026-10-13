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
  MAX_CONTACTS_7,
  MAX_GEOMETRY_7,
  MAX_RETAINED_OPS_7,
} from '../../experiments/native-architecture/src/drawing/recordedTypes7.ts';
import {
  PAPER_WIDTH,
  PAPER_HEIGHT,
  MAX_BACKING_SCALE,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import {
  MAGIC_RAINBOW_COUNT,
  MAX_CRAYON_SEED,
} from '../../experiments/native-architecture/src/drawing/brushes.ts';
import { createRecordedContactCohort7 } from '../../experiments/native-architecture/src/drawing/recordedContactCohort7.ts';
import { assertAiOriginalModelContract } from '../migration/lib/native-source-contract.mjs';
const ROOT = join(import.meta.dirname, '../..');
const ANDROID = 'android/app/src/main/java/art/splotch/migration/probe/SplotchAIJournal.kt';
const APPLE = 'ios/HelloWorld/SplotchAIJournal.swift';
const PAPER = { kind: 'adopted', cssWidth: 512, cssHeight: 384, backingScale: 2 };
function nativeFiles() {
  return new Map(
    [ANDROID, APPLE].map((path) => [
      path,
      readFileSync(join(ROOT, 'experiments/native-architecture', path)),
    ])
  );
}
function recorded() {
  const owner = createRecordedContactCohort7(PAPER, 'per-frame', 65);
  owner.start('one', { brush: 'crayon', color: 'Red', width: 8 }, { x: 2, y: 3 });
  owner.move('one', [{ x: 12, y: 13 }]);
  owner.drain();
  const completed = owner.end('one');
  return {
    version: 7,
    pageId: 'blank',
    rainbow: 0,
    paper: PAPER,
    commands: [completed.command],
    seedCursor: completed.seedCursor + 1,
  };
}
const IMPORTS = [
  { version: 1, strokes: [] },
  { version: 2, pageId: 'blank', strokes: [] },
  { version: 2, rainbow: 0, strokes: [] },
  { version: 3, pageId: 'blank', rainbow: 0, strokes: [] },
  { version: 4, pageId: 'blank', rainbow: 0, strokes: [] },
  { version: 5, pageId: 'blank', rainbow: 0, strokes: [] },
  { version: 6, pageId: 'blank', rainbow: 0, paper: { kind: 'unadopted' }, strokes: [] },
];
describe('native opaque original-model admission', () => {
  it.each(IMPORTS)('preserves the existing imported decode format$version', (value) => {
    const source = '  ' + JSON.stringify(value) + '\n';
    expect(() => validateAiOriginalModel(source, 'imported')).not.toThrow();
    expect(source).toBe('  ' + JSON.stringify(value) + '\n');
  });
  it('admits declared v7 allocation gaps and rejects retained ops that differ from their actual input', () => {
    const value = recorded();
    expect(() => validateAiOriginalModel(JSON.stringify(value), 'current')).not.toThrow();
    const forged = structuredClone(value);
    forged.commands[0].ops[0].at.x += 1;
    expect(() => validateAiOriginalModel(JSON.stringify(forged), 'current')).toThrow();
  });
  it.each([
    null,
    [],
    {},
    { version: 8, strokes: [] },
    { version: true, strokes: [] },
    { version: 2, strokes: [] },
    { version: 7, commands: [] },
    {
      version: 6,
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
    expect(() => assertAiOriginalModelContract(files)).not.toThrow();
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
    expect(android).toContain('maxDrawingContacts = ' + MAX_CONTACTS_7);
    expect(apple).toContain('maxDrawingContacts = ' + MAX_CONTACTS_7);
    expect(android).toContain('maxDrawingSamples = ' + MAX_GEOMETRY_7);
    expect(apple).toContain('maxDrawingSamples = ' + MAX_GEOMETRY_7);
    expect(MAX_RETAINED_OPS_7).toBe(MAX_GEOMETRY_7 * 2);
    expect(android).toContain('maxRecordedOps = maxDrawingSamples * 2');
    expect(apple).toContain('maxRecordedOps: Int { maxDrawingSamples * 2 }');
    expect(android).toContain('drawingRainbowCount = ' + MAGIC_RAINBOW_COUNT + 'L');
    expect(apple).toContain('drawingRainbowCount: Int64 = ' + MAGIC_RAINBOW_COUNT);
    expect(android).toContain('maxAllocationCursor = ' + (MAX_CRAYON_SEED + 1) + 'L');
    expect(apple).toContain('maxAllocationCursor: Int64 = ' + (MAX_CRAYON_SEED + 1));
    expect(android).toContain('drawingPaperWidth = ' + PAPER_WIDTH + '.0');
    expect(apple).toContain('drawingPaperWidth = ' + PAPER_WIDTH + '.0');
    expect(android).toContain('drawingPaperHeight = ' + PAPER_HEIGHT + '.0');
    expect(apple).toContain('drawingPaperHeight = ' + PAPER_HEIGHT + '.0');
    expect(android).toContain('maximumBackingScale = ' + MAX_BACKING_SCALE + '.0');
    expect(apple).toContain('maximumBackingScale = ' + MAX_BACKING_SCALE + '.0');
    expect(android).toContain('maxModel = 8 * 1024 * 1024');
    expect(apple).toContain('maxModel = 8 * 1024 * 1024');
    expect(MAX_AI_MODEL_BYTES).toBe(8 * 1024 * 1024);
  });
  it.each([
    [ANDROID, 'setOf(5L, 6L, 7L)', 'setOf(5L, 6L, 7L, 8L)'],
    [APPLE, 'Set<Int64> = [5, 6, 7]', 'Set<Int64> = [5, 6, 7, 8]'],
    [ANDROID, 'originalModel(original, kind == "importLegacy")', 'Unit'],
    [APPLE, 'try originalModel(original, kind == "importLegacy")', 'try checked(true)'],
    [ANDROID, 'check(count == 0)', 'check(true)'],
    [APPLE, 'try checked(count == 0)', 'try checked(true)'],
  ])('rejects a native admission source omission at%s', (path, before, after) => {
    const files = nativeFiles();
    const source = files.get(path).toString();
    expect(source.split(before)).toHaveLength(2);
    files.set(path, Buffer.from(source.replace(before, after)));
    expect(() => assertAiOriginalModelContract(files)).toThrow();
    expect(() => assertAiOriginalModelContract(nativeFiles())).not.toThrow();
  });
});
