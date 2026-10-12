// The reviewed per-page gate ceilings in the fill-src/<category>/notes.json
// registry, enumerated so a calibration suite scores every reviewed exception
// instead of a hand-copied subset. Only the [page, tool] keys come from here;
// callers read each effective ceiling through pageLevers, the production resolver.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FILL_SRC_DIR } from '../../lib/asset-paths.mjs';

/** Every `[page, tool]` whose registry entry sets `flag`, e.g. `['farm/horse-tall', 'night']`. */
export function registryCeilingCases(flag) {
  const cases = [];
  for (const category of readdirSync(FILL_SRC_DIR).sort()) {
    const file = join(FILL_SRC_DIR, category, 'notes.json');
    if (!existsSync(file)) continue;
    const registry = JSON.parse(readFileSync(file, 'utf8'));
    for (const [page, entry] of Object.entries(registry)) {
      for (const [tool, levers] of Object.entries(entry)) {
        if (!Object.hasOwn(levers?.flags ?? {}, flag)) continue;
        if (page === '*') {
          throw new Error(
            `fill-src/${category}/notes.json sets ${flag} on "*" (${tool}); registryCeilingCases ` +
              'enumerates named pages only, so teach it to expand a category-wide ceiling'
          );
        }
        cases.push([`${category}/${page}`, tool]);
      }
    }
  }
  return cases;
}
