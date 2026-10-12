import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// All three trees, not just the .ruler/ source: a skill is loaded from the
// generated copy, and a link that resolves from the source can still be dead
// from .claude/ or .agents/ if the depths ever stop matching.
const SKILL_TREES = ['.ruler/skills', '.claude/skills', '.agents/skills'];

// The reference skills ADR-0107 turned into routers over docs/. Their whole job
// is pointing somewhere else, so a dead pointer is total failure, not a nit.
const REFERENCE_ROUTERS = ['adrs', 'api', 'architecture', 'mobile', 'profiling', 'testing'];

const markdownFiles = (dir) => {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith('.md')) out.push(p);
    }
  };
  walk(abs);
  return out;
};

// A target with no slash and no extension is a prose placeholder (`](url)`,
// `](…)`), not a path — the skills use those in example snippets.
const isPathTarget = (target) =>
  target.length > 0 &&
  !/^(https?:|mailto:|#)/.test(target) &&
  (target.includes('/') || target.includes('.'));

// Link syntax inside a fence or a code span is a sample of markup to write, not
// a link — Markdown does not resolve it, so neither does this guard. The
// `create-adr` skill quotes index rows this way.
const stripCode = (source) => source.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

const linkTargets = (source) =>
  [...stripCode(source).matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1].split('#')[0])
    .filter((t) => isPathTarget(t));

const allSkillMarkdown = SKILL_TREES.flatMap(markdownFiles);

describe('skill markdown link targets', () => {
  // Guards the extraction itself: if the regex or the tree layout changes so
  // nothing matches, the per-file expectation below passes vacuously.
  it('finds link targets to check', () => {
    expect(allSkillMarkdown.length).toBeGreaterThan(30);
    expect(
      allSkillMarkdown.flatMap((f) => linkTargets(readFileSync(f, 'utf8'))).length
    ).toBeGreaterThan(20);
  });

  it('resolves every relative link to a file that exists', () => {
    const dead = [];
    for (const file of allSkillMarkdown) {
      for (const target of linkTargets(readFileSync(file, 'utf8'))) {
        // Markdown resolves a relative link against the containing file, which
        // is also how a filesystem-backed skill runner resolves it. A repo-root
        // path like `docs/API.md` is therefore dead from every skill directory.
        if (!existsSync(resolve(dirname(file), target))) {
          dead.push(`${file.slice(ROOT.length)} -> ${target}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });
});

describe('reference skill routers', () => {
  const routerFiles = SKILL_TREES.flatMap((tree) =>
    REFERENCE_ROUTERS.map((name) => join(ROOT, tree, name, 'SKILL.md')).filter((f) => existsSync(f))
  );

  it('finds a router in every tree', () => {
    expect(routerFiles.length).toBe(SKILL_TREES.length * REFERENCE_ROUTERS.length);
  });

  // Linking is what opts a path into the existence check above. A doc named only
  // in a backtick span is unverifiable prose, and a router made of unverifiable
  // prose is exactly the failure this guard exists to prevent.
  it('names every docs/ file it points at as a link target', () => {
    const unlinked = [];
    for (const file of routerFiles) {
      const source = readFileSync(file, 'utf8');
      const targets = new Set(linkTargets(source).map((t) => t.replace(/^(\.\.\/)+/, '')));
      for (const [mention] of source.matchAll(/docs\/[A-Za-z0-9._/-]+\.md/g)) {
        if (!targets.has(mention)) unlinked.push(`${file.slice(ROOT.length)} -> ${mention}`);
      }
    }
    expect(unlinked).toEqual([]);
  });
});
