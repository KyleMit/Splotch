// Mirror .ruler/skill-notes/ into every agent directory, the way ruler already
// mirrors .ruler/skills/ (ADR-0058).
//
// ruler itself only knows how to copy skills and subagents, so this runs as a
// post-apply step inside `npm run ruler:apply`. Skill notes are not a skill —
// putting them under .ruler/skills/<name>/ would file the design history inside
// the very skill it is deliberately kept out of — so they get their own top-level
// source tree and their own copier.
//
// The copy is exact in both directions for generated notes. Direct provider
// notes are preserved in place.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/proc.mjs';

process.chdir(ROOT);

const SOURCE = join('.ruler', 'skill-notes');
const TARGETS = [join('.claude', 'skill-notes'), join('.agents', 'skill-notes')];
const DIRECT_NOTES = new Set(['burn-down-audits.md']);
const SOURCE_SUFFIX = '.md.template';

const noteOutputName = (file) => file.slice(0, -'.template'.length);

const entries = existsSync(SOURCE) ? readdirSync(SOURCE) : [];

// Sources carry the same .md.template suffix the skill forks require, for the
// same reason: ruler's recursive rule loader concatenates every .md under
// .ruler/ into the root instruction files. A plain .md here would publish the
// design history into every session's context window — the one thing this tree
// exists to prevent.
const stray = entries.filter((file) => file.endsWith('.md'));
if (stray.length) {
  throw new Error(
    `Skill notes must end in ${SOURCE_SUFFIX}, or ruler concatenates them into CLAUDE.md and ` +
      `AGENTS.md: ${stray.map((file) => join(SOURCE, file)).join(', ')}`
  );
}

const sourceFiles = entries.filter((file) => file.endsWith(SOURCE_SUFFIX));
const generated = new Set(sourceFiles.map(noteOutputName));

for (const target of TARGETS) {
  mkdirSync(target, { recursive: true });

  for (const stale of readdirSync(target).filter(
    (file) => !generated.has(file) && !DIRECT_NOTES.has(file)
  )) {
    rmSync(join(target, stale), { force: true });
  }

  for (const file of sourceFiles) {
    const body = readFileSync(join(SOURCE, file), 'utf8');
    // Same marker ruler writes onto its own generated files, so a copy found in
    // the wild names the file to edit instead of inviting an in-place fix.
    writeFileSync(
      join(target, noteOutputName(file)),
      `<!-- Source: ${join(SOURCE, file)} -->\n\n${body}`
    );
  }
}

console.log(`[skill-notes] mirrored ${sourceFiles.length} file(s) to ${TARGETS.join(' and ')}`);
