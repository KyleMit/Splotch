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

// This guard and its suite are the two files that have to spell the form they
// reject — one to explain it, one to prove it is caught — so their own
// occurrences are the point rather than a defect.
const SELF_REFERENTIAL_PATHS = [
  'tools/check-skill-reference-syntax.mjs',
  'tools/tests/skill-reference-syntax.test.mjs',
];

// Skill names that are also live app routes (`/api/*`, `/design`). A slash in
// front of these is overwhelmingly the route, and no wording rule can tell the
// two apart, so they are out of the vocabulary entirely.
const ROUTE_COLLIDING_NAMES = new Set(['api', 'design']);

const SCANNED_EXTENSIONS = ['.md', '.mjs', '.json'];

// A path, extension, regex escape, namespaced token, or further word character
// continuing past the name means the match was never a skill reference. One
// character is the whole test, so a hit on a long line costs a lookup instead
// of a substring of everything after it.
const CONTINUES_PAST_THE_NAME = /[/\\:.\w-]/;

// Characters that are ordinary in a skill name but meaningful inside a regex
// alternation.
const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\-]/g;

// One alternation over the whole vocabulary, so a line costs a single regex
// pass rather than one indexOf per sigil per name. The sweep reads tens of
// megabytes of tracked files, and scanning every line of them once per name is
// what pushed this check past its own suite's timeout twice — first when the
// desktop rotation corpus landed (stack 1353), then again once the
// page-inventory captures did. Longest name first, because an alternation
// takes the first branch that matches rather than the longest.
//
// Keyed on the vocabulary's contents rather than on the caller's array, so a
// caller that builds its list up across calls gets a matcher for the list it
// actually holds. Keying on array identity is faster and wrong in the one
// direction this file cannot afford: a stale matcher reports no violation for a
// name added after the first call, and a guard that silently finds nothing
// looks exactly like a guard that passed.
const matchers = new Map();
function candidateMatcher(names) {
  const ordered = [...names].sort((a, b) => b.length - a.length);
  const signature = ordered.join('\u0000');
  const cached = matchers.get(signature);
  if (cached) return cached;
  const alternation = ordered.map((name) => name.replace(REGEX_METACHARACTERS, '\\$&')).join('|');
  const matcher = new RegExp(`[/$](?:${alternation})`, 'g');
  matchers.set(signature, matcher);
  return matcher;
}

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

// A sigil opens a reference when the character before it is whitespace, a code
// fence, or an opening bracket — never another path character, and never the
// `*` of a glob (`android/**/build`).
const OPENER = /[^A-Za-z0-9_/.$*\\-]/;

// Characters a `/` can follow and still be division rather than a regex literal:
// anything that ends a value.
const ENDS_A_VALUE = /[)\]}\w'"`]/;
// …except where the word before it is a keyword, which cannot end a value.
const REGEX_AFTER_KEYWORD = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'case',
  'do',
  'else',
  'yield',
  'await',
]);

const at = (stack) => stack.length - 1;

// A skill reference in a script only ever lives in a string literal or a
// comment, because that is where its user-facing text lives. Everything else a
// `/` can open there is syntax — a regex literal (`toThrow(/cut-release\.mjs/)`) or
// a division. So the matcher runs over a copy with every code region blanked to
// spaces, preserving line and column positions. Masking rather than narrowing
// what counts as an opener is what keeps punctuation-delimited output in scope:
// `fail('Cut the release first (/cut-release), then build.')` is prose the guard
// must catch, and it looks exactly like a regex argument until you know the
// `(` is inside a string.
export function maskCodeOutsideText(source) {
  const out = [];
  const keep = (index) => out.push(source[index]);
  const blank = (index) => out.push(source[index] === '\n' ? '\n' : ' ');

  // One entry per open template literal, counting the `{` depth inside its
  // current `${ … }` so a `}` closing an interpolation is told apart from one
  // closing an object literal.
  const templateBraceDepth = [];
  let inTemplateText = false;
  let previous = '';
  let word = '';

  const noteCode = (char) => {
    if (/\s/.test(char)) return;
    previous = char;
    word = /\w/.test(char) ? word + char : '';
  };

  let i = 0;
  while (i < source.length) {
    const char = source[i];

    if (inTemplateText) {
      if (char === '\\') {
        blank(i);
        if (i + 1 < source.length) blank(i + 1);
        i += 2;
      } else if (char === '`') {
        blank(i);
        templateBraceDepth.pop();
        inTemplateText = false;
        previous = '`';
        word = '';
        i += 1;
      } else if (char === '$' && source[i + 1] === '{') {
        blank(i);
        blank(i + 1);
        inTemplateText = false;
        previous = '{';
        word = '';
        i += 2;
      } else {
        keep(i);
        i += 1;
      }
      continue;
    }

    if (char === '/' && source[i + 1] === '/') {
      blank(i);
      blank(i + 1);
      i += 2;
      while (i < source.length && source[i] !== '\n') keep(i++);
      continue;
    }

    if (char === '/' && source[i + 1] === '*') {
      blank(i);
      blank(i + 1);
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) keep(i++);
      if (i < source.length) {
        blank(i);
        blank(i + 1);
        i += 2;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      blank(i++);
      while (i < source.length && source[i] !== char && source[i] !== '\n') {
        if (source[i] === '\\') {
          blank(i);
          if (i + 1 < source.length) blank(i + 1);
          i += 2;
          continue;
        }
        keep(i++);
      }
      if (i < source.length && source[i] === char) blank(i++);
      previous = char;
      word = '';
      continue;
    }

    if (char === '`') {
      blank(i++);
      templateBraceDepth.push(0);
      inTemplateText = true;
      continue;
    }

    // Regex bodies are blanked whole, quotes included, so a `/don't/` cannot
    // open a phantom string that un-masks the code after it.
    if (char === '/' && (!ENDS_A_VALUE.test(previous) || REGEX_AFTER_KEYWORD.has(word))) {
      blank(i++);
      let inCharClass = false;
      while (i < source.length && source[i] !== '\n') {
        if (source[i] === '\\') {
          blank(i);
          if (i + 1 < source.length) blank(i + 1);
          i += 2;
          continue;
        }
        if (source[i] === '[') inCharClass = true;
        else if (source[i] === ']') inCharClass = false;
        else if (source[i] === '/' && !inCharClass) break;
        blank(i++);
      }
      if (i < source.length && source[i] === '/') blank(i++);
      previous = '/';
      word = '';
      continue;
    }

    if (char === '{' && templateBraceDepth.length) templateBraceDepth[at(templateBraceDepth)] += 1;
    if (char === '}' && templateBraceDepth.length) {
      if (templateBraceDepth[at(templateBraceDepth)] === 0) {
        blank(i++);
        inTemplateText = true;
        continue;
      }
      templateBraceDepth[at(templateBraceDepth)] -= 1;
    }

    blank(i++);
    noteCode(char);
  }
  return out.join('');
}

export function findFileViolations(file, text, names) {
  const runner = runnerOf(file);
  if (HISTORICAL_PATHS.includes(file)) return [];
  if (!names.length) return [];

  const forbiddenSigils = new Map(
    [
      runner === 'claude' ? null : ['/', 'Claude Code'],
      runner === 'codex' ? null : ['$', 'Codex'],
    ].filter(Boolean)
  );
  if (!forbiddenSigils.size) return [];

  const matcher = candidateMatcher(names);
  // Masking only ever blanks regions, so text holding no candidate at all holds
  // none after masking either. Running the prefilter on the raw text spares the
  // overwhelming majority of files — which name no skill anywhere — both the
  // mask and the line split.
  matcher.lastIndex = 0;
  if (!matcher.test(text)) return [];

  const searchable = file.endsWith('.mjs') ? maskCodeOutsideText(text) : text;
  const sourceLines = text.split(/\r?\n/);
  const violations = [];
  searchable.split(/\r?\n/).forEach((line, index) => {
    matcher.lastIndex = 0;
    let match = matcher.exec(line);
    while (match !== null) {
      const token = match[0];
      const sigilRunner = forbiddenSigils.get(token[0]);
      const before = match.index === 0 ? '\n' : line[match.index - 1];
      const after = line[match.index + token.length];
      if (sigilRunner && OPENER.test(before) && !(after && CONTINUES_PAST_THE_NAME.test(after))) {
        violations.push({
          file,
          line: index + 1,
          token,
          sigilRunner,
          text: sourceLines[index].trim(),
        });
      }
      match = matcher.exec(line);
    }
  });
  return violations;
}

export function scannedFiles(root = ROOT) {
  return (
    capture('git', ['ls-files', '-z'], { cwd: root })
      .split('\0')
      .filter((file) => SCANNED_EXTENSIONS.some((ext) => file.endsWith(ext)))
      // Product source spells routes and directories, never skills. The lockfile
      // needs no exemption of its own: pnpm-lock.yaml is not a scanned extension.
      .filter((file) => !file.startsWith('web/'))
      // Captured measurement artifacts are frame tables and event tuples, not
      // prose — no skill reference can originate there, and sweeping megabytes
      // of evidence JSON is what pushed this check past its own test timeout
      // when the desktop rotation corpus landed (stack 1353). The exclusion is
      // exactly the bulky artifacts: the READMEs beside them AND the corpus
      // index.json files stay in the sweep, because an index's why/note/finding
      // fields are human-authored shared prose that can carry a sigil as
      // readily as any doc.
      .filter(
        (file) =>
          !(
            file.startsWith('perf-profiles/') &&
            file.endsWith('.json') &&
            !file.endsWith('/index.json')
          )
      )
      .filter((file) => !SELF_REFERENTIAL_PATHS.includes(file))
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
