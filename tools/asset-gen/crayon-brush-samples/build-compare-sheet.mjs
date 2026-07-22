// Assemble the reference-vs-current comparison sheet: each acceptance scene as
// a side-by-side pair — the real-crayon reference next to the shipping brush
// driven through the same mark (capture-current.mjs) — with the visual gap
// named per scene. Self-contained (images inlined) like the contact sheet.
//
//   node build-compare-sheet.mjs [--renders=<dir>] [--artifact=<path>]
//
// Writes ../../../scrapbook/crayon-brush-samples/vs-current.html. `--renders`
// points at capture-current.mjs output (default screenshots/crayon-current);
// `--artifact` also emits a body-only fragment for the Claude Artifact tool.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { chromeStyle, masthead, page, siteFooter } from '../../../scripts/lib/scrapbook-chrome.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REF = join(HERE, '../../../scrapbook/crayon-brush-samples');
const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const RENDERS = arg('renders', join(HERE, '../../../screenshots/crayon-current'));
const OUT = join(REF, 'vs-current.html');

// Renders are 2x-DSF PNGs; refs are committed webp. Downsize both to a
// consistent inline size so the sheet stays in contact-sheet territory.
async function uri(path, width = 760) {
  const buf = await sharp(path)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
  return `data:image/webp;base64,${buf.toString('base64')}`;
}

const SCENES = [
  {
    id: '1-line-red',
    title: 'Single stroke',
    notes:
      'Real wax carries continuous tone inside one hue — thick patches read darker, thin drag-outs go translucent and tint the paper. The renderer lays one flat rgb with binary pits: every opaque pixel is the identical color, so the stroke reads stamped rather than dragged, and the grain is isotropic confetti instead of clumps streaked along the stroke direction.',
  },
  {
    id: '2-buildup-blue-halfoverlap',
    title: 'Same-color buildup (light → heavy)',
    notes:
      'The reference deepens: repeated passes fill the tooth AND drop in value / rise in saturation, and the sparse end is a translucent dusting. The renderer builds coverage only — the right half gets more solid but every covered pixel stays the exact same blue. That was a hard constraint of the replay era (constant-hue idempotence); snapshot undo (ADR-0066) lifted it, but the brush still behaves as if it hadn’t.',
  },
  {
    id: '3-cross-yellow-blue',
    title: 'Blue over yellow',
    notes:
      'The darken-min stamp genuinely turns the crossing green — the strongest part of the current design, worth keeping. The gap is texture, not color: the real crossing is streaky and partial (blue skips riding over yellow wax), while the render mixes uniformly inside a crisp rectangle.',
  },
  {
    id: '4-scribble-backforth-blue',
    title: 'One-gesture back-and-forth scribble',
    notes:
      'Real scribbles keep each sweep legible — darker where lines cross, feathered at the turnarounds. The renderer’s mid-stroke pass splitting works (rows do densify), but same-hue exactness means crossings never darken, so sweeps fuse into one texture field with faint horizontal seams at the pass boundaries.',
  },
  {
    id: '5-swatch-red',
    title: 'Dense fill swatch',
    notes:
      'The real fill shows pressure blotches and long drag streaks; bare paper survives in organic clumps. The rendered fill is even micro-speckle everywhere — the 256 px tooth tile has no low-frequency structure (deliberately, to hide the tile repeat), so nothing modulates at blotch scale.',
  },
];

const MACROS = [
  {
    id: '6-macro-single-stroke',
    title: 'Macro: deposit on tooth',
    notes:
      'What the tile model can’t express: wax thickness. Pigment sits in 3-D clumps on the tooth bumps with drag streaks where the crayon slid — thickness varies continuously, and value follows thickness.',
  },
  {
    id: '6-macro-buildup-edge',
    title: 'Macro: thin dusting → heavy wax',
    notes:
      'The full deposit range of one crayon: translucent speckle at grazing pressure to glossy near-solid wax after repeated passes. A faithful brush needs a deposit quantity per pixel, not a binary covered/bare bit.',
  },
];

const sections = [];
for (const s of SCENES) {
  const ref = await uri(join(REF, `${s.id}.webp`));
  const cur = await uri(join(RENDERS, `${s.id}.png`));
  sections.push(`<section class="scene">
    <h2>${s.title}</h2>
    <div class="pair">
      <figure><img loading="lazy" src="${ref}" alt="Real crayon reference: ${s.title}"/><figcaption>Real crayon (reference)</figcaption></figure>
      <figure><img loading="lazy" src="${cur}" alt="Current renderer: ${s.title}"/><figcaption>Current brush (ADR-0065 renderer)</figcaption></figure>
    </div>
    <p class="notes">${s.notes}</p>
  </section>`);
}
for (const m of MACROS) {
  const img = await uri(join(REF, `${m.id}.webp`), 1024);
  sections.push(`<section class="scene">
    <h2>${m.title}</h2>
    <figure class="wide"><img loading="lazy" src="${img}" alt="${m.title}"/><figcaption>Real crayon macro (reference)</figcaption></figure>
    <p class="notes">${m.notes}</p>
  </section>`);
}

const summary = `<section class="scene summary">
  <h2>The five visual gaps, ranked</h2>
  <ol>
    <li><strong>No deposit depth.</strong> Buildup only fills more tooth; covered pixels never get deeper or more saturated. Real wax deepens with every pass, mid-stroke and across strokes.</li>
    <li><strong>Flat tone.</strong> One rgb per color (±8% mottle) vs. continuous value modulation driven by wax thickness; thin wax should go translucent, not vanish into binary pits.</li>
    <li><strong>Isotropic grain.</strong> The tooth field ignores stroke direction; real grain streaks along the drag.</li>
    <li><strong>No blotch-scale structure.</strong> Fine speckle only — fills lack pressure blotches and clumped bare-paper islands.</li>
    <li><strong>Binary edges.</strong> Stippled 0/1 rims read as confetti next to the references’ feathered, crumbly edges.</li>
  </ol>
  <p class="notes">The darken-min color mixing and mid-stroke pass splitting are explicitly worth carrying forward; every gap above traces back to the replay-determinism contract ADR-0066 deleted.</p>
</section>`;

const extraCss = `
  main.shell{padding:28px 0 64px}
  .scene{margin:0 0 40px}
  .scene h2{margin:0 0 14px;font-size:1.15rem}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  @media (max-width:720px){.pair{grid-template-columns:1fr}}
  .scene figure{margin:0;background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);overflow:hidden;box-shadow:var(--shadow-sm)}
  .scene img{display:block;width:100%;height:auto}
  .scene figcaption{padding:8px 12px;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
  .notes{margin:12px 0 0;color:var(--muted);max-width:78ch;line-height:1.55}
  .summary{background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);padding:18px 22px;box-shadow:var(--shadow-sm)}
  .summary ol{margin:0;padding-left:1.2rem}
  .summary li{margin-bottom:.5rem;line-height:1.5}
`;

const body = `${masthead({
  title: 'Crayon brush — reference vs. current renderer',
  tagline:
    'Each acceptance scene side by side: the real-crayon reference next to the shipping ADR-0065 brush driven through the same mark on a production build, with the visual gap named per scene.',
  crumbs: [
    { label: 'Scrapbook', href: '../index.html' },
    { label: 'Crayon brush samples', href: 'index.html' },
    { label: 'vs. current' },
  ],
  home: '../index.html',
  stats: `<span class="chip">${SCENES.length} paired scenes</span><span class="chip">${MACROS.length} macros</span><span class="chip">/dev/engine harness</span>`,
})}
<main class="shell">
${sections.join('\n')}
${summary}
</main>
${siteFooter({ home: '../index.html' })}`;

await writeFile(
  OUT,
  page({ title: 'Crayon brush — reference vs. current renderer', extraCss, body })
);
console.log(`Wrote ${OUT}`);

const artifactOut = arg('artifact', null);
if (artifactOut) {
  await writeFile(artifactOut, `${chromeStyle(extraCss)}\n${body}`);
  console.log(`Wrote Artifact fragment ${artifactOut}.`);
}
