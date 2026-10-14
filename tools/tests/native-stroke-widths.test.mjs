import { legacyDrawing, canonicalPaper, adoptedDrawing } from './native-paper-fixtures.mjs';
import { STROKE_WIDTHS } from '../../experiments/native-architecture/src/drawing/strokeWidth.ts';
import {
  STROKE_SIZES,
  getStrokeWidthPx,
  getEraserWidthPx,
} from '../../web/src/lib/drawing/strokeSettings.ts';
import { describe, expect, it, vi } from 'vitest';
import {
  addStrokes,
  clearDrawing,
  commitDrawing,
  createHistory,
  emptyDrawing,
  parseDrawing,
  strokeStyle,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { createContactCohort } from '../../experiments/native-architecture/src/drawing/contactCohort.ts';
import { createContactResponder } from '../../experiments/native-architecture/src/drawing/contactResponder.ts';
import {
  createSoundSettings,
  parseSoundSettings,
} from '../../experiments/native-architecture/src/settings/soundSettings.ts';

vi.mock('react-native', () => ({ findNodeHandle: (owner) => owner }));
const point = { x: 200, y: 300 };
const defaults = [
  ['pen', 8],
  ['crayon', 8],
  ['magic', 8],
  ['eraser', 16],
];

describe('canonical shared stroke widths', () => {
  it.each(defaults)('uses the canonical %s default %s', (brush, width) => {
    expect(strokeStyle(brush, 'Blue', emptyDrawing(), 'medium').width).toBe(width);
  });
  it('matches the shipping five-level width owner for every live brush', () => {
    expect(STROKE_WIDTHS).toEqual(['extraThin', 'thin', 'medium', 'thick', 'extraThick']);
    for (const brush of ['pen', 'crayon', 'magic', 'eraser']) {
      expect(
        STROKE_WIDTHS.map((width) => strokeStyle(brush, 'Blue', emptyDrawing(), width).width)
      ).toEqual(
        STROKE_SIZES.map((level) =>
          brush === 'eraser' ? getEraserWidthPx(level) : getStrokeWidthPx(level)
        )
      );
    }
    expect(STROKE_SIZES.map(getStrokeWidthPx)).toEqual([2, 4, 8, 14, 22]);
    expect(STROKE_SIZES.map(getEraserWidthPx)).toEqual([4, 8, 16, 28, 44]);
  });

  it.each([
    { version: 1, strokes: [{ brush: 'pencil', color: 'Blue', points: [point] }] },
    {
      version: 2,
      pageId: 'flower',
      strokes: [{ brush: 'marker', color: 'Blue', points: [point] }],
    },
    {
      version: 2,
      rainbow: 2,
      strokes: [{ brush: 'crayon', color: 'Blue', seed: 17, points: [point] }],
    },
    { version: 2, rainbow: 2, strokes: [{ brush: 'magic', rainbow: 2, points: [point] }] },
    { version: 3, pageId: 'flower', rainbow: 2, strokes: [{ brush: 'eraser', points: [point] }] },
  ])('normalizes only supported old candidate formats with their exact geometry %#', (input) => {
    const expected = { pencil: 7, marker: 22, crayon: 34, magic: 30, eraser: 44 };
    const drawing = parseDrawing(input);
    expect(drawing.version).toBe(5);
    expect(drawing.strokes[0]).toEqual({
      ...input.strokes[0],
      width: expected[input.strokes[0].brush],
    });
    expect(parseDrawing(JSON.parse(JSON.stringify(drawing)))).toEqual(drawing);
  });

  it.each([undefined, null, 0, -22, NaN, Infinity, '22', 23, 88, { value: 22 }])(
    'rejects missing, nonnumeric or unsupported persisted marker width %s',
    (width) => {
      const stroke = { brush: 'marker', color: 'Blue', points: [point], width };
      expect(() => parseDrawing({ ...legacyDrawing(), strokes: [stroke] })).toThrow('width');
    }
  );

  it('refuses added width metadata on old versions and unknown fields on current strokes', () => {
    const stroke = { brush: 'marker', color: 'Blue', points: [point], width: 22 };
    expect(() =>
      parseDrawing({ version: 3, pageId: 'blank', rainbow: 0, strokes: [stroke] })
    ).toThrow();
    expect(() =>
      parseDrawing({
        ...adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }),
        strokes: [{ ...stroke, brush: 'pen', pressure: 0.5 }],
      })
    ).toThrow();
  });

  it('preserves mixed actual widths through a cohort, clear, undo, save and reopen', () => {
    const input = createContactCohort();
    const original = emptyDrawing(2, 'flower');
    input.start('a', 'Blue', 'pen', point, original, 'thin', canonicalPaper);
    input.start('b', 'Blue', 'eraser', point, original, 'thick');
    input.sample('a', { x: 300, y: 300 });
    expect(input.finish('a')).toBeNull();
    const history = addStrokes(createHistory(original), input.finish('b'), input.paper());
    expect(history.drawing.strokes.map(({ width }) => width)).toEqual([4, 28]);
    const snapshot = JSON.stringify(history.drawing);
    const cleared = clearDrawing(history, false);
    expect(undoDrawing(cleared).drawing).toBe(history.drawing);
    const reopened = parseDrawing(JSON.parse(snapshot));
    expect(reopened).toEqual(history.drawing);
    expect(commitDrawing(cleared, reopened).drawing.strokes.map(({ width }) => width)).toEqual([
      4, 28,
    ]);
    expect(JSON.stringify(history.drawing)).toBe(snapshot);
  });

  it('snapshots width at actual contact admission while a later simultaneous contact uses the new choice', () => {
    const target = {};
    let strokeWidth = 'thin';
    let eraserWidth = 'thick';
    let brush = 'pen';
    const cohorts = [];
    const errors = [];
    const input = createContactResponder(
      () => ({
        currentDrawing: emptyDrawing,
        color: 'Blue',
        brush,
        strokeWidth,
        eraserWidth,
        disabled: false,
        onCohort: (strokes) => cohorts.push(strokes),
        onDrawingChange() {},
        onError: (error) => errors.push(error),
      }),
      () => ({ width: 1024, height: 768, pageX: 0, pageY: 0 }),
      () => {},
      () => 1
    );
    const touch = (identifier, timestamp) => ({
      identifier,
      timestamp,
      pageX: 200,
      pageY: 300,
      target,
    });
    const event = (touches, changedTouches, starts) => ({
      currentTarget: target,
      nativeEvent: { touches, changedTouches, target },
      touchHistory: {
        mostRecentTimeStamp: 200,
        touchBank: starts.map((startTimeStamp) => ({ startTimeStamp, touchActive: true })),
      },
    });
    const first = event([touch(0, 100)], [touch(0, 100)], [100]);
    input.grant(first);
    input.start(first);
    strokeWidth = 'thick';
    const second = event([touch(0, 200), touch(1, 200)], [touch(1, 200)], [100, 200]);
    input.start(second);
    eraserWidth = 'thin';
    brush = 'eraser';
    const third = event(
      [touch(0, 300), touch(1, 300), touch(2, 300)],
      [touch(2, 300)],
      [100, 200, 300]
    );
    input.start(third);
    input.interrupt();
    expect(errors).toEqual([]);
    expect(cohorts).toHaveLength(1);
    expect(cohorts[0].map(({ width }) => width)).toEqual([4, 14, 8]);
  });
});

// The shipping defaults a stored record carries beside its sound and widths.
const PERSISTED_DEFAULTS = {
  version: 16,
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

describe('one persisted candidate settings owner', () => {
  it('defaults drawing levels while preserving historic geometry only in saved pictures', () => {
    expect(parseSoundSettings('{"version":1,"soundEnabled":false}')).toEqual({
      ...PERSISTED_DEFAULTS,
      soundEnabled: false,
      strokeWidth: 'medium',
      eraserWidth: 'medium',
    });
  });

  it.each([
    '{"version":2,"soundEnabled":true,"strokeWidth":"huge","eraserWidth":"medium"}',
    '{"version":2,"soundEnabled":true,"strokeWidth":22,"eraserWidth":"medium"}',
    '{"version":2,"soundEnabled":true,"strokeWidth":"thin"}',
    '{"version":2,"soundEnabled":true,"strokeWidth":"thin","eraserWidth":"medium","extra":true}',
    '{"version":2,"soundEnabled":true,"strokeWidth":"thin","eraserWidth":"medium","strokeWidth":"thick"}',
    '{"version":2,"soundEnabled":true,"eraserWidth":"medium","strokeWidth":"thin"}',
  ])('rejects malformed or noncanonical new settings %s', (snapshot) => {
    expect(() => parseSoundSettings(snapshot)).toThrow();
  });

  it('persists independent widths without losing sound, retains failed choice and retries the exact full snapshot', async () => {
    const states = [];
    let saved = '{"version":1,"soundEnabled":false}';
    const storage = {
      read: async () => saved,
      write: vi.fn(async (snapshot) => {
        saved = snapshot;
      }),
    };
    const owner = createSoundSettings(storage, (state) => states.push(state));
    await owner.load();
    await owner.setWidth('drawing', 'thin');
    storage.write.mockRejectedValueOnce(new Error('disk full'));
    await owner.setWidth('eraser', 'thick');
    expect(states.at(-1)).toMatchObject({
      strokeWidth: 'thin',
      eraserWidth: 'thick',
      soundEnabled: false,
      saved: false,
    });
    await owner.retrySave();
    expect(storage.write.mock.calls.at(-1)).toEqual(storage.write.mock.calls.at(-2));
    expect(saved).toBe(
      '{"version":16,"soundEnabled":false,"strokeWidth":"thin","eraserWidth":"thick","appearance":"system","aiEnabled":false,"parentPolicies":{"ai":"always","imageReport":"always","externalLinks":"always","feedback":"always","parentCenter":"always"},"coloringBookEnabled":true,"soundVolume":50,"drawingSoundEnabled":true,"deleteSoundEnabled":true,"undoButtonEnabled":true,"strokeWidthControlEnabled":true,"orientation":"portrait","saveOnDeleteEnabled":false,"buttonScale":100,"reduceMotion":"system","whatsNewSeen":null,"pencilEraserEnabled":true,"applePencilSeen":false,"toolbarStyle":"buttons","toolDrawerEnabled":true,"screenshotEnabled":true,"aiCustomizationEnabled":true,"autoSaveAiEnabled":false}'
    );
    const reopened = createSoundSettings(storage, (state) => states.push(state));
    await reopened.load();
    expect(states.at(-1)).toMatchObject({
      strokeWidth: 'thin',
      eraserWidth: 'thick',
      soundEnabled: false,
      saved: true,
    });
    await reopened.setEnabled(true);
    expect(JSON.parse(saved)).toEqual({
      ...PERSISTED_DEFAULTS,
      soundEnabled: true,
      strokeWidth: 'thin',
      eraserWidth: 'thick',
    });
  });

  it.each(['retry', 'sound choice'])(
    'keeps width taps session-only after a transient read failure through explicit %s until successful reread and new choices',
    async (recovery) => {
      const original =
        '{"version":2,"soundEnabled":true,"strokeWidth":"thick","eraserWidth":"thin"}';
      let saved = original;
      const states = [];
      const storage = {
        read: vi.fn(async () => saved).mockRejectedValueOnce(new Error('temporarily unreadable')),
        write: vi.fn(async (snapshot) => {
          saved = snapshot;
        }),
      };
      const owner = createSoundSettings(storage, (state) => states.push(state));
      await owner.load();
      const warning = states.at(-1).message;
      expect(warning).toContain('could not be read');
      await owner.setWidth('drawing', 'thin');
      await owner.setWidth('eraser', 'thick');
      expect(storage.write).not.toHaveBeenCalled();
      expect(saved).toBe(original);
      expect(states.at(-1)).toEqual({
        status: 'ready',
        coloringBookEnabled: false,
        soundVolume: 50,
        drawingSoundEnabled: true,
        deleteSoundEnabled: true,
        toolbarStyle: 'buttons',
        toolDrawerEnabled: true,
        screenshotEnabled: true,
        aiCustomizationEnabled: true,
        autoSaveAiEnabled: false,
        undoButtonEnabled: true,
        strokeWidthControlEnabled: true,
        orientation: 'portrait',
        saveOnDeleteEnabled: false,
        buttonScale: 100,
        reduceMotion: 'system',
        whatsNewSeen: null,
        pencilEraserEnabled: true,
        applePencilSeen: false,
        soundEnabled: false,
        strokeWidth: 'thin',
        eraserWidth: 'thick',
        selectedColor: 'Purple',
        customColors: [],
        appearance: 'system',
        aiEnabled: false,
        parentPolicies: {
          ai: 'always',
          imageReport: 'always',
          externalLinks: 'always',
          feedback: 'always',
          parentCenter: 'always',
        },
        saved: false,
        message: warning,
      });
      if (recovery === 'retry') await owner.retrySave();
      else await owner.setEnabled(true);
      expect(storage.write).not.toHaveBeenCalled();
      expect(saved).toBe(original);
      await owner.retryRead();
      expect(storage.read).toHaveBeenCalledTimes(2);
      expect(states.at(-1)).toMatchObject({
        saved: true,
        strokeWidth: 'thick',
        eraserWidth: 'thin',
        soundEnabled: true,
      });
      expect(storage.write).not.toHaveBeenCalled();
      await owner.setWidth('drawing', 'thin');
      await owner.setWidth('eraser', 'thick');
      if (recovery === 'sound choice') await owner.setEnabled(false);
      const writes = recovery === 'sound choice' ? 3 : 2;
      expect(storage.write).toHaveBeenCalledTimes(writes);
      expect(JSON.parse(saved)).toEqual({
        ...PERSISTED_DEFAULTS,
        soundEnabled: recovery === 'retry',
        strokeWidth: 'thin',
        eraserWidth: 'thick',
      });
      expect(states.at(-1)).toMatchObject({ saved: true, message: '' });
      await owner.setWidth('drawing', 'medium');
      expect(storage.write).toHaveBeenCalledTimes(writes + 1);
      const reopened = createSoundSettings(storage, (state) => states.push(state));
      await reopened.load();
      expect(states.at(-1)).toMatchObject({
        soundEnabled: recovery === 'retry',
        strokeWidth: 'medium',
        eraserWidth: 'thick',
        saved: true,
      });
    }
  );

  it('persists a later width choice after a write failure following a successful read', async () => {
    let saved = '{"version":2,"soundEnabled":true,"strokeWidth":"thick","eraserWidth":"thin"}';
    const states = [];
    const storage = {
      read: async () => saved,
      write: vi
        .fn(async (snapshot) => {
          saved = snapshot;
        })
        .mockRejectedValueOnce(new Error('disk full')),
    };
    const owner = createSoundSettings(storage, (state) => states.push(state));
    await owner.load();
    await owner.setWidth('drawing', 'thin');
    expect(states.at(-1)).toMatchObject({ saved: false, soundEnabled: true });
    await owner.setWidth('eraser', 'thick');
    expect(storage.write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(saved)).toEqual({
      ...PERSISTED_DEFAULTS,
      soundEnabled: true,
      strokeWidth: 'thin',
      eraserWidth: 'thick',
    });
    expect(states.at(-1)).toMatchObject({ saved: true, message: '' });
  });

  it('rejects invalid live widths and admits no concurrent writer after a successful read', async () => {
    const states = [];
    let finish;
    const storage = {
      read: vi.fn().mockResolvedValue(null),
      write: vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      ),
    };
    const owner = createSoundSettings(storage, (state) => states.push(state));
    await owner.load();
    expect(states.at(-1)).toMatchObject({
      soundEnabled: true,
      strokeWidth: 'medium',
      eraserWidth: 'medium',
      saved: true,
    });
    await expect(owner.setWidth('other', 'thin')).rejects.toThrow('invalid');
    await expect(owner.setWidth('drawing', 'huge')).rejects.toThrow('invalid');
    expect(storage.write).not.toHaveBeenCalled();
    const writing = owner.setWidth('drawing', 'thin');
    expect(states.at(-1)).toMatchObject({
      status: 'saving',
      strokeWidth: 'thin',
      eraserWidth: 'medium',
    });
    await owner.setWidth('eraser', 'thick');
    await owner.setEnabled(true);
    expect(storage.write).toHaveBeenCalledOnce();
    finish();
    await writing;
    expect(states.at(-1)).toMatchObject({
      saved: true,
      strokeWidth: 'thin',
      eraserWidth: 'medium',
      soundEnabled: true,
    });
  });
});
