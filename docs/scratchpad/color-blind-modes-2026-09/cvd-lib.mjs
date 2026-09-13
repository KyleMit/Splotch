// Shared color-vision arithmetic for the color-blind-modes spike (README.md
// beside this file). Simulation: the Machado, Oliveira & Fernandes (2009)
// severity-1.0 matrices applied in linear sRGB — the same model behind Chrome
// DevTools' "Emulate vision deficiencies". Distance: CIE76 ΔE in CIELAB on the
// simulated colors. Thresholds used by the audit: ΔE < 10 is hard to tell
// apart at a glance for adjacent large swatches; ΔE < 5 is near-identical.
import { readFileSync } from 'node:fs';

const REPO_ROOT = new URL('../../../', import.meta.url);

export const DEFICIENCIES = ['protan', 'deutan', 'tritan'];

const MATRICES = {
  normal: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export const hexToRgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
const linearize = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const encode = (c) => {
  const clamped = Math.min(1, Math.max(0, c));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
};

export function simulate(hex, vision) {
  const linear = hexToRgb(hex).map(linearize);
  return MATRICES[vision].map((row) =>
    encode(row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2])
  );
}

export const rgbToHex = (rgb) =>
  '#' +
  rgb
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('');

export function rgbToLab([r, g, b]) {
  const [R, G, B] = [r, g, b].map(linearize);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const labOf = (hex, vision) => rgbToLab(simulate(hex, vision));

// The palettes are read straight out of the source files rather than imported:
// palette.ts derives types with `satisfies` and hexPickerLayout.ts is TypeScript,
// and this audit should not need the web toolchain to run.
export function loadCrayonPalette() {
  const source = readFileSync(new URL('web/src/lib/palette.ts', REPO_ROOT), 'utf8');
  const black = source.match(/BLACK_INK = '(#[0-9a-fA-F]{6})'/)[1];
  return [...source.matchAll(/\{ hex: (BLACK_INK|'#[0-9A-Fa-f]{6}'), label: '(\w+)' \}/g)].map(
    ([, hex, label]) => ({ hex: hex === 'BLACK_INK' ? black : hex.slice(1, -1), label })
  );
}

export function loadHexFamilies() {
  const source = readFileSync(new URL('web/src/lib/hexPickerLayout.ts', REPO_ROOT), 'utf8');
  const dimBorder = source.match(/PICKER_DIM_BORDER = '(#[0-9a-fA-F]{6})'/)[1];
  return [...source.matchAll(/name: '(\w+)',\s*shades: \[([^\]]+)\]/g)].map(([, name, shades]) => ({
    name,
    shades: [...shades.matchAll(/'(#[0-9A-Fa-f]{6})'|(PICKER_DIM_BORDER)/g)].map(
      ([, hex]) => hex ?? dimBorder
    ),
  }));
}

export const gridSwatches = (families) =>
  families.flatMap((family) =>
    family.shades.map((hex, index) => ({
      hex,
      family: family.name,
      shade: index + 1,
      label: `${family.name}-${index + 1}`,
    }))
  );
