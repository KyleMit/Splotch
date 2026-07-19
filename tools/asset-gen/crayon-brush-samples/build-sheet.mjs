// Assemble the generated crayon-stroke reference images into one self-contained
// contact sheet, grouped by stage, using the shared /artifacts chrome. Images
// are inlined as base64 so the page renders in the sandbox and on GitHub Pages
// with no external files.
//
//   node --experimental-strip-types --disable-warning=ExperimentalWarning build-sheet.mjs
//
// Writes ./out/index.html. Promote with the artifacts:publish flow when happy.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromeStyle, masthead, page, siteFooter } from '../../../scripts/lib/artifact-chrome.mjs';
import { SAMPLES } from './samples.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../../../artifacts/crayon-brush-samples');

const STAGES = [
  [
    '1-',
    'Stage 1 · Single lines',
    'One straight crayon stroke per color — the baseline mark. Note the paper tooth showing through and the waxy buildup at the ends.',
  ],
  [
    '2-',
    'Stage 2 · Same-color overdraw',
    'Drawing back over a stroke in the SAME color. The overlap must read visibly darker, denser and more opaque — this is the buildup behavior the brush has to reproduce.',
  ],
  [
    '3-',
    'Stage 3 · Different-color overdraw',
    'One color layered over another. Where waxes cross they partially mix (red+blue→purple, yellow+blue→green); away from the crossing each color stays itself.',
  ],
  [
    '4-',
    'Stage 4 · Scribble types',
    'The marks a toddler actually makes — back-and-forth fills, circular scribbles, zigzags, hatching, loops, spirals, dots, wild multicolor tangles.',
  ],
  [
    '5-',
    'Stage 5 · Fills & swatches',
    'Area coverage: how the texture reads when a shape is filled at different pressures, plus blended gradients.',
  ],
];

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const files = new Map(
  (await readdir(OUT))
    .filter((f) => MIME[extname(f).toLowerCase()])
    .map((f) => [f.replace(extname(f), ''), f])
);

async function dataUri(file) {
  const buf = await readFile(join(OUT, file));
  return `data:${MIME[extname(file).toLowerCase()]};base64,${buf.toString('base64')}`;
}

const cards = [];
let present = 0;
for (const [prefix, heading, blurb] of STAGES) {
  const specs = SAMPLES.filter((s) => s.id.startsWith(prefix));
  const items = [];
  for (const spec of specs) {
    const file = files.get(spec.id);
    if (!file) continue;
    present++;
    const uri = await dataUri(file);
    items.push(
      `<figure class="sample">
        <a href="${file}" class="shot"><img loading="lazy" src="${uri}" alt="${spec.label}"/></a>
        <figcaption><span class="sid">${spec.id}</span><span class="slabel">${spec.label}</span></figcaption>
      </figure>`
    );
  }
  if (!items.length) continue;
  cards.push(
    `<section class="stage">
      <div class="stage-head"><h2>${heading}</h2><p>${blurb}</p></div>
      <div class="grid">${items.join('\n')}</div>
    </section>`
  );
}

const extraCss = `
  main.shell{padding:28px 0 64px}
  .stage{margin:0 0 40px}
  .stage-head h2{margin:0 0 4px;font-size:1.25rem}
  .stage-head p{margin:0 0 18px;color:var(--muted);max-width:70ch;line-height:1.5}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px}
  .sample{margin:0;background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);overflow:hidden;box-shadow:var(--shadow-sm)}
  .sample .shot{display:block;background:#f5f3ee}
  .sample img{display:block;width:100%;height:auto}
  figcaption{display:flex;flex-direction:column;gap:2px;padding:10px 12px 12px}
  .sid{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.72rem;color:var(--faint)}
  .slabel{font-size:.9rem;color:var(--ink)}
`;

const body = `${masthead({
  title: 'Crayon brush — reference strokes',
  tagline:
    'AI-generated acceptance-criteria art for the new crayon brush mode: what a waxy crayon stroke should look like, built up stage by stage.',
  crumbs: [{ label: 'Artifacts', href: '../index.html' }, { label: 'Crayon brush samples' }],
  home: '../index.html',
  stats: `<span class="chip">${present} samples</span><span class="chip">${STAGES.length} stages</span><span class="chip">gemini-3.1-flash-image</span>`,
})}
<main class="shell">
${cards.join('\n')}
</main>
${siteFooter({ home: '../index.html' })}`;

await writeFile(
  join(OUT, 'index.html'),
  page({ title: 'Crayon brush — reference strokes', extraCss, body })
);
console.log(`Wrote ${join(OUT, 'index.html')} with ${present} samples.`);

// Body-only fragment for the Claude Artifact tool, which supplies its own
// <head>/<body> skeleton. Written wherever --artifact points (a scratchpad
// path); not committed. The chrome CSS already carries data-theme overrides,
// so the Artifact viewer's light/dark toggle works.
const artifactOut = process.argv
  .find((a) => a.startsWith('--artifact='))
  ?.slice('--artifact='.length);
if (artifactOut) {
  // The hosted Artifact has no sibling files, so the "open full image" links
  // would 404 — drop the anchors (the images are inlined and full-res anyway).
  const artifactBody = body
    .replace(/<a href="[^"]+" class="shot">/g, '<div class="shot">')
    .replace(/<\/a>(\s*<figcaption)/g, '</div>$1');
  await writeFile(artifactOut, `${chromeStyle(extraCss)}\n${artifactBody}`);
  console.log(`Wrote Artifact fragment ${artifactOut}.`);
}
