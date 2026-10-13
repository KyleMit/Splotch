import { legacyDrawing, adoptedDrawing, canonicalPaper } from './native-paper-fixtures.mjs';
import { describe, expect, it, vi } from 'vitest';
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
  it('uses safe pigment IDs, shares named/custom equivalents and refuses unvalidated paint', () => {
    expect(paintId('Blue')).toBe(paintId('#62A2E9'));
    expect(paintId('#123ABC')).toBe('ink-123abc');
    expect(paintHex('Black')).toBe('#0a0b10');
    expect(() => paintHex('url(#injected)')).toThrow();
    expect(() => strokeStyle('pen', 'red', emptyDrawing())).toThrow();
  });
  it.each([
    { brush: 'pen', kind: 'live' },
    { brush: 'crayon', kind: 'live' },
    { brush: 'pencil', kind: 'stored', width: 3.5 },
    { brush: 'marker', kind: 'stored', width: 11 },
  ])(
    'round-trips exact $kind $brush custom strokes and rejects them in new-app formats before v5',
    ({ brush, kind, width }) => {
      const style =
        kind === 'live'
          ? strokeStyle(brush, '#123ABC', emptyDrawing(), 'thin')
          : { brush, width, color: '#123ABC' };
      const stroke = { ...style, points: [point] };
      const base =
        kind === 'live'
          ? adoptedDrawing({ width: 342, height: 256.5, pixelRatio: 1 })
          : legacyDrawing();
      const drawing = { ...base, strokes: [stroke] };
      expect(parseDrawing(JSON.parse(JSON.stringify(drawing)))).toEqual(drawing);
      expect(() =>
        parseDrawing({
          version: 4,
          pageId: drawing.pageId,
          rainbow: drawing.rainbow,
          strokes: drawing.strokes,
        })
      ).toThrow();
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
    expect(() =>
      input.start('invalid', 'invalid', 'pen', point, original, 'medium', canonicalPaper)
    ).toThrow();
    input.start('a', '#123ABC', 'pen', point, original, 'thin', canonicalPaper);
    input.start('b', '#FEDCBA', 'crayon', point, original, 'thick');
    input.sample('a', { x: 400, y: 300 });
    expect(input.finish('a')).toBeNull();
    const history = addStrokes(createHistory(original), input.finish('b'), input.paper());
    expect(history.drawing.strokes.map(({ color, width }) => ({ color, width }))).toEqual([
      { color: '#123ABC', width: 4 },
      { color: '#FEDCBA', width: 14 },
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
  it.each(['retry', 'sound choice'])(
    'preserves unread stored preferences and the warning through session paint changes through explicit %s until successful reread and a new choice',
    async (recovery) => {
      const original = JSON.stringify({
        version: 3,
        soundEnabled: true,
        strokeWidth: 'thick',
        eraserWidth: 'thin',
        selectedColor: '#FEDCBA',
        customColors: ['#FEDCBA', '#000000'],
      });
      let stored = original;
      const states = [];
      const storage = {
        read: vi.fn(async () => stored).mockRejectedValueOnce(new Error('temporarily unreadable')),
        write: vi.fn(async (snapshot) => {
          stored = snapshot;
        }),
      };
      const owner = createSoundSettings(storage, (state) => states.push(state));
      await owner.load();
      const warning = states.at(-1).message;
      expect(warning).toContain('could not be read');
      await owner.setColor('#123ABC');
      await owner.setColor('Blue');
      await owner.setWidth('drawing', 'thin');
      await owner.setColor('#000077');
      await owner.setColor('#123ABC');
      expect(storage.write).not.toHaveBeenCalled();
      expect(stored).toBe(original);
      expect(states.at(-1)).toMatchObject({
        saved: false,
        message: warning,
        soundEnabled: false,
        strokeWidth: 'thin',
        eraserWidth: 'medium',
        selectedColor: '#123ABC',
        customColors: ['#123ABC', '#000077'],
      });
      const untouched = [];
      await createSoundSettings(storage, (state) => untouched.push(state)).load();
      expect(untouched.at(-1)).toMatchObject({
        saved: true,
        soundEnabled: true,
        strokeWidth: 'thick',
        eraserWidth: 'thin',
        selectedColor: '#FEDCBA',
        customColors: ['#FEDCBA', '#000000'],
      });
      if (recovery === 'retry') await owner.retrySave();
      else await owner.setEnabled(true);
      expect(storage.write).not.toHaveBeenCalled();
      expect(stored).toBe(original);
      const reads = storage.read.mock.calls.length;
      await owner.retryRead();
      expect(storage.read).toHaveBeenCalledTimes(reads + 1);
      expect(states.at(-1)).toMatchObject({
        saved: true,
        selectedColor: '#FEDCBA',
        strokeWidth: 'thick',
        eraserWidth: 'thin',
      });
      expect(storage.write).not.toHaveBeenCalled();
      await owner.setColor('#123ABC');
      if (recovery === 'sound choice') await owner.setEnabled(false);
      const writes = recovery === 'sound choice' ? 2 : 1;
      expect(storage.write).toHaveBeenCalledTimes(writes);
      expect(parseSoundSettings(stored)).toEqual({
        version: 12,
        saveOnDeleteEnabled: false,
        buttonScale: 100,
        reduceMotion: 'system',
        whatsNewSeen: null,
        pencilEraserEnabled: true,
        applePencilSeen: false,
        coloringBookEnabled: true,
        soundLevel: 'medium',
        undoButtonEnabled: true,
        strokeWidthControlEnabled: true,
        orientation: 'portrait',
        aiEnabled: false,
        parentPolicies: {
          ai: 'always',
          imageReport: 'always',
          externalLinks: 'always',
          feedback: 'always',
          parentCenter: 'always',
        },
        appearance: 'system',
        soundEnabled: recovery === 'retry',
        strokeWidth: 'thick',
        eraserWidth: 'thin',
        selectedColor: '#123ABC',
        customColors: ['#123ABC', '#FEDCBA', '#000000'],
      });
      expect(states.at(-1)).toMatchObject({ saved: true, message: '' });
      await owner.setColor('#ABCDEF');
      expect(storage.write).toHaveBeenCalledTimes(writes + 1);
      const reopened = [];
      await createSoundSettings(storage, (state) => reopened.push(state)).load();
      expect(reopened.at(-1)).toMatchObject({
        saved: true,
        selectedColor: '#ABCDEF',
        customColors: ['#ABCDEF', '#123ABC', '#FEDCBA', '#000000'],
        soundEnabled: recovery === 'retry',
        strokeWidth: 'thick',
        eraserWidth: 'thin',
      });
    }
  );
  it('persists a later paint choice after a failed write following a known successful read', async () => {
    const f = settingsFixture();
    await f.owner.load();
    await f.owner.setWidth('eraser', 'thick');
    f.storage.write.mockRejectedValueOnce(new Error('disk full'));
    await f.owner.setColor('#123ABC');
    expect(f.states.at(-1)).toMatchObject({ saved: false, soundEnabled: true });
    expect(f.states.at(-1).message).toContain('could not be saved');
    await f.owner.setColor('#ABCDEF');
    expect(f.storage.write).toHaveBeenCalledTimes(3);
    expect(parseSoundSettings(f.storage.write.mock.calls.at(-1)[0])).toEqual({
      version: 12,
      saveOnDeleteEnabled: false,
      buttonScale: 100,
      reduceMotion: 'system',
      whatsNewSeen: null,
      pencilEraserEnabled: true,
      applePencilSeen: false,
      coloringBookEnabled: true,
      soundLevel: 'medium',
      undoButtonEnabled: true,
      strokeWidthControlEnabled: true,
      orientation: 'portrait',
      aiEnabled: false,
      parentPolicies: {
        ai: 'always',
        imageReport: 'always',
        externalLinks: 'always',
        feedback: 'always',
        parentCenter: 'always',
      },
      appearance: 'system',
      soundEnabled: true,
      strokeWidth: 'medium',
      eraserWidth: 'thick',
      selectedColor: '#ABCDEF',
      customColors: ['#ABCDEF', '#123ABC'],
    });
    expect(f.states.at(-1)).toMatchObject({ saved: true, message: '' });
  });
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
    expect(parseSoundSettings(JSON.stringify(valid))).toEqual({
      ...valid,
      version: 12,
      saveOnDeleteEnabled: false,
      buttonScale: 100,
      reduceMotion: 'system',
      whatsNewSeen: null,
      pencilEraserEnabled: true,
      applePencilSeen: false,
      coloringBookEnabled: true,
      soundLevel: 'medium',
      undoButtonEnabled: true,
      strokeWidthControlEnabled: true,
      orientation: 'portrait',
      aiEnabled: false,
      parentPolicies: {
        ai: 'always',
        imageReport: 'always',
        externalLinks: 'always',
        feedback: 'always',
        parentCenter: 'always',
      },
      appearance: 'system',
    });
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
  it('serializes pending palette writes and rejects unsafe live colors', async () => {
    const f = settingsFixture();
    await f.owner.load();
    expect(f.states.at(-1)).toMatchObject({
      saved: true,
      selectedColor: 'Purple',
      customColors: [],
    });
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
