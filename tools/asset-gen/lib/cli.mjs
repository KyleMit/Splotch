import { fail } from './paths.mjs';

export function parsePositiveInt(raw, name, fallback) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!(Number.isInteger(value) && value >= 1)) {
    fail(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

export function parseTemperature(raw, name, fallback) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!(value >= 0 && value <= 2)) {
    fail(`${name} must be a number between 0 and 2, got "${raw}"`);
  }
  return value;
}

export function parseNonNegative(raw, name, fallback) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!(value >= 0)) {
    fail(`${name} must be a non-negative number, got "${raw}"`);
  }
  return value;
}
