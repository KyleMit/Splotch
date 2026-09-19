// @vitest-environment node
import ts from 'typescript';
import { describe, it, expect } from 'vitest';
import { DEFERRED_ICON_NAMES, deferredIcons } from './deferredIcons';
import { deferredIconMarkup } from './iconRegistry.svelte';
import { iconNameFromPath, type CommonIconName } from './iconTypes';

// The split between web/src/lib/icons/ and web/src/lib/icons/deferred/ is what
// keeps the deferred set off the startup path (ADR-0164), and nothing about
// rendering <Icon name="…"> says which side a name is on. These guards close
// the two ways the split silently breaks: a deferred icon a consumer renders
// before the registry is filled paints nothing, and a startup module that
// names one drags the whole deferred chunk back into the modulepreload set
// (web/tests/startup-bundle.spec.ts pins that side from the build output).
const deferredSvgs = import.meta.glob<string>('../icons/deferred/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const startupSvgs = import.meta.glob<string>('../icons/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

// Every non-test source file, minus the two modules that enumerate the icons
// themselves and so name every deferred icon by construction.
const sources = import.meta.glob<string>(
  [
    '../../**/*.svelte',
    '../../**/*.ts',
    '!../../lib/components/Icon.svelte',
    '!../../lib/components/deferredIcons.ts',
    '!../../**/*.d.ts',
    '!../../**/*.test.ts',
  ],
  { eager: true, query: '?raw', import: 'default' }
);

// Files that name deferred icons without rendering anything: the per-icon-part
// token map keys CSS custom properties by icon name, and the icon that paints
// them imports the registry itself.
const NON_RENDERING_REFERENCES = new Set(['../design/iconTokens.ts']);

// Both the side-effect form (`import '$lib/components/deferredIcons'`) and a
// named import count; either evaluates the module before the importer's body.
// Imports are read from the parsed script rather than matched as text, so an
// import inside any kind of comment does not count and neither does
// `import type`, which TypeScript erases without registering anything.
const REGISTRY_SPECIFIER_RE = /^(?:\$lib\/components|\.{1,2}(?:\/[\w.-]+)*)\/deferredIcons$/;

const scriptBlocks = (path: string, src: string) =>
  path.endsWith('.svelte')
    ? [...src.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(
        ([, code]) => code
      )
    : [src];

const importsRegistry = (path: string, src: string) =>
  scriptBlocks(path, src).some((code) =>
    ts
      .createSourceFile('script.ts', code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
      .statements.some(
        (statement) =>
          ts.isImportDeclaration(statement) &&
          !statement.importClause?.isTypeOnly &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          REGISTRY_SPECIFIER_RE.test(statement.moduleSpecifier.text)
      )
  );

const namesIn = (src: string) =>
  DEFERRED_ICON_NAMES.filter((name) => new RegExp(`(['"])${name}\\1`).test(src));

describe('deferred icon registry', () => {
  // Positive controls for the import matcher: the guard below is only as good
  // as this parse, so the shapes it must accept and reject are pinned here.
  it.each([
    ['x.ts', "import '$lib/components/deferredIcons';"],
    ['x.ts', "import { DEFERRED_ICON_NAMES } from '$lib/components/deferredIcons';"],
    ['x.ts', "import { deferredIcons } from './deferredIcons';"],
    ['x.ts', "import { deferredIcons } from '../components/deferredIcons';"],
    ['x.ts', "// releases/*.md\nimport '$lib/components/deferredIcons';\n/* later */"],
    ['x.svelte', '<script lang="ts">\n  import \'$lib/components/deferredIcons\';\n</script>'],
  ])('counts %s %s as a registry import', (path, src) => {
    expect(importsRegistry(path, src)).toBe(true);
  });

  it.each([
    ['x.ts', "import type { deferredIcons } from './deferredIcons';"],
    ['x.ts', "// import '$lib/components/deferredIcons';"],
    ['x.ts', "/*\nimport '$lib/components/deferredIcons';\n*/"],
    ['x.ts', "import '$lib/components/deferredIconsExtra';"],
    ['x.ts', "import { deferredIcons } from '$lib/components/deferredIcons.test';"],
    ['x.svelte', "<!--\n<script>import '$lib/components/deferredIcons';</script>\n-->"],
    ['x.svelte', "<script>\n/* import '$lib/components/deferredIcons'; */\n</script>"],
  ])('does not count %s %s as a registry import', (path, src) => {
    expect(importsRegistry(path, src)).toBe(false);
  });

  it('registers every deferred SVG under its basename on import', () => {
    expect(DEFERRED_ICON_NAMES).toEqual(Object.keys(deferredSvgs).map(iconNameFromPath).sort());
    for (const [path, svg] of Object.entries(deferredSvgs)) {
      // The deferred directory never holds the mascot, so the wider union narrows.
      const name = iconNameFromPath(path) as CommonIconName;
      expect(deferredIcons[name]).toBe(svg);
      expect(deferredIconMarkup(name)).toBe(svg);
    }
  });

  it('keeps the startup and deferred sets disjoint', () => {
    const startupNames = new Set(Object.keys(startupSvgs).map(iconNameFromPath));
    expect(DEFERRED_ICON_NAMES.filter((name) => startupNames.has(name))).toEqual([]);
  });

  it('exempts only files that still name a deferred icon', () => {
    for (const path of NON_RENDERING_REFERENCES) {
      expect(sources, `${path} is no longer a source file`).toHaveProperty(path);
      expect(namesIn(sources[path]), `${path} names no deferred icon`).not.toEqual([]);
    }
  });

  describe('every source file that names a deferred icon imports the registry module', () => {
    const consumers = Object.entries(sources)
      .filter(([path]) => !NON_RENDERING_REFERENCES.has(path))
      .map(([path, src]) => [path, namesIn(src)] as const)
      .filter(([, names]) => names.length > 0);

    it('finds the known consumers', () => {
      expect(consumers.length).toBeGreaterThan(10);
    });

    it.each(consumers)('%s', (path, names) => {
      expect(
        importsRegistry(path, sources[path]),
        `${path} renders ${names.join(', ')} but never imports $lib/components/deferredIcons, so those icons are unregistered when it first renders`
      ).toBe(true);
    });
  });

  describe('every side-effect import of the registry module still names a deferred icon', () => {
    const sideEffectImporters = Object.entries(sources)
      .filter(
        ([path, src]) =>
          importsRegistry(path, src) && /import ['"][^'"]*\/deferredIcons['"]/.test(src)
      )
      .map(([path]) => path);

    it.each(sideEffectImporters)('%s', (path) => {
      expect(
        namesIn(sources[path]),
        `${path} imports the deferred icon registry but names no deferred icon — drop the import`
      ).not.toEqual([]);
    });
  });
});
