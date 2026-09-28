import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// The reconcile-with-main survey's whole job is telling an agent which files to
// read as merged. A rename splits one logical file across two names, and git
// merges across that split in silence — it follows the rename and lands the
// branch's edits in the new path — so an overlap keyed on the new name alone
// drops the file from the both-sides list, which is precisely the file most in
// need of a read. Reproduced on a temporary repo while reviewing the skill's
// first version: upstream renamed foo.js → bar.js, the branch edited foo.js,
// the merge was clean, and the survey reported no overlap at all.
//
// Every generated copy is exercised, because each one is a script an agent is
// told to run and the isMain import is relative — it has to resolve from all of
// them. Importing also proves the isMain guard holds: without it, loading the
// module would shell out to git.
const repoRoot = join(import.meta.dirname, '..', '..');
const COPIES = [
  '.ruler/skills/reconcile-with-main/survey.mjs',
  '.claude/skills/reconcile-with-main/survey.mjs',
  '.agents/skills/reconcile-with-main/survey.mjs',
];

const modules = await Promise.all(
  COPIES.map(async (path) => ({
    path,
    module: await import(pathToFileURL(join(repoRoot, path)).href),
  }))
);

describe.each(modules)('reconcile-with-main survey $path', ({ path, module }) => {
  // The base is origin/main in the survey, in the merge, and in the ADR-log
  // check, so there is no coherent alternate-base mode to select. An invocation
  // that asks for one has to fail rather than survey main and be believed.
  it('rejects an unknown option instead of surveying main anyway', () => {
    const run = spawnSync(process.execPath, [join(repoRoot, path), '--base', 'release'], {
      encoding: 'utf8',
    });

    expect(run.status).toBe(2);
    expect(run.stderr).toContain('Unknown option(s): --base release');
  });

  const { classifyChanges, parseNameStatus, changedPaths } = module;
  const classify = (upstream, local) =>
    classifyChanges(parseNameStatus(upstream), parseNameStatus(local));

  describe('parseNameStatus', () => {
    it('reads the second path column only when git emits one', () => {
      expect(parseNameStatus('M\tsrc/a.ts\nR096\tsrc/old.ts\tsrc/new.ts\nD\tsrc/gone.ts')).toEqual([
        { status: 'M', from: 'src/a.ts', to: 'src/a.ts' },
        { status: 'R096', from: 'src/old.ts', to: 'src/new.ts' },
        { status: 'D', from: 'src/gone.ts', to: 'src/gone.ts' },
      ]);
    });

    it('returns nothing for an empty diff', () => {
      expect(parseNameStatus('')).toEqual([]);
    });
  });

  describe('changedPaths', () => {
    it('gives a rename both of its names and everything else just one', () => {
      expect(changedPaths({ status: 'R100', from: 'old.ts', to: 'new.ts' })).toEqual([
        'old.ts',
        'new.ts',
      ]);
      expect(changedPaths({ status: 'M', from: 'a.ts', to: 'a.ts' })).toEqual(['a.ts']);
    });
  });

  describe('classifyChanges', () => {
    it('counts an upstream rename of a file the branch edited as a both-sides change', () => {
      const result = classify('R100\tfoo.js\tbar.js', 'M\tfoo.js');

      expect(result.bothSides).toEqual([{ path: 'bar.js', previousPath: 'foo.js' }]);
      expect(result.upstreamOnly).toEqual([]);
      expect(result.localOnly).toEqual([]);
    });

    it('counts an upstream edit of a file the branch renamed as a both-sides change', () => {
      const result = classify('M\tfoo.js', 'R090\tfoo.js\tbaz.js');

      expect(result.bothSides).toEqual([{ path: 'foo.js' }]);
      expect(result.localOnly).toEqual([]);
    });

    it('pairs a rename on both sides through the name they share', () => {
      const result = classify('R100\tfoo.js\tupstream.js', 'R100\tfoo.js\tlocal.js');

      expect(result.bothSides).toEqual([{ path: 'upstream.js', previousPath: 'foo.js' }]);
      expect(result.upstreamOnly).toEqual([]);
      expect(result.localOnly).toEqual([]);
    });

    it('keeps an unrelated upstream rename in the upstream-only bucket, annotated', () => {
      const result = classify('R100\tfoo.js\tbar.js', 'M\tunrelated.js');

      expect(result.bothSides).toEqual([]);
      expect(result.upstreamOnly).toEqual([{ path: 'bar.js', previousPath: 'foo.js' }]);
      expect(result.localOnly).toEqual([{ path: 'unrelated.js' }]);
    });

    it('counts an upstream deletion of a file the branch edited as a both-sides change', () => {
      const result = classify('D\tgone.ts', 'M\tgone.ts');

      expect(result.bothSides).toEqual([{ path: 'gone.ts' }]);
      expect(result.upstreamOnly).toEqual([]);
    });

    it('separates disjoint changes and sorts each bucket by path', () => {
      const result = classify('M\tsrc/b.ts\nM\tsrc/a.ts', 'M\tweb/z.ts\nM\tweb/y.ts');

      expect(result.bothSides).toEqual([]);
      expect(result.upstreamOnly).toEqual([{ path: 'src/a.ts' }, { path: 'src/b.ts' }]);
      expect(result.localOnly).toEqual([{ path: 'web/y.ts' }, { path: 'web/z.ts' }]);
    });

    it('reports only renames and deletions as the stranded-call-site candidates', () => {
      const result = classify('R100\ta.ts\tb.ts\nD\tc.ts\nM\td.ts\nA\te.ts', '');

      expect(result.movedOrDeleted).toEqual([
        { status: 'R100', from: 'a.ts', to: 'b.ts' },
        { status: 'D', from: 'c.ts', to: 'c.ts' },
      ]);
    });
  });

  // The relation verdict decides whether a merge gets the full semantic pass.
  // Its value is a quiet "unrelated" when nothing links the two sides, so each
  // way of being linked must raise it, and an unlinked pair must not.
  describe('relate', () => {
    const { relate, importSpecifiers, resolveSpecifier, moduleKey } = module;
    const verdict = (upstream, local, localSources) => {
      const up = parseNameStatus(upstream);
      const { bothSides } = classifyChanges(up, parseNameStatus(local));
      return relate({ upstream: up, bothSides, localSources });
    };

    it('reads static, side-effect, re-export, and dynamic import specifiers', () => {
      const source = [
        "import { a } from '$lib/a';",
        "import './side.css';",
        "export { b } from '../b.ts';",
        "const c = await import('./c');",
      ].join('\n');

      expect(importSpecifiers(source)).toEqual(['$lib/a', './side.css', '../b.ts', './c']);
    });

    it('resolves $lib and relative specifiers to repo paths and ignores packages', () => {
      expect(resolveSpecifier('$lib/state/x.svelte', 'web/src/routes/+page.svelte')).toBe(
        'web/src/lib/state/x.svelte'
      );
      expect(resolveSpecifier('../lib/y', 'web/src/routes/page.ts')).toBe('web/src/lib/y');
      expect(resolveSpecifier('svelte', 'web/src/routes/page.ts')).toBeNull();
    });

    it('names one module whatever extension or index form a path uses', () => {
      expect(moduleKey('web/src/lib/a.svelte.ts')).toBe('web/src/lib/a');
      expect(moduleKey('web/src/lib/b/index.ts')).toBe('web/src/lib/b');
      expect(moduleKey('web/src/lib/C.svelte')).toBe('web/src/lib/C');
    });

    it('calls disjoint changes with no shared import or convention unrelated', () => {
      const result = verdict('M\tweb/src/lib/a.ts', 'M\tweb/src/lib/b.ts', [
        { path: 'web/src/lib/b.ts', source: "import { c } from './c';" },
      ]);

      expect(result).toEqual({ relation: 'unrelated', reasons: [] });
    });

    it('calls a branch that imports an upstream-changed module adjacent', () => {
      const result = verdict('M\tweb/src/lib/a.ts', 'M\tweb/src/lib/b.ts', [
        { path: 'web/src/lib/b.ts', source: "import { a } from '$lib/a';" },
      ]);

      expect(result.relation).toBe('adjacent');
      expect(result.reasons[0].why).toContain('imports web/src/lib/a.ts');
    });

    it('calls a branch that imports a module upstream moved or deleted coupled', () => {
      const result = verdict('R100\tweb/src/lib/a.ts\tweb/src/lib/z.ts', 'M\tweb/src/lib/b.ts', [
        { path: 'web/src/lib/b.ts', source: "import { a } from './a';" },
      ]);

      expect(result.relation).toBe('coupled');
    });

    it('calls a shared file or a changed convention source coupled', () => {
      expect(verdict('M\tweb/src/lib/a.ts', 'M\tweb/src/lib/a.ts', []).relation).toBe('coupled');
      expect(verdict('M\teslint.config.js', 'M\tweb/src/lib/b.ts', []).relation).toBe('coupled');
    });
  });
});
