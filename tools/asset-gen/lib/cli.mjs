import { parseArgs } from 'node:util';
import { fail } from './paths.mjs';

export function parsePngToWebpOptions(args = process.argv.slice(2), env = process.env) {
  const { values } = parseArgs({
    args,
    options: {
      quality: { type: 'string' },
      lossless: { type: 'boolean' },
    },
  });
  return {
    quality: parseNonNegative(values.quality ?? env.QUALITY, '--quality', 80),
    lossless: values.lossless ?? env.LOSSLESS === '1',
  };
}

// How many times a gated generate-and-score loop re-rolls a candidate before it
// gives up and keeps the best attempt. It sits with the other shared CLI knobs
// rather than inside bin/gen-coloring-fills.mjs — the only loop using it today —
// because the retry budget is a pipeline-level tuning value: the generator, its
// tests, and any future gated loop all read it from one place.
export const MAX_ATTEMPTS = 5;

export function parsePositiveInt(raw, name, fallback, source) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!(Number.isInteger(value) && value >= 1)) {
    fail(`${name} must be a positive integer, got "${raw}"${source ? ` (${source})` : ''}`);
  }
  return value;
}

export function parseTemperature(raw, name, fallback, source) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!(value >= 0 && value <= 2)) {
    fail(`${name} must be a number between 0 and 2, got "${raw}"${source ? ` (${source})` : ''}`);
  }
  return value;
}

export function parseNonNegative(raw, name, fallback, source) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!(value >= 0)) {
    fail(`${name} must be a non-negative number, got "${raw}"${source ? ` (${source})` : ''}`);
  }
  return value;
}
