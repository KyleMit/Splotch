import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { SPLOTCHY_ICON_NAME } from '../../experiments/native-architecture/src/rsdDrawing/icons.generated.ts';

// native-section-icon-mounted.test.mjs drives the native routing: the mascot name paints the
// splotchy artwork, every other name its icon. This holds that routing to SectionIcon.svelte's.
const read = (path) =>
  readFileSync(new URL(`../../web/src/lib/components/${path}`, import.meta.url), 'utf8');
const SECTION_ICON = read('SectionIcon.svelte');
const SPLOTCHY_ICON = read('SplotchyIcon.svelte');

it('routes only the mascot name to the splotchy artwork, as SectionIcon.svelte does', () => {
  const markup = SECTION_ICON.slice(SECTION_ICON.indexOf('</script>'));
  const branches = [...markup.matchAll(/\{(#if|:else if|:else)([^}]*)\}\s*<(\w+)/g)].map(
    ([, kind, condition, component]) => ({ kind, condition: condition.trim(), component })
  );
  expect(branches).toEqual([
    { kind: '#if', condition: `icon === '${SPLOTCHY_ICON_NAME}'`, component: 'SplotchyIcon' },
    { kind: ':else', condition: '', component: 'Icon' },
  ]);
  expect(markup).toContain('<Icon name={icon}');
});

it('draws the splotchy artwork from splotchy.svg, which the native registry copies byte for byte', () => {
  expect(SPLOTCHY_ICON).toContain("import splotchyUrl from '../icons/splotchy.svg';");
  expect(SPLOTCHY_ICON).toContain('<img src={splotchyUrl}');
});
