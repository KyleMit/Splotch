// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { NON_RENDERABLE_ICONS, iconNameFromPath } from './iconTypes';

// Guards against orphaned icon assets: an SVG nobody renders still inflates the
// generated IconName union and the eager glob in Icon.svelte, and nothing else
// would ever notice. Mirror Icon.svelte's own glob — the exclusions repeat
// NON_RENDERABLE_ICONS from iconTypes.ts, which is authoritative, but Vite
// resolves import.meta.glob statically so the patterns can't be built from it.
const svgs = import.meta.glob<string>(['../icons/*.svg', '!../icons/splotchy.svg'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

// The unfiltered set, so the guard below can prove the literals above really do
// exclude NON_RENDERABLE_ICONS and nothing else.
const allSvgs = import.meta.glob<string>('../icons/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

// The other two files carrying the same exclusion literal, read as text so the
// guard can check their patterns too. They need their own glob: `sources` below
// excludes Icon.svelte and every *.test.ts.
const globLiteralSources = import.meta.glob<string>(['./Icon.svelte', './Icon.svelte.test.ts'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

// Icon.svelte and the generated union enumerate every icon, so they'd vouch for
// any orphan; test files are excluded so a test can't be the only thing keeping
// an icon alive.
const sources = import.meta.glob<string>(
  [
    '../../**/*.svelte',
    '../../**/*.ts',
    '!../../lib/components/Icon.svelte',
    '!../../**/*.d.ts',
    '!../../**/*.test.ts',
  ],
  { eager: true, query: '?raw', import: 'default' }
);

// Pre-existing orphans, grandfathered rather than deleted here — this guard's
// job is to stop *new* orphans appearing. chevron-up: the drawer's chevron is a
// single chevron-right rotated with CSS.
const KNOWN_ORPHANS = ['chevron-up'];

// Only a quoted string literal counts — `name="close"`, `icon: 'theme-auto'`,
// the ERASER_SIZE_ICON maps. That's the form every real reference takes, and
// requiring the quotes is what makes the guard work at all for icons named
// after ordinary English words: a bare-substring scan for `close`, `download`,
// or `home` is satisfied forever by unrelated code and prose, so those icons
// could never be flagged. The closing quote also stops `'trash-closed'` from
// vouching for a re-added trash.svg.
const isReferenced = (name: string) => {
  const literal = new RegExp(`(['"])${name}\\1`);
  return Object.values(sources).some((src) => literal.test(src));
};

// Without this, NON_RENDERABLE_ICONS would be authoritative only by comment:
// excluding a second icon in the glob literals while forgetting the constant
// leaves CommonIconName admitting a name <Icon> can no longer render, and the
// only symptom is an empty icon at runtime. All three literals are covered —
// this file's by differencing the two globs against the icon directory, the
// other two by reading their source and pulling out the `!` patterns.
describe('NON_RENDERABLE_ICONS matches the glob literals', () => {
  it('accounts for exactly the icons the exclusion globs drop', () => {
    const excluded = new Set<string>(NON_RENDERABLE_ICONS);
    expect(
      Object.keys(allSvgs)
        .map(iconNameFromPath)
        .filter((name) => !excluded.has(name))
        .sort()
    ).toEqual(Object.keys(svgs).map(iconNameFromPath).sort());
  });

  it('resolves both glob-literal source files', () => {
    expect(Object.keys(globLiteralSources).sort()).toEqual([
      './Icon.svelte',
      './Icon.svelte.test.ts',
    ]);
  });

  it.each(Object.keys(globLiteralSources))('%s excludes exactly those icons', (path) => {
    const excluded = [...globLiteralSources[path].matchAll(/!\.\.\/icons\/([\w-]+)\.svg/g)].map(
      ([, name]) => name
    );
    expect(excluded.sort()).toEqual([...NON_RENDERABLE_ICONS].sort());
  });
});

describe('no orphan icons', () => {
  it.each(Object.keys(svgs).map(iconNameFromPath).sort())(
    '%s: is referenced from source',
    (name) => {
      if (KNOWN_ORPHANS.includes(name)) return;
      expect(
        isReferenced(name),
        `${name}.svg is never referenced by name — delete it, or render it via <Icon name="${name}">`
      ).toBe(true);
    }
  );

  it.each(KNOWN_ORPHANS)(
    '%s: is still an orphan, so the carve-out still earns its place',
    (name) => {
      expect(isReferenced(name)).toBe(false);
    }
  );
});
