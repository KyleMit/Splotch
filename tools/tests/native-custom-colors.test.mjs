import { legacyDrawing, adoptedDrawing, canonicalPaper } from './native-paper-fixtures.mjs';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_STROKE_COLOR } from '../../web/src/lib/palette.ts';
import {
  isCustomColor,
  paintAppearance,
  paintHex,
  paintId,
  rememberColor,
} from '../../experiments/native-architecture/src/drawing/palette.ts';
import {
  addStrokes,
  clearDrawing,
  createHistory,
  emptyDrawing,
  strokeStyle,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { parseDrawing } from '../../experiments/native-architecture/src/drawing/drawingFormat.ts';
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
    const cleared = clearDrawing(history, false);
    expect(undoDrawing(cleared).drawing).toEqual({
      ...history.drawing,
      rainbow: cleared.drawing.rainbow,
    });
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

const SETTINGS_DEFAULTS = {
  saveOnDeleteEnabled: false,
  buttonScale: 100,
  reduceMotion: 'system',
  whatsNewSeen: null,
  pencilEraserEnabled: true,
  applePencilSeen: false,
  toolbarStyle: 'buttons',
  toolDrawerEnabled: true,
  screenshotEnabled: true,
  aiCustomizationEnabled: true,
  autoSaveAiEnabled: false,
  coloringBookEnabled: true,
  soundVolume: 50,
  drawingSoundEnabled: true,
  deleteSoundEnabled: true,
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
};
const PAINTED_RECORD = JSON.stringify({
  version: 3,
  soundEnabled: true,
  strokeWidth: 'thick',
  eraserWidth: 'thin',
  selectedColor: '#FEDCBA',
  customColors: ['#FEDCBA', '#000000'],
});

describe('custom paints as session state beside the one settings owner', () => {
  it.each(['light', 'dark'])(
    'keeps custom selection and %s painting through an unrelated save, then resets on reopen',
    async (theme) => {
      const f = settingsFixture();
      await f.owner.load();
      f.owner.setColor('Black');
      f.owner.selectCustomPaint();
      expect(f.states.at(-1)).toMatchObject({ activeSwatch: 'custom', selectedColor: 'Black' });
      expect(paintAppearance(f.states.at(-1).selectedColor, theme).hex).toBe(
        theme === 'dark' ? '#ffffff' : '#0a0b10'
      );
      f.owner.setColor('#123ABC');
      expect(f.states.at(-1)).toMatchObject({ activeSwatch: 'custom', selectedColor: '#123ABC' });
      f.owner.setColor('Red');
      f.owner.selectCustomPaint();
      expect(f.states.at(-1)).toMatchObject({ activeSwatch: 'custom', selectedColor: '#123ABC' });
      await f.owner.setEnabled(false);
      expect(f.states.at(-1)).toMatchObject({ activeSwatch: 'custom', selectedColor: '#123ABC' });
      const saved = JSON.parse(f.storage.write.mock.calls.at(-1)[0]);
      expect(saved).not.toHaveProperty('activeSwatch');
      expect(saved).not.toHaveProperty('selectedColor');
      const reopened = [];
      const owner = createSoundSettings(f.storage, (state) => reopened.push(state));
      await owner.load();
      expect(reopened.at(-1)).toMatchObject({
        activeSwatch: 'Purple',
        selectedColor: 'Purple',
        customColors: [],
      });
      owner.dispose();
      f.owner.dispose();
    }
  );

  it("starts every launch on shipping's default paint, whatever the record saved", async () => {
    const states = [];
    await createSoundSettings({ read: async () => PAINTED_RECORD, write: vi.fn() }, (state) =>
      states.push(state)
    ).load();
    expect(states.at(-1)).toMatchObject({
      saved: true,
      strokeWidth: 'thick',
      eraserWidth: 'thin',
    });
    expect(paintHex(states.at(-1).selectedColor)).toBe(DEFAULT_STROKE_COLOR);
    expect(states.at(-1).customColors).toEqual([]);
  });
  it.each(['retry', 'sound choice'])(
    'keeps paint picks through a failed read, its %s and a reread, and never writes them',
    async (recovery) => {
      let stored = PAINTED_RECORD;
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
      owner.setColor('#123ABC');
      owner.setColor('Blue');
      await owner.setWidth('drawing', 'thin');
      owner.setColor('#000077');
      owner.setColor('#123ABC');
      expect(storage.write).not.toHaveBeenCalled();
      expect(states.at(-1)).toMatchObject({
        saved: false,
        message: warning,
        soundEnabled: false,
        strokeWidth: 'thin',
        eraserWidth: 'medium',
        selectedColor: '#123ABC',
        customColors: ['#123ABC', '#000077'],
      });
      if (recovery === 'retry') await owner.retrySave();
      else await owner.setEnabled(true);
      expect(storage.write).not.toHaveBeenCalled();
      await owner.retryRead();
      expect(states.at(-1)).toMatchObject({
        saved: true,
        soundEnabled: true,
        strokeWidth: 'thick',
        eraserWidth: 'thin',
        selectedColor: '#123ABC',
        customColors: ['#123ABC', '#000077'],
      });
      await owner.setEnabled(false);
      expect(storage.write).toHaveBeenCalledTimes(1);
      expect(parseSoundSettings(stored)).toEqual({
        version: 16,
        ...SETTINGS_DEFAULTS,
        soundEnabled: false,
        strokeWidth: 'thick',
        eraserWidth: 'thin',
      });
      expect(JSON.parse(stored)).not.toHaveProperty('selectedColor');
      const reopened = [];
      await createSoundSettings(storage, (state) => reopened.push(state)).load();
      expect(reopened.at(-1)).toMatchObject({
        saved: true,
        soundEnabled: false,
        selectedColor: 'Purple',
        customColors: [],
      });
    }
  );
  it('keeps a paint pick through a failed write and its retry, which saves no paint', async () => {
    const f = settingsFixture();
    await f.owner.load();
    f.storage.write.mockRejectedValueOnce(new Error('disk full'));
    await f.owner.setWidth('eraser', 'thick');
    f.owner.setColor('#123ABC');
    expect(f.states.at(-1)).toMatchObject({
      saved: false,
      selectedColor: '#123ABC',
    });
    expect(f.states.at(-1).message).toContain('could not be saved');
    await f.owner.retrySave();
    expect(f.storage.write).toHaveBeenCalledTimes(2);
    expect(parseSoundSettings(f.storage.write.mock.calls.at(-1)[0])).toEqual({
      version: 16,
      ...SETTINGS_DEFAULTS,
      soundEnabled: true,
      strokeWidth: 'medium',
      eraserWidth: 'thick',
    });
    expect(f.states.at(-1)).toMatchObject({
      saved: true,
      message: '',
      selectedColor: '#123ABC',
      customColors: ['#123ABC'],
    });
  });
  it('lands a paint pick made while another choice saves, and rejects unsafe live colors', async () => {
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
    const saving = f.owner.setWidth('drawing', 'thin');
    expect(f.states.at(-1)).toMatchObject({ status: 'ready', strokeWidth: 'thin' });
    f.owner.setColor('#123ABC');
    f.owner.setColor('#FEDCBA');
    expect(f.states.at(-1)).toMatchObject({
      status: 'ready',
      selectedColor: '#FEDCBA',
    });
    finish();
    await saving;
    expect(f.states.at(-1)).toMatchObject({
      status: 'ready',
      saved: true,
      strokeWidth: 'thin',
      selectedColor: '#FEDCBA',
      customColors: ['#FEDCBA', '#123ABC'],
    });
    expect(() => f.owner.setColor('red')).toThrow();
    expect(f.storage.write).toHaveBeenCalledTimes(1);
  });
  it('drops a paint pick while settings load', async () => {
    const f = settingsFixture();
    f.owner.setColor('Blue');
    expect(f.states).toEqual([]);
    await f.owner.load();
    expect(f.states.at(-1)).toMatchObject({ selectedColor: 'Purple' });
  });
  it('validates but drops the paint an older record saved', () => {
    const valid = {
      version: 3,
      soundEnabled: true,
      strokeWidth: 'thin',
      eraserWidth: 'thick',
      selectedColor: '#123ABC',
      customColors: ['#123ABC'],
    };
    expect(parseSoundSettings(JSON.stringify(valid))).toEqual({
      ...SETTINGS_DEFAULTS,
      version: 16,
      soundEnabled: true,
      strokeWidth: 'thin',
      eraserWidth: 'thick',
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
});
