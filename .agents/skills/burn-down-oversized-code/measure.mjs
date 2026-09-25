#!/usr/bin/env node
// Measure every file or function a size cap covers, against the cap ESLint
// actually resolves for it, and list what a burn-down-oversized-code campaign
// has to act on: units inside the headroom band under their cap, and per-file
// overrides that no longer earn their exception.
//
// Usage:
//   node .claude/skills/burn-down-oversized-code/measure.mjs <files|functions> [--json] [--check]
//
// The caps, the rule options, and the scope are read from eslint.config.js —
// the default block is the one rule block whose `files` holds a glob, and every
// block whose `files` are all literal paths is a per-file override. Counts come
// from ESLint itself (the rule re-run at max 1), so they match what CI enforces,
// including skipBlankLines/skipComments. --check exits 1 while anything is left
// to act on, which is how a campaign verifies its tip.

import { ESLint } from 'eslint';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, isMain, runMain } from '../../../tools/lib/proc.mjs';

// Each headroom is the rule's hard cap minus the soft target the eslint.config.js
// comment on its block states (500/425, 125/100). A unit closer than this to its
// cap is a candidate, and a raise sets the cap to the unit's length plus this.
export const MODES = {
  files: { rule: 'max-lines', headroomLines: 75 },
  functions: { rule: 'max-lines-per-function', headroomLines: 25 },
};

// An override is only worth a commit to lower once it grants this many times the
// room a fresh raise would; closer than that, rewriting the cap churns config to
// reclaim a handful of lines.
const STALE_ROOM_MULTIPLE = 2;

const GLOB_CHARS = /[*?{[]/;
const TOO_MANY_LINES = /^(.*) has too many lines \((\d+)\)/;

const severityOf = (entry) => (Array.isArray(entry) ? entry[0] : entry);
const isEnabled = (entry) => entry !== undefined && ![0, 'off'].includes(severityOf(entry));

export function parseMessage(message) {
  const match = TOO_MANY_LINES.exec(message);
  if (!match) throw new Error(`Unrecognised size-rule message: ${message}`);
  return { subject: match[1], lines: Number(match[2]) };
}

export function findRuleBlocks(config, rule) {
  const blocks = config.flat(Infinity).filter((block) => block?.rules?.[rule] !== undefined);
  const defaults = blocks.filter((block) => block.files?.some((f) => GLOB_CHARS.test(f)));
  if (defaults.length !== 1) {
    throw new Error(`Expected exactly one glob-scoped ${rule} block, found ${defaults.length}`);
  }
  const [defaultBlock] = defaults;
  const overrides = blocks
    .filter((block) => block !== defaultBlock)
    .flatMap((block) => block.files.map((path) => ({ path, cap: block.rules[rule][1].max })));
  return {
    scope: defaultBlock.files,
    options: defaultBlock.rules[rule][1],
    defaultCap: defaultBlock.rules[rule][1].max,
    overrides,
  };
}

export function assess({ units, capsByPath, overrides, defaultCap, headroomLines }) {
  const candidates = units
    .filter((unit) => unit.lines > capsByPath.get(unit.path) - headroomLines)
    .map((unit) => ({ ...unit, cap: capsByPath.get(unit.path) }))
    .sort((a, b) => b.lines - a.lines);

  const longestByPath = new Map();
  for (const unit of units) {
    longestByPath.set(unit.path, Math.max(longestByPath.get(unit.path) ?? 0, unit.lines));
  }

  const staleOverrides = overrides.flatMap(({ path, cap }) => {
    if (!capsByPath.has(path)) return [{ path, cap, longest: null, action: 'retire' }];
    const longest = longestByPath.get(path) ?? 0;
    if (longest <= defaultCap - headroomLines) return [{ path, cap, longest, action: 'retire' }];
    if (cap - longest > headroomLines * STALE_ROOM_MULTIPLE) {
      return [{ path, cap, longest, action: `lower to ${longest + headroomLines}` }];
    }
    return [];
  });

  return { candidates, staleOverrides };
}

async function measure(mode) {
  const { rule, headroomLines } = MODES[mode];
  const configModule = await import(pathToFileURL(join(ROOT, 'eslint.config.js')).href);
  const { scope, options, defaultCap, overrides } = findRuleBlocks(configModule.default, rule);

  const resolver = new ESLint({ cwd: ROOT });
  const probe = new ESLint({
    cwd: ROOT,
    warnIgnored: false,
    // Only the size rule runs, so type information is dead weight on the parse.
    ruleFilter: ({ ruleId }) => ruleId === rule,
    overrideConfig: [
      { languageOptions: { parserOptions: { projectService: false } } },
      { rules: { [rule]: ['warn', { ...options, max: 1 }] } },
    ],
  });

  const capsByPath = new Map();
  const units = [];
  for (const result of await probe.lintFiles(scope)) {
    const path = relative(ROOT, result.filePath);
    const entry = (await resolver.calculateConfigForFile(result.filePath))?.rules?.[rule];
    if (!isEnabled(entry)) continue;
    capsByPath.set(path, entry[1].max);
    for (const message of result.messages.filter((m) => m.ruleId === rule)) {
      const { subject, lines } = parseMessage(message.message);
      units.push(
        mode === 'files' ? { path, lines } : { path, line: message.line, name: subject, lines }
      );
    }
  }

  return {
    mode,
    rule,
    scope,
    defaultCap,
    headroomLines,
    softTarget: defaultCap - headroomLines,
    measured: { files: capsByPath.size, units: units.length },
    ...assess({ units, capsByPath, overrides, defaultCap, headroomLines }),
  };
}

function formatReport(report) {
  const where = (u) => (u.line ? `${u.path}:${u.line}  ${u.name}` : u.path);
  const out = [
    `${report.rule} over ${report.scope.join(', ')} — default cap ${report.defaultCap}, ` +
      `headroom ${report.headroomLines} (soft target ${report.softTarget})`,
    report.mode === 'files'
      ? `Measured ${report.measured.files} files.`
      : `Measured ${report.measured.units} functions across ${report.measured.files} files.`,
    '',
    `Candidates (${report.candidates.length}): within ${report.headroomLines} lines of their cap`,
    ...report.candidates.map(
      (u) =>
        `  ${String(u.lines).padStart(5)} / ${String(u.cap).padEnd(5)} ` +
        `room ${String(u.cap - u.lines).padStart(4)}  ${where(u)}`
    ),
    '',
    `Stale overrides (${report.staleOverrides.length}):`,
    ...report.staleOverrides.map(
      (o) => `  cap ${o.cap}, longest ${o.longest ?? 'n/a'}: ${o.action}  ${o.path}`
    ),
  ];
  return out.join('\n');
}

const USAGE = 'Usage: measure.mjs <files|functions> [--json] [--check]';

export function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const unknown = [...flags].filter((f) => !['--json', '--check'].includes(f));
  if (unknown.length || positional.length !== 1 || !(positional[0] in MODES)) {
    return { error: unknown.length ? `Unknown option(s): ${unknown.join(' ')}` : USAGE };
  }
  return { mode: positional[0], json: flags.has('--json'), check: flags.has('--check') };
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    const args = parseArgs(process.argv.slice(2));
    if (args.error) {
      console.error(`${args.error}\n${USAGE}`);
      process.exit(2);
    }
    const report = await measure(args.mode);
    console.log(args.json ? JSON.stringify(report, null, 2) : formatReport(report));
    if (args.check && (report.candidates.length || report.staleOverrides.length)) process.exit(1);
  });
}
