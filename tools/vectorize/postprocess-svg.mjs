import { globSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { optimize } from 'svgo';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';

const COMMITTED_VECTOR_SVG_PATTERNS = [
  'tools/vectorize/pilot/*.optimized.svg',
  'web/static/coloring/**/*.svg',
];

const SVGO_CONFIG = {
  multipass: true,
  plugins: ['preset-default'],
};

function intrinsicDimensions(rootTag, filePath) {
  const match = /\bviewBox=(['"])([^'"]+)\1/.exec(rootTag);
  if (!match) throw new Error(`${filePath}: root SVG has no viewBox`);

  const values = match[2].trim().split(/[\s,]+/);
  const numbers = values.map(Number);
  if (
    values.length !== 4 ||
    numbers.some((value) => !Number.isFinite(value)) ||
    numbers[2] <= 0 ||
    numbers[3] <= 0
  ) {
    throw new Error(`${filePath}: root SVG has an invalid viewBox`);
  }
  return { width: values[2], height: values[3] };
}

function normalizeFill(fill) {
  if (fill === undefined) return undefined;
  if (!/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(fill)) {
    throw new Error('--fill must be a 3- or 6-digit hex color');
  }
  return fill.toLowerCase();
}

export function postprocessVectorizerSvg(source, filePath = 'vectorizer.svg', options = {}) {
  const fill = normalizeFill(options.fill);
  const sourceWithoutDimensions = source.replace(/<svg\b[^>]*>/, (rootTag) =>
    rootTag.replace(/\s+(?:width|height)=(?:"[^"]*"|'[^']*')/g, '')
  );
  const optimized = optimize(sourceWithoutDimensions, { ...SVGO_CONFIG, path: filePath }).data;
  const rootMatch = /^<svg\b[^>]*>/.exec(optimized);
  if (!rootMatch) throw new Error(`${filePath}: optimized output has no root SVG element`);

  const { width, height } = intrinsicDimensions(rootMatch[0], filePath);
  const existingFill = /\s+fill=(['"])([^'"]+)\1/.exec(rootMatch[0])?.[2];
  const outputFill = fill ?? existingFill;
  const rootWithoutDimensions = rootMatch[0].replace(
    /\s+(?:width|height)=(?:"[^"]*"|'[^']*')/g,
    ''
  );
  const rootWithDimensions = rootWithoutDimensions
    .replace(/\s+fill=(?:"[^"]*"|'[^']*')/g, '')
    .replace(
      /\s+viewBox=/,
      ` width="${width}" height="${height}"${outputFill ? ` fill="${outputFill}"` : ''} viewBox=`
    );
  return rootWithDimensions + optimized.slice(rootMatch[0].length);
}

export function committedVectorizerSvgPaths() {
  return COMMITTED_VECTOR_SVG_PATTERNS.flatMap((pattern) => globSync(pattern, { cwd: ROOT }))
    .map((path) => resolve(ROOT, path))
    .sort();
}

function inputPaths(positionals) {
  if (positionals.length === 0) return committedVectorizerSvgPaths();
  return positionals.map((path) => (isAbsolute(path) ? path : resolve(process.cwd(), path)));
}

export function postprocessVectorizerSvgFiles(argv) {
  const {
    values: { check, fill, out },
    positionals,
  } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      check: { type: 'boolean' },
      fill: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const inputs = inputPaths(positionals);
  if (inputs.length === 0) throw new Error('No committed Vectorizer SVGs found');
  if (out && inputs.length !== 1) throw new Error('--out requires exactly one input SVG');
  if (check && out) throw new Error('--out cannot be combined with --check');

  const changes = [];
  for (const input of inputs) {
    const output = out ? (isAbsolute(out) ? out : resolve(process.cwd(), out)) : input;
    const before = readFileSync(input, 'utf8');
    const after = postprocessVectorizerSvg(before, input, { fill });
    const changed = after !== before || output !== input;
    if (check && changed) changes.push(relative(ROOT, input));
    if (!check && changed) writeFileSync(output, after);
  }
  return { checked: inputs.length, changes };
}

export async function runPostprocessVectorizerSvg(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const result = postprocessVectorizerSvgFiles(argv);
  if (check && result.changes.length > 0) {
    throw new Error(
      `${result.changes.length} Vectorizer SVG(s) need post-processing:\n${result.changes.join('\n')}`
    );
  }
  const action = check ? 'checked' : 'post-processed';
  console.log(`[vectorize:postprocess] ${action} ${result.checked} SVG(s).`);
}

if (isMain(import.meta.url)) runMain(() => runPostprocessVectorizerSvg());
