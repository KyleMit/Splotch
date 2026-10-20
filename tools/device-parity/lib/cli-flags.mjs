import { parseArgs } from 'node:util';
import { fail, parseNumberFlag, parseOrFail, rejectUnknownFlags } from '../../lib/proc.mjs';

// parseArgs' own unknown-option error names no alternatives, so the shared refusal, which lists the
// known set, runs first; parseArgs then only shapes the values.
export function parseFlags(argv, { options, required = [], positionals = false }) {
  rejectUnknownFlags(Object.keys(options), argv);
  const parsed = parseOrFail(() =>
    parseArgs({ args: argv, options, strict: true, allowPositionals: positionals })
  );
  const missing = required.filter((name) => parsed.values[name] === undefined);
  if (missing.length) fail(`Missing required ${missing.map((name) => `--${name}`).join(', ')}`);
  return parsed;
}

export function numberFlag(values, name, rule) {
  const raw = values[name];
  return raw === undefined ? undefined : parseOrFail(() => parseNumberFlag(name, raw, rule));
}

export function choiceFlag(values, name, choices) {
  const value = values[name];
  if (value !== undefined && !choices.includes(value)) {
    fail(`--${name} must be one of ${choices.join(', ')}, got "${value}"`);
  }
  return value;
}

export function listFlag(values, name, choices) {
  const items = values[name].split(',').filter(Boolean);
  const unknown = items.filter((item) => !choices.includes(item));
  if (!items.length || unknown.length) {
    fail(`--${name} takes a comma list of ${choices.join(', ')}, got "${values[name]}"`);
  }
  return items;
}
