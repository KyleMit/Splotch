// Mirror .ruler/skill-notes/ into every agent directory, the way ruler already
// mirrors .ruler/skills/ (ADR-0058).
//
// ruler itself only knows how to copy skills and subagents, so this runs as a
// post-apply step inside `npm run ruler:apply`. Skill notes are not a skill —
// putting them under .ruler/skills/<name>/ would file the design history inside
// the very skill it is deliberately kept out of — so they get their own top-level
// source tree and their own copier.
//
// The copy is exact in both directions: files that no longer exist in the source
// are deleted from the targets, so removing a note removes its copies.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/utils.mjs';

process.chdir(ROOT);

const SOURCE = join('.ruler', 'skill-notes');
const TARGETS = [join('.claude', 'skill-notes'), join('.agents', 'skill-notes')];

const sourceFiles = existsSync(SOURCE) ? readdirSync(SOURCE).filter((f) => f.endsWith('.md')) : [];

for (const target of TARGETS) {
  mkdirSync(target, { recursive: true });

  for (const stale of readdirSync(target).filter((f) => !sourceFiles.includes(f))) {
    rmSync(join(target, stale), { force: true });
  }

  for (const file of sourceFiles) {
    const body = readFileSync(join(SOURCE, file), 'utf8');
    // Same marker ruler writes onto its own generated files, so a copy found in
    // the wild names the file to edit instead of inviting an in-place fix.
    writeFileSync(join(target, file), `<!-- Source: ${join(SOURCE, file)} -->\n\n${body}`);
  }
}

console.log(`[skill-notes] mirrored ${sourceFiles.length} file(s) to ${TARGETS.join(' and ')}`);
