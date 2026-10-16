import { LEGACY_PAPER } from './native-paper-fixtures.mjs';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { CRAYON_BANDS } from '../../experiments/native-architecture/src/drawing/crayon.ts';
import {
  PALETTE_COLORS,
  paintAppearance,
} from '../../experiments/native-architecture/src/drawing/palette.ts';
import { planInk } from '../../experiments/native-architecture/src/drawing/checkpoints.ts';

const ownerUrl = new URL(
  '../../experiments/native-architecture/src/drawing/crayonTiles.ts',
  import.meta.url
);
const source = readFileSync(ownerUrl, 'utf8');
// Encoding counters isolate ownership cost; canonical byte equality is covered by native-crayon-grain.
function subject(code = source) {
  const calls = [];
  const exports = {};
  const modules = {
    './crayon': { CRAYON_BANDS },
    './crayonGrain': { crayonTilePixels: (hex, coverage) => ({ hex, coverage }) },
    './crayonTilePng': {
      crayonTilePng(pixels) {
        calls.push(pixels);
        return `data:image/png;base64,${pixels.hex}:${pixels.coverage}`;
      },
    },
    './palette': { PALETTE_COLORS, paintAppearance },
  };
  runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require(name) {
        if (!Object.hasOwn(modules, name)) throw new Error(`Unexpected tile import: ${name}`);
        return modules[name];
      },
    }
  );
  return { ...exports, calls };
}
function strokes(count) {
  return Array.from({ length: count }, (_, index) => ({
    brush: 'crayon',
    width: 8,
    seed: index + 1,
    color: `#${(index + 1).toString(16).padStart(6, '0').toUpperCase()}`,
    points: [{ x: index, y: 10 }],
  }));
}
function enumerateUnretained(owner, drawing) {
  return drawing.flatMap((stroke) =>
    CRAYON_BANDS.map((_, index) =>
      owner.crayonTileUri(paintAppearance(stroke.color, 'light').hex, index)
    )
  );
}

function readinessSource(name) {
  return readFileSync(
    new URL(`../../experiments/native-architecture/src/drawing/${name}`, import.meta.url),
    'utf8'
  );
}
function resourceArgument(code, call = 'useCrayonTileResources', index = 0) {
  const file = ts.createSourceFile(
    'scene.tsx',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let argument;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === call)
      argument = node.arguments[index]?.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return argument;
}

describe('active Crayon tile ownership', () => {
  it('connects the live resource owner to the actual display tail rather than checkpointed history', () => {
    const live = readinessSource('RasterInk.tsx');
    expect(resourceArgument(live)).toBe('strokes');
    expect(resourceArgument(live, 'useInkTiles', 1)).toBe('displayStrokes');
    expect(resourceArgument(readinessSource('SvgUndoGhost.tsx'))).toBe('tileStrokes');
    expect(resourceArgument(readinessSource('FixedInkCapture.tsx'))).toBe('plan.strokes');
    const changed = live.replace(
      'useInkTiles(props, displayStrokes)',
      'useInkTiles(props, props.strokes)'
    );
    expect(changed).not.toBe(live);
    expect(resourceArgument(changed, 'useInkTiles', 1)).not.toBe('displayStrokes');
  });

  it('reproduces the LRU eviction threshold with 16 and 17 distinct pigments', () => {
    for (const count of [16, 17]) {
      const owner = subject();
      enumerateUnretained(owner, strokes(count));
      owner.calls.length = 0;
      enumerateUnretained(owner, strokes(count));
      expect(owner.calls).toHaveLength(count === 16 ? 0 : count * CRAYON_BANDS.length);
    }
  });
  it.each([0, 1, 16, 17, 21, 40])(
    'does not re-encode active %s-pigment artwork on point updates',
    (count) => {
      const owner = subject();
      const resources = owner.createCrayonTileResources();
      const drawing = strokes(count);
      const first = resources(drawing, 'light');
      expect(owner.calls).toHaveLength(count * CRAYON_BANDS.length);
      owner.calls.length = 0;
      for (let point = 0; point < 20; point++) {
        const updated = drawing.map((stroke) => ({
          ...stroke,
          points: [...stroke.points, { x: point, y: 50 }],
        }));
        expect(resources(updated, 'light').uris).toEqual(first.uris);
      }
      expect(owner.calls).toHaveLength(0);
    }
  );
  it('shares resources with capture and definitions and generates only a new pigment', () => {
    const owner = subject();
    const drawing = strokes(21);
    const live = owner.createCrayonTileResources();
    const capture = owner.createCrayonTileResources();
    const artwork = owner.createCrayonTileResources();
    const active = live(drawing, 'light');
    owner.calls.length = 0;
    const captured = capture(drawing.slice(0, 17), 'light', undefined, active);
    const defined = artwork(drawing.slice(0, 17), 'light', undefined, captured);
    expect(owner.calls).toHaveLength(0);
    expect(defined.uris).toEqual(captured.uris);
    for (const stroke of drawing.slice(0, 17))
      for (const [index] of CRAYON_BANDS.entries())
        expect(
          owner.crayonResourceUri(defined, paintAppearance(stroke.color, 'light').hex, index)
        ).toBe(owner.crayonResourceUri(active, paintAppearance(stroke.color, 'light').hex, index));
    live(strokes(22), 'light');
    expect(owner.calls).toHaveLength(CRAYON_BANDS.length);
  });
  it('releases resources hidden by a checkpoint and retains every actual tail and selected tile', () => {
    const owner = subject();
    const retained = owner.createCrayonTileResources();
    const prefix = strokes(21);
    const pen = { brush: 'pen', color: 'Red', width: 8, points: [{ x: 10, y: 10 }] };
    const tail = strokes(22).slice(21);
    const drawing = [...prefix, pen, ...tail];
    const frame = { id: 1, strokes: [...prefix, pen], paper: LEGACY_PAPER, base64: 'checkpoint' };
    const plan = planInk(drawing, frame);
    expect(plan.checkpoint).toBe(frame);
    expect(plan.strokes).toEqual(tail);
    retained(prefix, 'light');
    owner.calls.length = 0;
    const visible = retained(plan.strokes, 'light', 'Red');
    expect(visible.byKey.size).toBe(2 * CRAYON_BANDS.length);
    expect(visible.uris).toHaveLength(visible.byKey.size);
    expect(owner.calls).toHaveLength(2 * CRAYON_BANDS.length);
    for (const stroke of prefix)
      expect(() => owner.crayonResourceUri(visible, stroke.color, 0)).toThrow();
    owner.calls.length = 0;
    retained(plan.strokes, 'light', 'Red');
    expect(owner.calls).toHaveLength(0);
  });
  it('drops released artwork resources instead of retaining every visited pigment', () => {
    const owner = subject();
    const retained = owner.createCrayonTileResources();
    retained(strokes(40), 'light');
    expect(retained([], 'light').byKey.size).toBe(0);
    owner.calls.length = 0;
    retained(strokes(40).slice(0, 1), 'light');
    expect(owner.calls).toHaveLength(CRAYON_BANDS.length);
  });
  it('deduplicates repeated pigments and rebuilds only changed appearance resources', () => {
    const owner = subject();
    const retained = owner.createCrayonTileResources();
    const black = { ...strokes(1)[0], color: 'Black' };
    expect(retained([black, { ...black, seed: 2 }], 'light', 'Black').byKey.size).toBe(
      CRAYON_BANDS.length
    );
    owner.calls.length = 0;
    const dark = retained([black], 'dark', 'Black');
    expect(owner.calls).toHaveLength(CRAYON_BANDS.length);
    expect(() => owner.crayonResourceUri(dark, paintAppearance('Black', 'light').hex, 0)).toThrow();
    expect(owner.crayonResourceUri(dark, '#ffffff', 0)).toContain('#ffffff');
  });
  it('detects removal of retained-resource reuse after LRU eviction', () => {
    const before = 'retained.get(key) ?? inherited?.byKey.get(key) ?? crayonTileUri(hex, index)';
    expect(source).toContain(before);
    const changed = subject(source.replace(before, 'crayonTileUri(hex, index)'));
    const retained = changed.createCrayonTileResources();
    retained(strokes(17), 'light');
    changed.calls.length = 0;
    retained(strokes(17), 'light');
    expect(changed.calls).toHaveLength(17 * CRAYON_BANDS.length);
  });
  it('detects removal of inherited-resource sharing on capture mount', () => {
    const before = 'inherited?.byKey.get(key) ?? ';
    expect(source).toContain(before);
    const changed = subject(source.replace(before, ''));
    const live = changed.createCrayonTileResources()(strokes(21), 'light');
    changed.calls.length = 0;
    changed.createCrayonTileResources()(strokes(21), 'light', undefined, live);
    expect(changed.calls).toHaveLength(21 * CRAYON_BANDS.length);
  });
});
