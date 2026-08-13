// Flags runner-specific skill sigils in shared prose. Explicit skill invocation
// spells the same skill differently per runner — Claude Code `/build`, Codex
// `$build` — so a shared source that hard-codes one makes the other runner's
// generated copy wrong, and process output that hard-codes one tells half its
// readers to type something their runner does not have (issue #991). Shared
// surfaces name a skill bare; the sigil belongs only to that runner's own tree.
//
//   node tools/check-skill-reference-syntax.mjs          report violations, exit 1 on any
//   node tools/check-skill-reference-syntax.mjs --json   machine-readable findings
//
// The vocabulary is the registered skill names, so a renamed or new skill is
// covered without touching this file.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, capture, isMain, runMain } from './lib/proc.mjs';
import { DIRECT_PROVIDER_SKILLS } from './ruler/lib/direct-provider-skills.mjs';

// Trees that belong to exactly one runner, where that runner's sigil is the
// correct thing to write. Everything else — including the .ruler/ sources that
// generate both providers' copies, and .claude/rules + .claude/audit-conventions.md,
// which every agent is told to read — must stay neutral.
const CLAUDE_ONLY_PREFIXES = [
  '.claude/skills/',
  '.claude/skill-notes/',
  '.claude/cloud/',
  '.claude/hooks/',
  'docs/CLOUD/Claude.md',
];
const CODEX_ONLY_PREFIXES = ['.agents/'];

// A point-in-time record of a Claude-Code-only layout, quoting the slash names
// that layout shipped. Rewriting it would falsify the history, not fix a bug.
const HISTORICAL_PATHS = ['docs/adrs/0018-claude-native-knowledge-tiers.md'];

// Skill names that are also live app routes (`/api/*`, `/design`). A slash in
// front of these is overwhelmingly the route, and no wording rule can tell the
// two apart, so they are out of the vocabulary entirely.
const ROUTE_COLLIDING_NAMES = new Set(['api', 'design']);

const SCANNED_EXTENSIONS = ['.md', '.mjs', '.json'];

// A path, extension, regex escape, or namespaced token continuing past the name
// means the match was never a skill reference.
const NOT_A_REFERENCE_SUFFIX = /^[/\\:.-]/;

export function registeredSkillNames(root = ROOT) {
  const authored = readdirSync(join(root, '.ruler', 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const direct = DIRECT_PROVIDER_SKILLS.map(({ name }) => name);
  return [...new Set([...authored, ...direct])]
    .filter((name) => !ROUTE_COLLIDING_NAMES.has(name))
    .sort();
}

function runnerOf(file) {
  if (CLAUDE_ONLY_PREFIXES.some((prefix) => file.startsWith(prefix))) return 'claude';
  if (CODEX_ONLY_PREFIXES.some((prefix) => file.startsWith(prefix))) return 'codex';
  return 'shared';
}

// In prose a sigil opens a reference: the character before it is whitespace, a
// code fence, or an opening bracket — never another path character, and never
// the `*` of a glob (`android/**/build`). In .mjs that same shape also describes
// a regex literal (`toThrow(/release\.mjs/)`) and a division, so there the sigil
// must start a line or follow whitespace — which every user-facing string and
// comment does, and no regex literal argument does.
const openerFor = (file) => (file.endsWith('.mjs') ? /\s/ : /[^A-Za-z0-9_/.$*\\-]/);

export function findFileViolations(file, text, names) {
  const runner = runnerOf(file);
  if (HISTORICAL_PATHS.includes(file)) return [];

  const forbidden = [
    runner === 'claude' ? null : { sigil: '/', runner: 'Claude Code' },
    runner === 'codex' ? null : { sigil: '$', runner: 'Codex' },
  ].filter(Boolean);
  if (!forbidden.length) return [];

  const opener = openerFor(file);
  const violations = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const { sigil, runner: sigilRunner } of forbidden) {
      for (const name of names) {
        const token = `${sigil}${name}`;
        let at = line.indexOf(token);
        while (at !== -1) {
          const before = at === 0 ? '\n' : line[at - 1];
          const after = line.slice(at + token.length);
          if (opener.test(before) && !NOT_A_REFERENCE_SUFFIX.test(after) && !/^\w/.test(after)) {
            violations.push({ file, line: index + 1, token, sigilRunner, text: line.trim() });
          }
          at = line.indexOf(token, at + 1);
        }
      }
    }
  });
  return violations;
}

export function scannedFiles(root = ROOT) {
  return (
    capture('git', ['ls-files', '-z'], { cwd: root })
      .split('\0')
      .filter((file) => SCANNED_EXTENSIONS.some((ext) => file.endsWith(ext)))
      // Product source spells routes and directories, never skills, and
      // package-lock.json is generated registry data.
      .filter((file) => !file.startsWith('web/') && file !== 'package-lock.json')
  );
}

export function findViolations({
  root = ROOT,
  files = scannedFiles(root),
  names = registeredSkillNames(root),
  read = (file) => readFileSync(join(root, file), 'utf8'),
} = {}) {
  return files.flatMap((file) => findFileViolations(file, read(file), names));
}

export function report(violations, log = console) {
  if (!violations.length) {
    log.log('✓ Skill references: no runner-specific sigils in shared prose');
    return 0;
  }
  log.error(`✗ Skill references: ${violations.length} runner-specific sigil(s) in shared prose\n`);
  for (const { file, line, token, sigilRunner, text } of violations) {
    log.error(`  ${file}:${line}  ${token} is ${sigilRunner} syntax`);
    log.error(`    ${text}`);
  }
  log.error(
    '\nName the skill bare instead (the `build` skill), keeping any npm command alongside it.'
  );
  return 1;
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: { json: { type: 'boolean' } } });
  const violations = findViolations();
  if (values.json) {
    console.log(JSON.stringify(violations, null, 2));
    return violations.length ? 1 : 0;
  }
  return report(violations);
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    process.exitCode = main();
  });
}
