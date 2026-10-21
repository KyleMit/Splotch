import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { host, records } from './rsd-native-selection-host.mjs';
import { click, mountProduct } from './rsd-native-parent-center-fixture.mjs';
import { GATE_MODAL, gateKey, gateProblem, tapGateKeys } from './rsd-parent-gate-keypad.mjs';
import {
  PARENT_GATE_KEYPAD_METRICS,
  PARENT_GATE_METRICS,
} from '../../../experiments/native-architecture/src/parentCenter/parentGateMetrics.ts';
import { PARENT_GATE_KEYPAD_KEYS } from '../../../experiments/native-architecture/src/parentCenter/parentGate.ts';
import { GATE_EQUATION_ONE_ROW_MAX_FONT_SCALE } from '../../../experiments/native-architecture/src/rsdDrawing/RsdParentGateSheet.tsx';
import {
  gateSizeClass,
  modalFrame,
} from '../../../experiments/native-architecture/src/rsdDrawing/modalGeometry.ts';

// React Native's font scale at iOS's accessibility sizes, and Android 14's largest font size.
const AX1_FONT_SCALE = 1.786;
const AX3_FONT_SCALE = 2.643;
const AX5_FONT_SCALE = 3.571;
const ANDROID_MAX_FONT_SCALE = 2;
// iOS's largest ordinary size, Larger Text off.
const XXXL_FONT_SCALE = 1.353;
// Math.random 0.5 picks operand 6 every time: a two-digit answer (36) on every problem.
const FIXED_OPERAND_RANDOM = 0.5;
// The landscape row's gap between the problem and the keypad: dimensions.space5.
const LANDSCAPE_ROW_GAP_PX = 20;

const PHONE = { width: 402, height: 874 };
const PHONE_LANDSCAPE = { width: 874, height: 402 };
const NARROW_ANDROID = { width: 360, height: 800 };
const TABLET = { width: 834, height: 1194 };
const LARGE_TABLET = { width: 1032, height: 1376 };

// The face the native app renders the gate's digits and operators in, read from the font file
// itself: one line's height and each glyph's advance, in ems.
const quicksandBold = readQuicksandBold();

function readQuicksandBold() {
  const require = createRequire(import.meta.url);
  const font = readFileSync(
    require.resolve('@expo-google-fonts/quicksand/700Bold/Quicksand_700Bold.ttf')
  );
  const tables = new Map();
  for (let index = 0; index < font.readUInt16BE(4); index += 1) {
    const record = 12 + index * 16;
    tables.set(font.toString('ascii', record, record + 4), font.readUInt32BE(record + 8));
  }
  const unitsPerEm = font.readUInt16BE(tables.get('head') + 18);
  const hhea = tables.get('hhea');
  const advances = font.readUInt16BE(hhea + 34);
  const cmap = tables.get('cmap');
  const subtables = Array.from({ length: font.readUInt16BE(cmap + 2) }, (_, index) => ({
    platform: font.readUInt16BE(cmap + 4 + index * 8),
    encoding: font.readUInt16BE(cmap + 6 + index * 8),
    offset: cmap + font.readUInt32BE(cmap + 8 + index * 8),
  }));
  const unicode = subtables.find(({ platform, encoding }) => platform === 3 && encoding === 1);
  expect(font.readUInt16BE(unicode.offset), 'cmap format').toBe(4);
  const glyph = (code) => {
    const table = unicode.offset;
    const segments = font.readUInt16BE(table + 6) / 2;
    const ends = table + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const ranges = deltas + segments * 2;
    for (let index = 0; index < segments; index += 1) {
      if (code > font.readUInt16BE(ends + index * 2)) continue;
      const start = font.readUInt16BE(starts + index * 2);
      expect(code, `glyph for ${code}`).toBeGreaterThanOrEqual(start);
      const delta = font.readInt16BE(deltas + index * 2);
      const range = font.readUInt16BE(ranges + index * 2);
      if (range === 0) return (code + delta) & 0xffff;
      const id = font.readUInt16BE(ranges + index * 2 + range + (code - start) * 2);
      return (id + delta) & 0xffff;
    }
    throw new Error(`No glyph for ${code}`);
  };
  return {
    lineEm: (font.readInt16BE(hhea + 4) - font.readInt16BE(hhea + 6)) / unitsPerEm,
    advanceEm: (text) =>
      [...text].reduce((sum, character) => {
        const id = Math.min(glyph(character.codePointAt(0)), advances - 1);
        return sum + font.readUInt16BE(tables.get('hmtx') + id * 4) / unitsPerEm;
      }, 0),
  };
}

async function openGate(window, fontScale) {
  records.dimensions = { ...window, scale: 1, fontScale };
  records.journalHostProps = true;
  vi.spyOn(Math, 'random').mockReturnValue(FIXED_OPERAND_RANDOM);
  await mountProduct();
  await click('Parent Center fixture entry');
  expect(gateProblem()).toEqual({ x: 6, y: 6 });
}

const committed = (node) => JSON.parse(node.getAttribute('data-committed-props')).style;
const equation = () => host.querySelector(`${GATE_MODAL} [role="img"]`);

// The equation as laid out: each row's splats (with the digit each holds) and operator glyphs.
function equationRows() {
  return [...equation().children].map((row) =>
    [...row.children].map((node) => {
      const style = committed(node);
      if (node.children.length === 0) return { glyph: node.textContent, fontSize: style.fontSize };
      const digit = node.lastElementChild;
      return {
        width: style.width,
        height: style.height,
        digit: digit.textContent,
        fontSize: committed(digit).fontSize,
      };
    })
  );
}

// The narrowest the native row can lay its pieces out: splats at their size, each glyph at its
// advance in the OS text size, and the equation's gap between neighbours.
function rowWidth(row, fontScale, gap) {
  const pieces = row.map((piece) =>
    piece.glyph === undefined
      ? piece.width
      : quicksandBold.advanceEm(piece.glyph) * piece.fontSize * fontScale
  );
  return pieces.reduce((sum, width) => sum + width, 0) + gap * (pieces.length - 1);
}

function problemWidth(window) {
  const size = gateSizeClass(window);
  const card = committed(host.querySelector(`${GATE_MODAL} [data-testid="modal-surface"]`)).width;
  const inner = card - 2 * modalFrame('gate', window, 0).body.inline;
  if (size !== 'phoneLandscape') return inner;
  return inner - PARENT_GATE_KEYPAD_METRICS.phoneLandscape.width - LANDSCAPE_ROW_GAP_PX;
}

function expectEquationFits(window, fontScale) {
  const size = gateSizeClass(window);
  const gap = PARENT_GATE_METRICS[size].equationGap;
  const rows = equationRows();
  const stacked = committed(equation()).flexDirection === 'column';
  const width = problemWidth(window);
  const lines = stacked ? rows : [rows.flat()];
  for (const line of lines)
    expect(rowWidth(line, fontScale, gap), `row of ${size} at ${fontScale}×`).toBeLessThanOrEqual(
      width
    );
  for (const piece of rows.flat().filter((entry) => entry.digit !== undefined)) {
    const digitLine = piece.fontSize * fontScale * quicksandBold.lineEm;
    expect(piece.height, `splat for ${piece.digit || 'an empty dab'}`).toBeGreaterThanOrEqual(
      digitLine
    );
    if (piece.digit !== '')
      expect(piece.width).toBeGreaterThanOrEqual(
        quicksandBold.advanceEm(piece.digit) * piece.fontSize * fontScale
      );
  }
  return { stacked, rows };
}

// A key's height is a floor its label grows past; its width, a third of the keypad less the gaps,
// holds the widest digit at the OS text size.
function expectKeysHoldDigits(window, fontScale) {
  const metrics = PARENT_GATE_KEYPAD_METRICS[gateSizeClass(window)];
  const keypad = metrics.width ?? problemWidth(window);
  const keyWidth = (keypad - 2 * metrics.gap) / 3;
  for (const style of keyStyles()) {
    expect(style.minHeight).toBe(metrics.keyHeight);
    expect(style.height).toBeUndefined();
  }
  for (const digit of PARENT_GATE_KEYPAD_KEYS.filter((key) => typeof key === 'number')) {
    const label = gateKey(digit).firstElementChild;
    const width =
      quicksandBold.advanceEm(label.textContent) * committed(label).fontSize * fontScale;
    expect(width, `key ${digit}`).toBeLessThanOrEqual(keyWidth);
  }
}

function keyStyles() {
  return PARENT_GATE_KEYPAD_KEYS.map((key) =>
    committed(gateKey(typeof key === 'number' ? key : key === 'delete' ? 'Delete' : 'Check answer'))
  );
}

describe('RSD Parental Gate at large OS text sizes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the shipping one-row equation and key height through the ordinary text sizes', async () => {
    await openGate(PHONE, XXXL_FONT_SCALE);
    expect(XXXL_FONT_SCALE).toBeLessThanOrEqual(GATE_EQUATION_ONE_ROW_MAX_FONT_SCALE);
    const { stacked, rows } = expectEquationFits(PHONE, XXXL_FONT_SCALE);
    expect(stacked).toBe(false);
    expect(rows.flat().map((piece) => piece.digit ?? piece.glyph)).toEqual([
      '6',
      '×',
      '6',
      '=',
      '',
      '',
    ]);
    const { operand, dab } = PARENT_GATE_METRICS.phone;
    expect(rows.flat().filter((piece) => piece.digit !== undefined)).toMatchObject([
      { width: operand, height: operand },
      { width: operand, height: operand },
      { width: dab.width, height: dab.height },
      { width: dab.width, height: dab.height },
    ]);
    expectKeysHoldDigits(PHONE, XXXL_FONT_SCALE);
  });

  // At AX3 and AX5 the fixed splats cut each digit's lower half and the keys cut theirs (#3123).
  it.each([
    ['a phone', 'AX1', PHONE, AX1_FONT_SCALE],
    ['a phone', 'AX3', PHONE, AX3_FONT_SCALE],
    ['a phone', 'AX5', PHONE, AX5_FONT_SCALE],
    ['a landscape phone', 'AX3', PHONE_LANDSCAPE, AX3_FONT_SCALE],
    ['a landscape phone', 'AX5', PHONE_LANDSCAPE, AX5_FONT_SCALE],
    ['a tablet', 'AX5', TABLET, AX5_FONT_SCALE],
    ['a large tablet', 'AX5', LARGE_TABLET, AX5_FONT_SCALE],
    ['a narrow Android phone', 'font scale 2', NARROW_ANDROID, ANDROID_MAX_FONT_SCALE],
  ])(
    'stands the question over its answer on %s at %s, every digit whole',
    async (_, __, window, fontScale) => {
      await openGate(window, fontScale);
      const { stacked, rows } = expectEquationFits(window, fontScale);
      expect(stacked).toBe(true);
      expect(rows.map((row) => row.map((piece) => piece.digit ?? piece.glyph))).toEqual([
        ['6', '×', '6'],
        ['=', '', ''],
      ]);
      expectKeysHoldDigits(window, fontScale);
      await tapGateKeys(3, 6);
      expect(expectEquationFits(window, fontScale).rows[1].map((piece) => piece.digit)).toEqual([
        undefined,
        '3',
        '6',
      ]);
    }
  );
});
