// @vitest-environment node
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
// `import type` is erased by TypeScript and registers nothing, so it must not
// count, and the line-start anchor keeps a commented-out import from counting.
const REGISTRY_IMPORT_RE =
  /^\s*import (?!type\s)(?:[^;]*? from )?['"](?:\$lib\/components|\.{1,2}(?:\/[\w.-]+)*)\/deferredIcons['"]/m;

const namesIn = (src: string) =>
  DEFERRED_ICON_NAMES.filter((name) => new RegExp(`(['"])${name}\\1`).test(src));

describe('deferred icon registry', () => {
  // Positive controls for the import matcher: the guard below is only as good
  // as this regex, so the shapes it must accept and reject are pinned here.
  it.each([
    "import '$lib/components/deferredIcons';",
    "  import '$lib/components/deferredIcons';",
    "import { DEFERRED_ICON_NAMES } from '$lib/components/deferredIcons';",
    "import { deferredIcons } from './deferredIcons';",
    "import { deferredIcons } from '../components/deferredIcons';",
  ])('counts %s as a registry import', (line) => {
    expect(REGISTRY_IMPORT_RE.test(line)).toBe(true);
  });

  it.each([
    "import type { deferredIcons } from './deferredIcons';",
    "// import '$lib/components/deferredIcons';",
    "import '$lib/components/deferredIconsExtra';",
    "import { deferredIcons } from '$lib/components/deferredIcons.test';",
  ])('does not count %s as a registry import', (line) => {
    expect(REGISTRY_IMPORT_RE.test(line)).toBe(false);
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
        REGISTRY_IMPORT_RE.test(sources[path]),
        `${path} renders ${names.join(', ')} but never imports $lib/components/deferredIcons, so those icons are unregistered when it first renders`
      ).toBe(true);
    });
  });

  describe('every side-effect import of the registry module still names a deferred icon', () => {
    const sideEffectImporters = Object.entries(sources)
      .filter(([, src]) => /import ['"][^'"]*\/deferredIcons['"]/.test(src))
      .map(([path]) => path);

    it.each(sideEffectImporters)('%s', (path) => {
      expect(
        namesIn(sources[path]),
        `${path} imports the deferred icon registry but names no deferred icon — drop the import`
      ).not.toEqual([]);
    });
  });
});
