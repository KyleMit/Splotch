// Per-page lever registry — fill-src/<category>/notes.json holds the known-good
// generator levers (--notes text, temperature, gate overrides) that past sessions
// fought to discover, so a regeneration starts from them instead of re-fighting
// the battle. Schema per file:
//
//   {
//     "<page>" | "*": {                       "*" applies to every page in the category
//       "night" | "chalk" | "normalize" | "light": {
//         "flags":  { "<cli-long-option>": value },   auto-applied; explicit CLI always wins
//         "retry":  { "<cli-long-option>": value },   escalation recipe — printed, never auto-applied
//         "review": "…",                              what the human gate should expect (acceptable warnings)
//         "why":    "…"                               provenance: commit / doc / session that proved it
//       }
//     }
//   }
//
// flags use the generator's exact long option names so the merge is mechanical.
// Values may be numbers/booleans in JSON; they are normalized to the strings
// parseArgs would have produced, so downstream Number() coercions are unchanged.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { FILL_SRC_DIR } from './paths.mjs';

const registries = new Map();

function categoryRegistry(category) {
  if (!registries.has(category)) {
    const file = join(FILL_SRC_DIR, category, 'notes.json');
    registries.set(category, existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
  }
  return registries.get(category);
}

export function pageLevers(rel, tool) {
  const [category, page] = rel.replaceAll('\\', '/').split('/');
  if (!category || !page) return null;
  const registry = categoryRegistry(category);
  if (!registry) return null;
  const wild = registry['*']?.[tool];
  const own = registry[page]?.[tool];
  if (!wild && !own) return null;
  return {
    flags: { ...wild?.flags, ...own?.flags },
    retry: own?.retry ?? wild?.retry ?? null,
    review: [wild?.review, own?.review].filter(Boolean).join(' — ') || null,
    why: own?.why ?? wild?.why ?? null,
  };
}

// Registry flags fill in only what the CLI left unset — an explicit CLI flag
// always wins. Returns the merged parseArgs-shaped values plus which keys the
// registry supplied, for provenance logging.
export function mergeFlags(cliValues, levers) {
  const merged = { ...cliValues };
  const fromRegistry = [];
  for (const [key, value] of Object.entries(levers?.flags ?? {})) {
    if (merged[key] !== undefined) continue;
    merged[key] = typeof value === 'boolean' ? value : String(value);
    fromRegistry.push(key);
  }
  return { merged, fromRegistry };
}

const short = (v) => (typeof v === 'string' && v.length > 72 ? `${v.slice(0, 69)}...` : v);

// One-look provenance block for a page: every resolved setting tagged
// cli / notes.json / default, plus the registry's retry recipe and review
// expectations. `settings` maps option name -> resolved value.
export function describeLevers({ rel, levers, fromRegistry, cliValues, settings }) {
  const lines = [];
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) continue;
    const source =
      cliValues[key] !== undefined ? 'cli' : fromRegistry.includes(key) ? 'notes.json' : 'default';
    lines.push(`  ${key} = ${JSON.stringify(short(value))}  [${source}]`);
  }
  if (levers?.retry)
    lines.push(`  retry recipe (NOT auto-applied): ${JSON.stringify(levers.retry)}`);
  if (levers?.review) lines.push(`  review: ${short(levers.review)}`);
  if (levers?.why) lines.push(`  why: ${short(levers.why)}`);
  return `${rel} levers:\n${lines.join('\n')}`;
}
