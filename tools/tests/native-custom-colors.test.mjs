import { describe, expect, it, vi } from 'vitest';
import {
  exploreColor,
  EXPLORER_TILES,
  isDiscreteColorActivation,
} from '../../experiments/native-architecture/src/drawing/colorExplorer.ts';
import {
  isCustomColor,
  paintHex,
  paintId,
  rememberColor,
} from '../../experiments/native-architecture/src/drawing/palette.ts';
import {
  addStrokes,
  clearDrawing,
  createHistory,
  emptyDrawing,
  parseDrawing,
  strokeStyle,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { createContactCohort } from '../../experiments/native-architecture/src/drawing/contactCohort.ts';
import {
  createSoundSettings,
  parseSoundSettings,
} from '../../experiments/native-architecture/src/settings/soundSettings.ts';

const point = { x: 200.5, y: 300.25 };
function settingsFixture() {
  let stored = null;
  const states = [];
  const storage = {
    read: async () => stored,
    write: vi.fn(async (snapshot) => {
      stored = snapshot;
    }),
  };
  return { storage, states, owner: createSoundSettings(storage, (state) => states.push(state)) };
}

describe('new candidate custom paints', () => {
  it.each([
    ['#123ABC', true],
    ['#ffffff', false],
    ['#FFF', false],
    ['red', false],
    ['url(#x)', false],
    ['#FFFFFF\n', false],
    [null, false],
    [123, false],
    [{ hex: '#123ABC' }, false],
  ])('strictly validates canonical custom color %s', (value, valid) => {
    expect(isCustomColor(value)).toBe(valid);
  });
  it('maps continuous exploration to matching hue, white and black with bounded edge snapping', () => {
    expect(exploreColor(0, 50, 100, 100)).toBe('#FF0000');
    expect(exploreColor(50, 50, 100, 100)).toBe('#00FFFF');
    expect(exploreColor(10, 0, 100, 100)).toBe('#FFFFFF');
    expect(exploreColor(10, 100, 100, 100)).toBe('#000000');
    expect(exploreColor(-50, -10, 100, 100)).toBe('#FFFFFF');
    expect(exploreColor(200, 50, 100, 100)).toBe('#FF0000');
    expect(exploreColor(33.14159, 42.71828, 100, 100)).not.toBe(exploreColor(33, 43, 100, 100));
    expect(EXPLORER_TILES.every((tile) => isCustomColor(tile.color))).toBe(true);
    expect(() => exploreColor(NaN, 1, 100, 100)).toThrow();
    expect(() => exploreColor(1, 1, 0, 100)).toThrow();
  });
  it('ignores the installed web renderer physical trailing click while keeping virtual/native activation', () => {
    expect(isDiscreteColorActivation({ detail: 1 })).toBe(false);
    expect(isDiscreteColorActivation({ detail: 2 })).toBe(false);
    expect(isDiscreteColorActivation({ detail: 0 })).toBe(true);
    expect(isDiscreteColorActivation({ pageX: 10, pageY: 20 })).toBe(true);
    expect(isDiscreteColorActivation(null)).toBe(false);
  });
  it('uses safe pigment IDs, shares named/custom equivalents and refuses unvalidated paint', () => {
    expect(paintId('Blue')).toBe(paintId('#62A2E9'));
    expect(paintId('#123ABC')).toBe('ink-123abc');
    expect(paintHex('Black')).toBe('#0a0b10');
    expect(() => paintHex('url(#injected)')).toThrow();
    expect(() => strokeStyle('marker', 'red', emptyDrawing())).toThrow();
  });
  it.each(['pencil', 'marker', 'crayon'])(
    'round-trips exact %s custom strokes and rejects them in new-app formats before v5',
    (brush) => {
      const stroke = { ...strokeStyle(brush, '#123ABC', emptyDrawing(), 'thin'), points: [point] };
      const drawing = { ...emptyDrawing(), strokes: [stroke] };
      expect(parseDrawing(JSON.parse(JSON.stringify(drawing)))).toEqual(drawing);
      expect(() => parseDrawing({ ...drawing, version: 4 })).toThrow();
      for (const color of ['#123abc', '#123ABC00', 'Red ', 'rgb(1 2 3)', 'url(#x)', null]) {
        expect(() => parseDrawing({ ...drawing, strokes: [{ ...stroke, color }] })).toThrow();
      }
    }
  );
  it('normalizes prior v4 widths and named pigment without rewriting geometry or Magic', () => {
    const old = {
      version: 4,
      pageId: 'flower',
      rainbow: 2,
      strokes: [
        { brush: 'crayon', color: 'Black', seed: 8, width: 68, points: [point] },
        { brush: 'magic', rainbow: 2, width: 15, points: [point] },
      ],
    };
    expect(parseDrawing(old)).toEqual({ ...old, version: 5 });
    expect(strokeStyle('magic', '#123ABC', emptyDrawing(2))).toEqual(
      strokeStyle('magic', 'Red', emptyDrawing(2))
    );
  });
  it('snapshots custom colors and widths per contact, shares Undo and survives Clear/reopen', () => {
    const input = createContactCohort();
    const original = emptyDrawing();
    expect(() => input.start('invalid', 'invalid', 'marker', point, original)).toThrow();
    input.start('a', '#123ABC', 'marker', point, original, 'thin');
    input.start('b', '#FEDCBA', 'crayon', point, original, 'thick');
    input.sample('a', { x: 400, y: 300 });
    expect(input.finish('a')).toBeNull();
    const history = addStrokes(createHistory(original), input.finish('b'));
    expect(history.drawing.strokes.map(({ color, width }) => ({ color, width }))).toEqual([
      { color: '#123ABC', width: 11 },
      { color: '#FEDCBA', width: 68 },
    ]);
    expect(history.undo).toEqual([original]);
    expect(undoDrawing(clearDrawing(history, false)).drawing).toBe(history.drawing);
    expect(parseDrawing(JSON.parse(JSON.stringify(history.drawing)))).toEqual(history.drawing);
    expect(undoDrawing(history).drawing).toBe(original);
  });
  it('keeps six distinct recent custom paints and moves a reused paint to the front', () => {
    let colors = [];
    for (let index = 0; index < 8; index++) colors = rememberColor(colors, `#00000${index}`);
    expect(colors).toEqual(['#000007', '#000006', '#000005', '#000004', '#000003', '#000002']);
    expect(rememberColor(colors, '#000004')).toEqual([
      '#000004',
      '#000007',
      '#000006',
      '#000005',
      '#000003',
      '#000002',
    ]);
  });
});

describe('custom palettes in the one serialized settings owner', () => {
  it('retains the exact failed palette snapshot through width/sound changes and retry, then reopens it', async () => {
    const f = settingsFixture();
    await f.owner.load();
    await f.owner.setWidth('eraser', 'thick');
    await f.owner.setEnabled(false);
    f.storage.write.mockRejectedValueOnce(new Error('disk full'));
    await f.owner.setColor('#123ABC');
    expect(f.states.at(-1)).toMatchObject({
      saved: false,
      selectedColor: '#123ABC',
      customColors: ['#123ABC'],
      eraserWidth: 'thick',
      soundEnabled: false,
    });
    await f.owner.retrySave();
    expect(f.storage.write.mock.calls.at(-1)).toEqual(f.storage.write.mock.calls.at(-2));
    await f.owner.setWidth('drawing', 'thin');
    await f.owner.setColor('Blue');
    const reopened = createSoundSettings(f.storage, (state) => f.states.push(state));
    await reopened.load();
    expect(f.states.at(-1)).toMatchObject({
      saved: true,
      selectedColor: 'Blue',
      customColors: ['#123ABC'],
      strokeWidth: 'thin',
      eraserWidth: 'thick',
      soundEnabled: false,
    });
  });
  it('rejects corrupt palette snapshots, unsafe colors, duplicates, overflow and selected colors missing from the palette', () => {
    const valid = {
      version: 3,
      soundEnabled: true,
      strokeWidth: 'thin',
      eraserWidth: 'thick',
      selectedColor: '#123ABC',
      customColors: ['#123ABC'],
    };
    expect(parseSoundSettings(JSON.stringify(valid))).toEqual(valid);
    for (const customColors of [
      [],
      ['#123abc'],
      ['#123ABC', '#123ABC'],
      ['Red'],
      Array.from({ length: 7 }, (_, i) => `#00000${i}`),
    ]) {
      expect(() => parseSoundSettings(JSON.stringify({ ...valid, customColors }))).toThrow();
    }
    expect(() => parseSoundSettings(JSON.stringify({ ...valid, version: '3' }))).toThrow();
    expect(() =>
      parseSoundSettings(JSON.stringify({ ...valid, selectedColor: 'url(#x)' }))
    ).toThrow();
    expect(() => parseSoundSettings(JSON.stringify({ ...valid, extra: true }))).toThrow();
  });
  it('serializes palette writes with pending settings and makes unreadable defaults explicit', async () => {
    const f = settingsFixture();
    f.storage.read = async () => {
      throw new Error('denied');
    };
    await f.owner.load();
    expect(f.states.at(-1)).toMatchObject({
      saved: false,
      selectedColor: 'Purple',
      customColors: [],
    });
    expect(f.states.at(-1).message).toContain('could not be read');
    let finish;
    f.storage.write.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const saving = f.owner.setColor('#123ABC');
    await f.owner.setColor('#FEDCBA');
    await f.owner.setWidth('drawing', 'thin');
    await f.owner.retrySave();
    expect(f.storage.write).toHaveBeenCalledTimes(1);
    finish();
    await saving;
    expect(f.states.at(-1)).toMatchObject({
      saved: true,
      selectedColor: '#123ABC',
      customColors: ['#123ABC'],
      strokeWidth: 'medium',
    });
    await expect(f.owner.setColor('red')).rejects.toThrow();
    expect(f.storage.write).toHaveBeenCalledTimes(1);
  });
});
