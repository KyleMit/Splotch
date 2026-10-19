import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// native-icons.test.mjs re-inks every native icon outside COLOR_ICONS through currentColor and
// leaves the members in their own palette. This holds that split to the rule Icon.svelte applies:
// only a COLOR_ICONS member takes the icon-color class that opts it out of the tint.
const ICON = readFileSync(
  new URL('../../web/src/lib/components/Icon.svelte', import.meta.url),
  'utf8'
);

it('opts exactly the COLOR_ICONS members out of the tint, as Icon.svelte does', () => {
  const markup = ICON.slice(ICON.indexOf('</script>'));
  const classes = /<span class=\{\[className, ([^\]]+)\]\}/.exec(markup)?.[1];
  expect(classes).toBe("COLOR_ICONS.has(name) && 'icon-color'");
});
