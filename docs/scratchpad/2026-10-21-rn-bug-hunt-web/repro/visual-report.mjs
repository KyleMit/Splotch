import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
const out = 'docs/scratchpad/2026-10-21-rn-bug-hunt-web',
  root = `${out}/evidence/visual`;
const rows = [];
function walk(path) {
  for (const e of readdirSync(path, { withFileTypes: true })) {
    const full = path + '/' + e.name;
    if (e.isDirectory()) walk(full);
    else if (e.name === 'comparison.json') rows.push(JSON.parse(readFileSync(full, 'utf8')));
  }
}
walk(root);
rows.sort(
  (a, b) =>
    a.viewport.localeCompare(b.viewport) ||
    a.engine.localeCompare(b.engine) ||
    a.theme.localeCompare(b.theme) ||
    a.style.localeCompare(b.style) ||
    a.size - b.size ||
    a.state.localeCompare(b.state)
);
const configurations = Object.groupBy(rows, (r) => r.viewport),
  compared = rows.filter((r) => r.status === 'COMPARED'),
  unsettled = compared.filter((r) => r.unsettled.length);
const clusters = new Map();
for (const r of compared)
  for (const d of r.boxDifferences) {
    const key = d.key + '/' + d.type;
    const c = clusters.get(key) ?? {
      key: d.key,
      type: d.type,
      pairs: 0,
      min: Infinity,
      max: 0,
      examples: [],
    };
    c.pairs++;
    if (d.maxDelta) {
      c.min = Math.min(c.min, d.maxDelta);
      c.max = Math.max(c.max, d.maxDelta);
    }
    if (c.examples.length < 6) c.examples.push(r.id);
    clusters.set(key, c);
  }
writeFileSync(
  `${root}/summary.json`,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      expected: 1472,
      recorded: rows.length,
      compared: compared.length,
      blocked: rows.filter((r) => r.status === 'BLOCKED'),
      unsettled,
      clusters: [...clusters.values()].map((c) => ({
        ...c,
        min: Number.isFinite(c.min) ? c.min : null,
      })),
    },
    null,
    2
  ) + '\n'
);
let md = `# Drawing-screen visual parity\n\nSame-source production builds at b236d639160459eecd60900926c759af5d4ae080: shipping SvelteKit web on 6151 and RN export on 6150. This is the shipping implementation built from the requested worktree, not independent deployed-production equivalence. All images are DPR 1 at the listed CSS viewport. Touch-enabled phone/tablet contexts and mouse desktop contexts share their media settings across each pair. Service workers are blocked for these fresh visual contexts. Remote and API requests are blocked. No AI generation is used.\n\nRequested Cartesian matrix: 9 viewports in Chromium and 7 phone/desktop viewports in each other engine, × 2 themes × 2 button styles × 2 button sizes × 8 states = **1,472 pairs**. Current capture count: **${rows.length}**, compared **${compared.length}**, blocked **${rows.length - compared.length}**, unsettled **${unsettled.length}**.\n\nEach pair directory contains lossless \`shipping.png\`, \`rn.png\`, \`diff.png\`, each DOM receipt, and \`comparison.json\`. A difference pixel has maximum RGB channel delta >16; every non-identical pixel and mean absolute RGB channel difference are also recorded. Diff images mark those pixels magenta over a pale grayscale reference. This simple script includes antialias differences; the pixel percentage alone is not a defect verdict.\n\nA box difference is any missing/extra control or an absolute x, y, width or height delta **>2 CSS px**. The receipts preserve every reported rectangle. Drawer tile unions are computed from actual DOM tile rectangles because RN has separately placed tile containers; the shipping-only parent container is retained in its receipt and excluded from cross-arm counts. Palette swatches, every visible picker cell, Clear, edge controls, drawer tiles, flyout options, picker and Settings bounds are measured. Only rendered nonzero boxes participate.\n\nState definitions: blank paper with drawer folded; drawer expanded; custom picker; brush flyout; width flyout; Settings opening view (hub at narrow sizes, wide shell where responsive); Clear held after the same clamped mouse path with one ink stroke; Farm Cat loaded without ink. Other states keep the drawer expanded. Captures wait for animation settlement and three identical frames after at least one second; unsettled takes are flagged. Held Clear is trusted mouse input, including touch-enabled viewports. Color/style/size fixtures come from a publicly saved Settings record and each receipt records the resulting root attributes.\n\n**Review status:** Geometry and pixel differences are observations adjudicated in the notes below. A finding requires two reproductions and a user-visible disadvantage against shipping under the owner's “whatever is better” rule. Existing issues 3110/3111 are excluded from retest.\n`;
if (existsSync(`${out}/results/visual-adjudication.md`))
  md += '\n' + readFileSync(`${out}/results/visual-adjudication.md`, 'utf8') + '\n';
md +=
  '\n## Viewport totals\n\n| Viewport | Compared pairs | Pixel difference range % | Pairs with drawing-control box differences | Pairs with Settings box differences | Maximum box delta px |\n| --- | ---: | --- | ---: | ---: | ---: |\n';
for (const [viewport, group] of Object.entries(configurations)) {
  const paired = group.filter((r) => r.status === 'COMPARED');
  if (!paired.length) continue;
  const min = Math.min(...paired.map((r) => r.pixel.percent)),
    max = Math.max(...paired.map((r) => r.pixel.percent));
  const main = paired.filter((r) =>
    r.boxDifferences.some((d) => !d.key.startsWith('settings'))
  ).length;
  const settings = paired.filter((r) =>
    r.boxDifferences.some((d) => d.key.startsWith('settings'))
  ).length;
  const maxBox = Math.max(
    0,
    ...paired.flatMap((r) => r.boxDifferences.map((d) => d.maxDelta ?? 0))
  );
  md += `| ${viewport} | ${paired.length} | ${min.toFixed(3)}–${max.toFixed(3)} | ${main} | ${settings} | ${maxBox.toFixed(3)} |\n`;
}
for (const [viewport, group] of Object.entries(configurations)) {
  md += `\n## ${viewport}\n\n| Engine | Theme | Style | Size | State | Diff px (>16) | Diff % | Box differences | Max box Δ px | Evidence |\n| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |\n`;
  for (const r of group) {
    const base = `../evidence/visual/${r.id}`;
    const max = Math.max(0, ...(r.boxDifferences ?? []).map((d) => d.maxDelta ?? 0));
    md += `| ${r.engine} | ${r.theme} | ${r.style === 'buttons' ? 'Raised' : 'Flat'} | ${r.size}% | ${r.state} | ${r.pixel?.changedPixels ?? 'blocked'} | ${r.pixel?.percent.toFixed(3) ?? '—'} | ${r.boxDifferences?.length ?? '—'} | ${max.toFixed(3)} | [shipping](${base}/shipping.png) · [RN](${base}/rn.png) · [diff](${base}/diff.png) · [boxes](${base}/comparison.json)${r.unsettled?.length ? ' · UNSETTLED' : ''} |\n`;
  }
}
writeFileSync(`${out}/results/visual-parity.md`, md);
console.log(
  JSON.stringify({
    pairs: rows.length,
    compared: compared.length,
    blocked: rows.length - compared.length,
    unsettled: unsettled.length,
    boxClusters: clusters.size,
  })
);
