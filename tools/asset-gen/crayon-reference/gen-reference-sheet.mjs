// Assemble the generated crayon-stroke reference images into one contact sheet,
// grouped by stage, using the shared /scrapbook chrome. The committed page
// references its sibling image files (GitHub Pages serves them), so the HTML
// stays small and the thumbnails lazy-load.
//
//   node gen-reference-sheet.mjs [--artifact=<path>]
//
// Writes ../../../scrapbook/crayon-brush-samples/index.html.

import { readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  chromeStyle,
  inlineImage,
  masthead,
  page,
  siteFooter,
} from '../../../tools/scrapbook/lib/scrapbook-chrome.mjs';
import { esc } from '../../../tools/lib/html.mjs';
import { argFlag } from '../../../tools/lib/proc.mjs';
import { SAMPLES, STAGES } from './lib/sample-catalog.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../../../scrapbook/crayon-brush-samples');
const COMPARISON_PAGE = 'vs-current.html';
const GENERATOR_URL =
  'https://github.com/KyleMit/Splotch/tree/main/tools/asset-gen/crayon-reference';
const MODEL_ID = 'gemini-3.1-flash-image';
const MODEL_LABEL = 'Gemini 3.1 Flash Image';
const TITLE = 'Crayon brush — reference strokes';

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

// The page's own copy per stage, keyed by the catalog's stage prefix. The catalog
// headings and blurbs are shared with the comparison sheet; this sheet explains
// each stage to a reader who has not seen the brush spec.
const STAGE_COPY = {
  '1-': {
    short: 'Lines',
    title: 'Single lines',
    intro: 'One straight stroke per crayon color. Every later stage builds on this mark.',
    checks: [
      'Paper texture shows through the stroke as white speckle.',
      'The edges are ragged, not smooth.',
      'A little extra wax collects where the stroke starts and stops.',
    ],
  },
  '2-': {
    short: 'Buildup',
    title: 'Same-color buildup',
    intro:
      'The same crayon drawn back over its own stroke. Each pass adds wax, so the overlap gets darker and more solid.',
    checks: [
      'Two passes read clearly darker than one.',
      'Heavy pressure fills the paper grain; light pressure leaves it open.',
      'The change is gradual, not a hard step.',
    ],
  },
  '3-': {
    short: 'Mixing',
    title: 'Color mixing',
    intro:
      'One color drawn across another. Where the strokes cross, the two waxes mix. Away from the crossing, each color stays itself.',
    checks: [
      'Red over blue turns purplish, blue over yellow turns green, red over yellow turns orange-red.',
      'The top color does not fully hide the color underneath.',
      'Mixing is confined to the overlap.',
    ],
  },
  '4-': {
    short: 'Scribbles',
    title: 'Scribbles',
    intro:
      'The marks a two-year-old actually makes: back-and-forth fills, round-and-round scribbles, zigzags, hatching, loops, spirals, dots, and tangles.',
    checks: [
      'Fast changes of direction keep the same grainy edge.',
      'Where a scribble crosses itself, the buildup rules from stage 2 apply.',
      'Short stabs leave small dense blobs, not thin lines.',
    ],
  },
  '5-': {
    short: 'Fills',
    title: 'Fills and swatches',
    intro: 'Whole areas colored in at light and heavy pressure, plus blended gradients.',
    checks: [
      'A heavy fill is still grainy, never a flat solid color.',
      'A light fill is mostly paper, with color caught on the high points.',
      'Pressure and color change smoothly across a gradient.',
    ],
  },
  '6-': {
    short: 'Close-ups',
    title: 'Close-ups',
    intro: 'Extreme close-ups of the wax on the paper grain, to show how the texture is made.',
    checks: [
      'Thick wax sits on the raised bumps of the paper; the pits between them stay bare.',
      'Faint streaks run along the direction of the stroke.',
      'Where the wax is thin it turns translucent instead of disappearing.',
    ],
  },
};

for (const { prefix } of STAGES) {
  if (!STAGE_COPY[prefix]) throw new Error(`STAGE_COPY has no entry for stage prefix ${prefix}`);
}

// Crayon colors a sample id or label can name, in the order the swatch dots stack.
const CRAYON_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'brown',
  'black',
];

function swatchColors({ id, label }) {
  const named = (text) =>
    CRAYON_COLORS.filter((c) =>
      text
        .toLowerCase()
        .split(/[^a-z]+/)
        .includes(c)
    );
  const fromId = named(id);
  return fromId.length ? fromId : named(label);
}

function swatch(colors) {
  const dots = colors.length
    ? colors.map((c) => `<i style="background:var(--c-${c})"></i>`).join('')
    : '<i class="multi"></i>';
  return `<span class="sw" aria-hidden="true">${dots}</span>`;
}

// Every prompt in the catalog starts with the same paragraph describing the paper
// and the wax; only the sentence after it describes the mark. Recover the split
// from the prompts themselves so the shared text is shown once and each sample
// shows only its own sentence.
function commonPrefix(strings) {
  let prefix = strings[0] ?? '';
  for (const s of strings) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}
const SHARED_PROMPT = commonPrefix(SAMPLES.map((s) => s.prompt)).trim();
const markSentence = (prompt) => prompt.slice(SHARED_PROMPT.length).trim();

const files = new Map(
  (await readdir(OUT))
    .filter((f) => MIME[extname(f).toLowerCase()])
    .map((f) => [f.replace(extname(f), ''), f])
);

// `inline` embeds every image as a data: URI and drops the links that need
// sibling files — the Claude Artifact fragment is hosted alone.
async function buildBody({ inline }) {
  const samples = [];
  const sections = [];
  for (const [stageIndex, { prefix }] of STAGES.entries()) {
    const copy = STAGE_COPY[prefix];
    const stageNumber = stageIndex + 1;
    const cards = [];
    for (const spec of SAMPLES.filter((s) => s.id.startsWith(prefix))) {
      const file = files.get(spec.id);
      if (!file) continue;
      const path = join(OUT, file);
      const { width, height } = await sharp(path).metadata();
      const src = inline ? await inlineImage(path) : file;
      const colors = swatchColors(spec);
      samples.push({
        id: spec.id,
        file,
        src,
        label: spec.label,
        stage: stageNumber,
        stageTitle: copy.title,
        colors,
        mark: markSentence(spec.prompt),
      });
      cards.push(
        `<figure class="sample" id="${esc(spec.id)}">
        <button type="button" class="shot" data-open="${esc(spec.id)}" aria-label="View ${esc(spec.label)} full size"><img loading="lazy" decoding="async" width="${width}" height="${height}" src="${src}" alt="${esc(spec.label)}"/></button>
        <figcaption><span class="slabel">${swatch(colors)}${esc(spec.label)}</span><span class="sid">${esc(spec.id)}</span></figcaption>
      </figure>`
      );
    }
    if (!cards.length) continue;
    sections.push(
      `<section class="stage" id="stage-${stageNumber}" data-stage="${stageNumber}">
      <div class="stage-head">
        <div class="stage-title"><span class="stage-num" aria-hidden="true">${stageNumber}</span><h2>${esc(copy.title)}</h2><span class="stage-count">${cards.length} ${cards.length === 1 ? 'sample' : 'samples'}</span></div>
        <p class="intro">${esc(copy.intro)}</p>
        <div class="checks"><span class="eyebrow">What to look for</span><ul>${copy.checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
      </div>
      <div class="grid">${cards.join('\n')}</div>
    </section>`
    );
  }

  const stageLinks = STAGES.map(({ prefix }, i) => {
    const n = i + 1;
    return `<a class="pill" href="#stage-${n}" data-stage="${n}"><b>${n}</b>${esc(STAGE_COPY[prefix].short)}</a>`;
  }).join('');

  const sizeButtons = [
    [
      's',
      'Small thumbnails',
      '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9.5" y="2" width="5" height="5" rx="1"/><rect x="17" y="2" width="5" height="5" rx="1"/><rect x="2" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><rect x="17" y="9.5" width="5" height="5" rx="1"/><rect x="2" y="17" width="5" height="5" rx="1"/><rect x="9.5" y="17" width="5" height="5" rx="1"/><rect x="17" y="17" width="5" height="5" rx="1"/>',
    ],
    [
      'm',
      'Medium thumbnails',
      '<rect x="2" y="2" width="9" height="9" rx="1.5"/><rect x="13" y="2" width="9" height="9" rx="1.5"/><rect x="2" y="13" width="9" height="9" rx="1.5"/><rect x="13" y="13" width="9" height="9" rx="1.5"/>',
    ],
    [
      'l',
      'Large thumbnails',
      '<rect x="2" y="2" width="20" height="9" rx="1.5"/><rect x="2" y="13" width="20" height="9" rx="1.5"/>',
    ],
  ]
    .map(
      ([size, label, paths]) =>
        `<button type="button" data-size="${size}" aria-pressed="false" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${paths}</svg></button>`
    )
    .join('');

  const stats = [
    `<span class="chip"><b>${samples.length}</b> samples</span>`,
    `<span class="chip">${esc(MODEL_LABEL)}</span>`,
    inline
      ? ''
      : `<a class="chip accent" href="${COMPARISON_PAGE}">Compare with the shipping brush →</a>`,
  ].join('');

  const tagline =
    "Reference images of crayon marks on paper, generated with Gemini's image model. Each stage isolates one behavior the app's crayon brush has to match.";

  const method = `<section class="method" id="method">
      <h2>How the images were made</h2>
      <p>Every sample came from the <code>${esc(MODEL_ID)}</code> model. One shared prompt describes the paper, the wax texture, and the framing; each sample adds a single sentence describing its mark. Open a sample to read that sentence. The raw output was downsized to ${
        samples[0]
          ? esc(
              String(
                await sharp(join(OUT, samples[0].file))
                  .metadata()
                  .then((m) => m.width)
              )
            )
          : ''
      } px wide WebP files, which are the images on this page.</p>
      <details class="prompt"><summary>Shared prompt</summary><p>${esc(SHARED_PROMPT)}</p></details>
      ${inline ? '' : `<p class="method-links"><a href="${COMPARISON_PAGE}">Compare with the shipping brush</a><a href="${GENERATOR_URL}">Generator source on GitHub</a></p>`}
    </section>`;

  const lightbox = `<dialog class="lb" id="lb" aria-label="Sample viewer">
  <div class="lb-frame">
    <div class="lb-top"><span class="lb-stage"></span><span class="lb-pos"></span><button type="button" class="lb-x" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="lb-img"><img id="lb-pic" alt=""/><button type="button" class="lb-nav lb-prev" aria-label="Previous sample"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><button type="button" class="lb-nav lb-next" aria-label="Next sample"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></div>
    <div class="lb-cap">
      <div class="lb-title"><span class="sw" aria-hidden="true"></span><strong class="lb-label"></strong><span class="sid lb-id"></span></div>
      <p class="lb-mark"><b>Prompt</b> <span></span></p>
      ${inline ? '' : '<p class="lb-links"><a class="lb-file" target="_blank" rel="noopener">Open image file</a></p>'}
    </div>
  </div>
</dialog>`;

  const data = JSON.stringify(
    samples.map(({ id, file, src, label, stage, stageTitle, colors, mark }) => ({
      id,
      file: inline ? null : file,
      src,
      label,
      stage,
      stageTitle,
      colors,
      mark,
    }))
  ).replace(/</g, '\\u003c');

  return `${masthead({
    title: TITLE,
    tagline,
    crumbs: [{ label: 'Scrapbook', href: '../index.html' }, { label: 'Crayon brush samples' }],
    home: '../index.html',
    stats,
  })}
<div class="bar" id="bar">
  <div class="shell bar-in">
    <nav class="stages" aria-label="Stages">${stageLinks}</nav>
    <div class="size" role="group" aria-label="Thumbnail size">${sizeButtons}</div>
  </div>
</div>
<main class="shell" data-size="m">
${sections.join('\n')}
${method}
</main>
${lightbox}
${siteFooter({ home: '../index.html' })}
<script type="application/json" id="samples">${data}</script>
<script>${SCRIPT}</script>`;
}

const extraCss = `
  :root{--c-brown:#8a5a2b; --c-black:#2a2a2e; --paper-scan:#f5f3ee; --bar-h:52px}
  html{scroll-behavior:smooth}
  @media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
  .masthead .stat-row a.chip:hover{text-decoration:none; background:color-mix(in srgb,var(--accent) 22%, var(--accent-wash))}

  /* sticky stage bar */
  .bar{position:sticky; top:0; z-index:20; background:color-mix(in srgb,var(--paper) 88%, transparent); -webkit-backdrop-filter:blur(12px); backdrop-filter:blur(12px); border-bottom:1px solid var(--hair)}
  .bar-in{display:flex; align-items:center; gap:10px; min-height:var(--bar-h)}
  .stages{display:flex; gap:4px; flex:1; min-width:0; overflow-x:auto; padding:8px 0; scrollbar-width:none; -webkit-overflow-scrolling:touch}
  .stages::-webkit-scrollbar{display:none}
  .stages{-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent); mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent)}
  .pill{flex:0 0 auto; display:inline-flex; align-items:center; gap:7px; padding:4px 11px 4px 5px; border-radius:999px; font-size:.82rem; font-weight:650; color:var(--muted); white-space:nowrap; transition:background .12s, color .12s}
  .pill b{display:grid; place-items:center; width:20px; height:20px; border-radius:50%; background:color-mix(in srgb,var(--ink) 9%, transparent); color:var(--ink); font-size:.7rem; font-weight:750; transition:background .12s, color .12s}
  .pill:hover{text-decoration:none; color:var(--ink); background:color-mix(in srgb,var(--ink) 5%, transparent)}
  .pill[aria-current=true]{color:var(--accent-ink); background:var(--accent-wash)}
  .pill[aria-current=true] b{background:var(--accent); color:#fff}
  .size{display:inline-flex; gap:2px; padding:3px; border-radius:999px; background:color-mix(in srgb,var(--ink) 7%, transparent); flex:0 0 auto}
  .size button{appearance:none; border:0; background:transparent; width:32px; height:26px; border-radius:999px; display:grid; place-items:center; color:var(--muted); cursor:pointer; padding:0}
  .size button:hover{color:var(--ink)}
  .size button[aria-pressed=true]{background:var(--card); color:var(--ink); box-shadow:var(--shadow-sm)}
  .size svg{width:15px; height:15px; display:block}
  @media (max-width:600px){.size [data-size=l]{display:none}}

  /* stages */
  main.shell{padding-top:clamp(24px,4vw,40px); padding-bottom:clamp(48px,7vw,84px)}
  .stage{scroll-margin-top:calc(var(--bar-h) + 8px); margin:0 0 clamp(36px,6vw,56px)}
  .stage-head{margin:0 0 18px; max-width:72ch}
  .stage-title{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
  .stage-num{display:grid; place-items:center; width:28px; height:28px; border-radius:50%; background:var(--accent); color:#fff; font-size:.85rem; font-weight:800; flex:0 0 auto}
  .stage-title h2{margin:0; font-size:clamp(1.25rem,2.4vw,1.5rem); letter-spacing:-.015em; font-weight:780}
  .stage-count{color:var(--faint); font-size:.82rem; font-weight:600; margin-left:2px}
  .intro{margin:8px 0 0; color:var(--muted); line-height:1.5}
  .checks{margin:10px 0 0}
  .checks ul{margin:4px 0 0; padding-left:18px; display:flex; flex-direction:column; gap:3px; font-size:.9rem; color:var(--ink); line-height:1.45}
  .checks li::marker{color:var(--faint)}

  /* sample grid */
  main{--col:280px}
  main[data-size=s]{--col:150px}
  main[data-size=l]{--col:430px}
  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(min(var(--col),100%),1fr)); gap:clamp(10px,1.6vw,18px)}
  .sample{margin:0; background:var(--card); border:1px solid var(--hair); border-radius:var(--r-md); overflow:hidden; box-shadow:var(--shadow-sm); container-type:inline-size; transition:transform .14s ease, box-shadow .14s ease}
  .sample:hover{transform:translateY(-2px); box-shadow:var(--shadow-md)}
  .sample:target{outline:2px solid var(--accent); outline-offset:2px}
  .shot{display:block; width:100%; padding:0; border:0; background:var(--paper-scan); cursor:zoom-in; border-radius:0}
  .shot:focus-visible{outline:3px solid var(--accent); outline-offset:-3px}
  .shot img{display:block; width:100%; height:auto}
  figcaption{display:flex; flex-direction:column; gap:2px; padding:9px 12px 10px; min-width:0}
  .slabel{display:flex; align-items:flex-start; gap:8px; font-size:.9rem; color:var(--ink); line-height:1.35}
  .slabel .sw{margin-top:.33em}
  .sid{font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.7rem; color:var(--faint); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  @container (max-width:230px){.sid{display:none} figcaption{padding:7px 9px 8px} .slabel{font-size:.8rem; gap:6px}}
  .sw{display:inline-flex; flex:0 0 auto}
  .sw i{display:block; width:10px; height:10px; border-radius:50%; box-shadow:0 0 0 1.5px var(--card); background:var(--faint)}
  .sw i + i{margin-left:-3px}
  .sw i.multi{background:conic-gradient(var(--c-red),var(--c-yellow),var(--c-green),var(--c-blue),var(--c-purple),var(--c-red))}

  /* method */
  .method{border-top:1px solid var(--hair); padding-top:clamp(24px,4vw,36px); max-width:72ch}
  .method h2{margin:0 0 8px; font-size:1.15rem; letter-spacing:-.01em; font-weight:750}
  .method p{margin:0; color:var(--muted); line-height:1.55}
  .prompt{margin:12px 0 0; border:1px solid var(--hair); border-radius:var(--r-sm); background:var(--card)}
  .prompt summary{cursor:pointer; padding:9px 12px; font-size:.9rem; font-weight:650; color:var(--ink)}
  .prompt p{padding:0 12px 12px; font-size:.9rem}
  .method-links{display:flex; flex-wrap:wrap; gap:6px 18px; margin-top:14px; font-size:.9rem}

  /* lightbox */
  .lb{border:0; padding:0; margin:auto; background:transparent; width:min(100vw - 24px, 1080px); max-width:none; max-height:none; overflow:visible}
  .lb::backdrop{background:rgba(12,12,18,.72); -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px)}
  .lb-frame{background:var(--card); color:var(--ink); border-radius:var(--r-lg); box-shadow:var(--shadow-lg); overflow:hidden; display:flex; flex-direction:column; max-height:calc(100dvh - 24px)}
  .lb-top{display:flex; align-items:center; gap:10px; padding:8px 8px 8px 16px; border-bottom:1px solid var(--hair); font-size:.82rem; color:var(--muted)}
  .lb-stage{font-weight:650; color:var(--ink)}
  .lb-pos{margin-left:auto; font-variant-numeric:tabular-nums}
  .lb-x,.lb-nav{appearance:none; border:0; cursor:pointer; display:grid; place-items:center; border-radius:50%; color:var(--ink); background:transparent}
  .lb-x{width:34px; height:34px}
  .lb-x:hover{background:color-mix(in srgb,var(--ink) 8%, transparent)}
  .lb svg{width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round}
  .lb-img{position:relative; background:var(--paper-scan); flex:1; min-height:0; display:flex}
  .lb-img img{display:block; width:100%; height:auto; max-height:min(68dvh, 720px); object-fit:contain; margin:auto}
  .lb-nav{position:absolute; top:50%; transform:translateY(-50%); width:40px; height:40px; background:rgba(255,255,255,.82); color:#23212a; box-shadow:0 1px 4px rgba(0,0,0,.18)}
  .lb-nav:hover{background:#fff}
  .lb-prev{left:10px} .lb-next{right:10px}
  .lb-cap{padding:12px 16px 14px; border-top:1px solid var(--hair); display:flex; flex-direction:column; gap:6px; overflow:auto; flex:0 1 auto}
  .lb-title{display:flex; align-items:center; gap:8px; flex-wrap:wrap}
  .lb-label{font-size:1rem}
  .lb-mark{margin:0; color:var(--muted); font-size:.9rem; line-height:1.5}
  .lb-mark b{font-size:.7rem; text-transform:uppercase; letter-spacing:.1em; color:var(--gold); font-weight:700; margin-right:4px}
  .lb-links{margin:0; font-size:.85rem}
  .lb-x:focus-visible,.lb-nav:focus-visible,.shot:focus-visible,.size button:focus-visible,.pill:focus-visible{outline:3px solid var(--accent); outline-offset:2px}
  @media (max-width:600px){
    .lb{width:100vw}
    .lb-frame{border-radius:0; max-height:100dvh}
    .lb-nav{width:34px; height:34px; top:auto; bottom:8px; transform:none}
    .lb-prev{left:8px} .lb-next{right:8px}
  }
  @media (prefers-reduced-motion:reduce){.sample,.pill,.pill b{transition:none}}
`;

const SCRIPT = `
(() => {
  const samples = JSON.parse(document.getElementById('samples').textContent);
  const index = new Map(samples.map((s, i) => [s.id, i]));
  const main = document.querySelector('main');
  const SIZE_KEY = 'crayon-samples:size';
  const SIZES = ['s', 'm', 'l'];
  const narrow = matchMedia('(max-width:600px)');
  const sizeButtons = [...document.querySelectorAll('.size button')];

  function applySize(size, persist) {
    main.dataset.size = size;
    const shown = size === 'l' && narrow.matches ? 'm' : size;
    for (const b of sizeButtons) b.setAttribute('aria-pressed', String(b.dataset.size === shown));
    if (persist) { try { localStorage.setItem(SIZE_KEY, size); } catch {} }
  }
  const fallback = narrow.matches ? 's' : 'm';
  let stored = null;
  try { stored = localStorage.getItem(SIZE_KEY); } catch {}
  applySize(SIZES.includes(stored) ? stored : fallback, false);
  narrow.addEventListener('change', () => applySize(main.dataset.size, false));
  for (const b of sizeButtons) b.addEventListener('click', () => applySize(b.dataset.size, true));

  const bar = document.getElementById('bar');
  const strip = bar.querySelector('.stages');
  const pills = [...strip.querySelectorAll('.pill')];
  const sections = [...document.querySelectorAll('main > section')];
  let current = null;
  function markCurrent() {
    const line = bar.getBoundingClientRect().bottom + Math.min(160, window.innerHeight * 0.2);
    let active = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= line) active = s;
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom) active = sections[sections.length - 1];
    if (active === current) return;
    current = active;
    for (const p of pills) {
      const on = p.dataset.stage === active.dataset.stage;
      if (on) {
        p.setAttribute('aria-current', 'true');
        const r = p.getBoundingClientRect(), c = strip.getBoundingClientRect();
        if (r.left < c.left) strip.scrollLeft += r.left - c.left - 12;
        else if (r.right > c.right) strip.scrollLeft += r.right - c.right + 12;
      } else p.removeAttribute('aria-current');
    }
  }
  let queued = false;
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; markCurrent(); }); } };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  markCurrent();

  const lb = document.getElementById('lb');
  const pic = document.getElementById('lb-pic');
  const stageEl = lb.querySelector('.lb-stage');
  const posEl = lb.querySelector('.lb-pos');
  const swEl = lb.querySelector('.sw');
  const labelEl = lb.querySelector('.lb-label');
  const idEl = lb.querySelector('.lb-id');
  const markEl = lb.querySelector('.lb-mark span');
  const fileEl = lb.querySelector('.lb-file');
  let at = -1;

  function preload(i) { const img = new Image(); img.src = samples[(i + samples.length) % samples.length].src; }
  function show(i) {
    at = (i + samples.length) % samples.length;
    const s = samples[at];
    pic.src = s.src;
    pic.alt = s.label;
    stageEl.textContent = 'Stage ' + s.stage + ' · ' + s.stageTitle;
    posEl.textContent = (at + 1) + ' / ' + samples.length;
    swEl.innerHTML = s.colors.length
      ? s.colors.map((c) => '<i style="background:var(--c-' + c + ')"></i>').join('')
      : '<i class="multi"></i>';
    labelEl.textContent = s.label;
    idEl.textContent = s.id;
    markEl.textContent = s.mark;
    if (fileEl) fileEl.href = s.file;
    history.replaceState(null, '', '#' + s.id);
    preload(at + 1); preload(at - 1);
  }
  function open(i) { show(i); if (!lb.open) lb.showModal(); }
  function step(d) { if (lb.open) show(at + d); }

  for (const b of document.querySelectorAll('[data-open]')) b.addEventListener('click', () => open(index.get(b.dataset.open)));
  lb.querySelector('.lb-x').addEventListener('click', () => lb.close());
  lb.querySelector('.lb-prev').addEventListener('click', () => step(-1));
  lb.querySelector('.lb-next').addEventListener('click', () => step(1));
  lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
  lb.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
  });
  let touchX = null;
  lb.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  });
  lb.addEventListener('close', () => {
    const opener = document.querySelector('[data-open="' + samples[at].id + '"]');
    if (location.hash === '#' + samples[at].id) history.replaceState(null, '', location.pathname + location.search);
    if (opener) opener.focus({ preventScroll: true });
  });
  const initial = index.get(location.hash.slice(1));
  if (initial !== undefined) open(initial);
})();
`;

const body = await buildBody({ inline: false });
await writeFile(join(OUT, 'index.html'), page({ title: TITLE, extraCss, body }));
console.log(`Wrote ${join(OUT, 'index.html')} with ${files.size} samples.`);

// Body-only fragment for the Claude Artifact tool, which supplies its own
// <head>/<body> skeleton and hosts no sibling files, so images are inlined and
// the file links dropped. Written wherever --artifact points; not committed.
const artifactOut = argFlag('artifact', undefined);
if (artifactOut) {
  const artifactBody = await buildBody({ inline: true });
  await writeFile(artifactOut, `${chromeStyle(extraCss)}\n${artifactBody}`);
  console.log(`Wrote Artifact fragment ${artifactOut}.`);
}
