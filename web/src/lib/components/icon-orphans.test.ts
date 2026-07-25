// @vitest-environment node
import { describe, it, expect } from 'vitest';

// Guards against orphaned icon assets: an SVG nobody renders still inflates the
// generated IconName union and the eager glob in Icon.svelte, and nothing else
// would ever notice. Mirror Icon.svelte's own glob (splotchy is excluded there
// too — it's consumed structurally, not through <Icon name=…>).
const svgs = import.meta.glob<string>(['../icons/*.svg', '!../icons/splotchy.svg'], {
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
// single chevron-right rotated with CSS. settings: nothing renders it; the only
// mentions of the word are prose about the `settings` state module.
const KNOWN_ORPHANS = ['chevron-up', 'settings'];

const iconName = (path: string) => (path.split('/').pop() ?? '').replace('.svg', '');

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

describe('no orphan icons', () => {
  it.each(Object.keys(svgs).map(iconName).sort())('%s: is referenced from source', (name) => {
    if (KNOWN_ORPHANS.includes(name)) return;
    expect(
      isReferenced(name),
      `${name}.svg is never referenced by name — delete it, or render it via <Icon name="${name}">`
    ).toBe(true);
  });

  it.each(KNOWN_ORPHANS)(
    '%s: is still an orphan, so the carve-out still earns its place',
    (name) => {
      expect(isReferenced(name)).toBe(false);
    }
  );
});
