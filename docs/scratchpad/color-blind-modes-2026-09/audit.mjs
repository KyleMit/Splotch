// Color-vision audit of Splotch's two palettes. Run from the repo root:
//   node docs/scratchpad/color-blind-modes-2026-09/audit.mjs > docs/scratchpad/color-blind-modes-2026-09/audit.out.txt
// Findings and their reading are in README.md beside this file.
import {
  DEFICIENCIES,
  deltaE,
  gridSwatches,
  labOf,
  loadCrayonPalette,
  loadHexFamilies,
  rgbToHex,
  simulate,
} from './cvd-lib.mjs';

const CONFUSABLE_DE = 10;
const NEAR_IDENTICAL_DE = 5;
const RISKY_DE = 15;
const DISTINCT_DE = 15;

const crayons = loadCrayonPalette();
const families = loadHexFamilies();
const grid = gridSwatches(families);

function confusablePairs(items, vision, threshold) {
  const labs = items.map((item) => labOf(item.hex, vision));
  const pairs = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const d = deltaE(labs[i], labs[j]);
      if (d < threshold) pairs.push({ a: items[i], b: items[j], d });
    }
  return pairs.sort((p, q) => p.d - q.d);
}

function printPairs(pairs) {
  for (const { a, b, d } of pairs) {
    const flag = d < NEAR_IDENTICAL_DE ? '!!' : '  ';
    const seen = (item) =>
      `${item.label.padEnd(10)} ${item.hex} → ${rgbToHex(simulate(item.hex, vision(a)))}`;
    console.log(`  ${flag} ${seen(a)}   vs   ${seen(b)}   ΔE=${d.toFixed(1)}`);
  }
}
let currentVision = 'normal';
const vision = () => currentVision;

console.log('# Crayon palette (palette.ts) — pairs a deficiency brings under ΔE ' + RISKY_DE);
for (currentVision of DEFICIENCIES) {
  const pairs = confusablePairs(crayons, currentVision, RISKY_DE);
  console.log(
    `\n## ${currentVision}: ${pairs.length} pairs (!! = near-identical, ΔE < ${NEAR_IDENTICAL_DE})`
  );
  printPairs(pairs);
}

console.log(
  '\n\n# Hex picker grid (hexPickerLayout.ts) — cross-family pairs under ΔE ' + CONFUSABLE_DE
);
console.log(
  '(same-family neighbours are a shade ramp and meant to be close; only other-family collisions are counted)'
);
for (currentVision of DEFICIENCIES) {
  const cross = confusablePairs(grid, currentVision, CONFUSABLE_DE).filter(
    (p) => p.a.family !== p.b.family
  );
  console.log(`\n## ${currentVision}: ${cross.length} cross-family pairs`);
  const collisions = new Map(grid.map((g) => [g.label, 0]));
  const partners = {};
  for (const { a, b } of cross) {
    collisions.set(a.label, collisions.get(a.label) + 1);
    collisions.set(b.label, collisions.get(b.label) + 1);
    (partners[a.family] ??= new Set()).add(b.family);
    (partners[b.family] ??= new Set()).add(a.family);
  }
  console.log('  family confusion map:');
  for (const family of families)
    console.log(
      `    ${family.name.padEnd(8)} ↔ ${[...(partners[family.name] ?? [])].join(', ') || '—'}`
    );
  console.log('  collisions per hex (families × shades 1..9):');
  for (const family of families)
    console.log(
      `    ${family.name.padEnd(8)} ` +
        family.shades
          .map((_, s) => String(collisions.get(`${family.name}-${s + 1}`)).padStart(2))
          .join(' ')
    );
}

// Family separation = the smallest ΔE between any shade of A and any shade of
// B: "is there any pair a child could confuse".
function familyMinDe(a, b, vision) {
  let min = Infinity;
  for (const x of a.shades)
    for (const y of b.shades) min = Math.min(min, deltaE(labOf(x, vision), labOf(y, vision)));
  return min;
}

console.log('\n\n# Family-vs-family minimum ΔE');
for (const v of ['normal', ...DEFICIENCIES]) {
  console.log(`\n## ${v}`);
  console.log('         ' + families.map((f) => f.name.slice(0, 6).padStart(7)).join(''));
  for (const a of families)
    console.log(
      a.name.padEnd(9) +
        families
          .map((b) => (a === b ? '      ·' : familyMinDe(a, b, v).toFixed(0).padStart(7)))
          .join('')
    );
}

// Exhaustive over the 2^9 family subsets: the largest set whose every pair
// stays separated under every listed deficiency, ties broken by the worst pair.
function bestFamilySubset(visions, threshold) {
  let best = null;
  for (let mask = 1; mask < 1 << families.length; mask++) {
    const chosen = families.filter((_, i) => mask & (1 << i));
    let worst = Infinity;
    for (let i = 0; i < chosen.length && worst >= threshold; i++)
      for (let j = i + 1; j < chosen.length && worst >= threshold; j++)
        for (const v of visions) worst = Math.min(worst, familyMinDe(chosen[i], chosen[j], v));
    if (worst < threshold) continue;
    if (
      !best ||
      chosen.length > best.chosen.length ||
      (chosen.length === best.chosen.length && worst > best.worst)
    )
      best = { chosen, worst };
  }
  return best;
}

const MODES = [
  ['normal', ['normal']],
  ['protan', ['protan']],
  ['deutan', ['deutan']],
  ['tritan', ['tritan']],
  ['red-green (protan+deutan)', ['protan', 'deutan']],
  ['all three', DEFICIENCIES],
];
console.log(
  '\n\n# Largest set of whole families with every pair separated under the given deficiencies'
);
for (const threshold of [8, 10, 12]) {
  for (const [label, visions] of MODES) {
    const best = bestFamilySubset(visions, threshold);
    console.log(
      `  ΔE≥${threshold} ${label.padEnd(26)} ` +
        (best
          ? `${best.chosen.length} families: ${best.chosen.map((f) => f.name).join(', ')} (worst pair ${best.worst.toFixed(1)})`
          : 'none')
    );
  }
}

// Greedy mutually-distinct subsets: how much of each palette survives when
// every kept pair must stay ≥ DISTINCT_DE apart under every listed vision.
function greedyDistinct(items, visions, threshold) {
  const kept = [];
  for (const item of items) {
    const labs = Object.fromEntries(visions.map((v) => [v, labOf(item.hex, v)]));
    if (kept.every((k) => visions.every((v) => deltaE(k.labs[v], labs[v]) >= threshold)))
      kept.push({ ...item, labs });
  }
  return kept;
}
console.log(
  `\n\n# Greedy mutually-distinct subsets of the 81-hex grid (every kept pair ΔE ≥ ${DISTINCT_DE})`
);
for (const [label, visions] of MODES) {
  const kept = greedyDistinct(grid, visions, DISTINCT_DE);
  const perFamily = families.map(
    (f) => `${f.name}:${kept.filter((k) => k.family === f.name).length}`
  );
  console.log(
    `  ${label.padEnd(26)} keeps ${String(kept.length).padStart(2)}/81 — ${perFamily.join(' ')}`
  );
}

console.log('\n\n# One crayon set for every deficiency? Greedy over the crayons then the grid');
const pool = [...crayons, ...grid];
for (const [label, visions] of [
  ['red-green', ['normal', 'protan', 'deutan']],
  ['all three', ['normal', ...DEFICIENCIES]],
]) {
  for (const threshold of [15, 20]) {
    const kept = greedyDistinct(pool, visions, threshold);
    console.log(
      `  ${label.padEnd(10)} ΔE≥${threshold}: ${kept.length} — ${kept.map((k) => `${k.label}(${k.hex})`).join(' ')}`
    );
  }
}
