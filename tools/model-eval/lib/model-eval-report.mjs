// Builds the model-eval report from a run's results. The report is a `report/`
// bundle — `index.html` plus a sibling `assets/` folder of downscaled thumbnails
// (referenced by relative path, not base64-inlined) so the committed/Pages copy
// stays a small HTML file with readable diffs and thumbnails that dedupe in git
// across re-publishes (ADR-0059). Only index.html + assets/ get published; the
// run's raw results.json / summary.json stay in the (gitignored) run dir, not in
// the bundle. The report chrome (masthead, breadcrumbs, footer, tokens) comes
// from the shared design system in ./scrapbook-chrome.mjs.
//
// The comparison is N-way rather than A/B: a variant is a provider × model ×
// effort tier, so the scorecard puts variants in ROWS and metrics in columns
// (the only orientation that survives adding a tier), and the gallery lays each
// drawing out as a wrapping grid of tiles — the input first, then one tile per
// variant — with a sticky toolbar that picks which variants stay visible.
//
// `renderReportHtml` is pure string assembly over already-thumbnailed results and
// precomputed aggregates, so a bundle can be re-rendered from an existing run
// (or a reskin applied to one) without a browser or the full-size images.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { GENERATE_DEADLINE_MS } from '../../../web/src/lib/ai/limits.ts';
import { PRODUCTION_VARIANT, RATES } from './model-eval.mjs';
import { esc } from '../../lib/html.mjs';
import { chromeStyle, masthead, siteFooter } from '../../scrapbook/lib/scrapbook-chrome.mjs';

// Per-image cost reads as cents: every variant lands between one and twenty
// cents, where "$0.0204" hides the comparison and "2.0¢" states it.
const cents = (usd) => {
  if (usd == null) return '—';
  const c = usd * 100;
  return (c < 10 ? c.toFixed(1) : String(Math.round(c))) + '¢';
};
const perThousand = (usd) =>
  usd == null ? '—' : '$' + Math.round(usd * 1000).toLocaleString('en-US');
const usd = (n) => (n == null ? '—' : '$' + n.toFixed(4));
const kb = (n) => (n == null ? '—' : Math.round(n / 1024).toLocaleString('en-US') + ' KB');
// One decimal under ten seconds, whole seconds above: "7.6 s" and "109 s" are
// both readable, "109.1 s" only pretends to precision the measurement lacks.
const seconds = (ms) =>
  ms == null ? '—' : (ms < 10_000 ? (ms / 1000).toFixed(1) : String(Math.round(ms / 1000))) + ' s';
// "6.5–11 s": one unit for the pair, not one per end.
const secondsRange = (a, b) =>
  a == null || b == null ? '—' : `${seconds(a).replace(/ s$/, '')}–${seconds(b)}`;
const wholeSeconds = (ms) => (ms == null ? '—' : String(Math.round(ms / 1000)));
const count = (n) => (n == null ? '—' : n.toLocaleString('en-US'));
const ratio = (n) => (n == null ? '—' : n.toFixed(1) + '×');
const pct = (part, whole) => (whole ? Math.min(100, (part / whole) * 100).toFixed(1) : '0');

// Downscales images with the browser and writes each as a JPEG into `assetsDir`,
// returning the `assets/<name>.jpg` path to reference from the HTML.
async function makeThumber(browser, assetsDir, max = 380) {
  const page = await browser.newPage();
  mkdirSync(assetsDir, { recursive: true });
  return {
    async thumb(absPath, name) {
      if (!absPath || !existsSync(absPath)) return null;
      const uri = `data:image/*;base64,${readFileSync(absPath).toString('base64')}`;
      const dataUrl = await page.evaluate(
        async ({ uri, max }) => {
          const img = new Image();
          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
            img.src = uri;
          });
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL('image/jpeg', 0.8);
        },
        { uri, max }
      );
      const rel = `assets/${name}.jpg`;
      writeFileSync(join(assetsDir, `${name}.jpg`), Buffer.from(dataUrl.split(',')[1], 'base64'));
      return rel;
    },
    close: () => page.close(),
  };
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function mean(arr) {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
}
// Linear interpolation between neighbours, not a floored index. With ~19 samples
// per variant a floored p90 is always one of the observed values and always the
// lower one, which biases every latency figure toward "fits" — the exact
// direction that would flatter a variant sitting near the deadline.
function percentile(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const rank = (s.length - 1) * p;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return low === high ? s[low] : Math.round(s[low] + (rank - low) * (s[high] - s[low]));
}

export function statsFor(results, variantKey) {
  const rows = results.filter((r) => r.variant === variantKey);
  const imgs = rows.filter((r) => r.kind === 'image');
  const lat = imgs.map((r) => r.ms);
  const costs = imgs.map((r) => r.cost).filter((x) => x != null);
  return {
    n: rows.length,
    images: imgs.length,
    refusals: rows.filter((r) => r.kind === 'refusal').length,
    errors: rows.filter((r) => r.kind === 'error').length,
    meanMs: mean(lat),
    medianMs: median(lat),
    p90Ms: percentile(lat, 0.9),
    minMs: lat.length ? Math.min(...lat) : null,
    maxMs: lat.length ? Math.max(...lat) : null,
    imageTokens: median(imgs.map((r) => r.imageTokens).filter(Boolean)),
    avgCost: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    avgBytes: mean(imgs.map((r) => r.outBytes).filter(Boolean)),
    fmt: imgs[0]?.outFmt ?? '—',
  };
}

// One hue per variant, spread around the wheel and kept off the interactive blue
// --accent so a colored variant name never reads as a tappable link.
function variantHue(index, total) {
  const START_HUE = 168;
  const SWEEP = 300;
  return Math.round(START_HUE + (SWEEP * index) / Math.max(1, total));
}

function variantColorCss(variants) {
  return variants
    .map((v, i) => {
      const hue = variantHue(i, variants.length);
      return (
        `:root{--v-${v.key}:hsl(${hue} 62% 34%)}` +
        `@media (prefers-color-scheme:dark){:root{--v-${v.key}:hsl(${hue} 58% 66%)}}` +
        `:root[data-theme=dark]{--v-${v.key}:hsl(${hue} 58% 66%)}` +
        `:root[data-theme=light]{--v-${v.key}:hsl(${hue} 62% 34%)}` +
        `.gallery.off-${v.key} [data-v="${v.key}"]{display:none}`
      );
    })
    .join('\n');
}

// What each corpus category mimics, in the words a reader of the gallery needs
// rather than the filename prefix the harness uses. The prefixes are the
// `inputs/<category>__…` vocabulary documented in tools/model-eval/README.md.
const CATEGORY_NOTES = {
  'coloring-outline': {
    name: 'Coloring page, barely started',
    note: 'A coloring page just opened, or with a stroke or two on it.',
  },
  'coloring-manual': {
    name: 'Coloring page, colored by hand',
    note: 'A coloring page with regions scribbled in using palette colors.',
  },
  'coloring-magic': {
    name: 'Coloring page, magic brush',
    note: 'A coloring page revealed with the magic brush: flat color along the strokes.',
  },
  night: { name: 'Night mode', note: 'Chalk line art on dark paper.' },
  'magic-plain': {
    name: 'Magic brush on blank paper',
    note: 'Rainbow color revealed along strokes on an otherwise empty page.',
  },
  'scribble-1color': {
    name: 'A few strokes, one color',
    note: 'A handful of strokes in a single palette color, placed the way a toddler places them.',
  },
  'art-detail': {
    name: 'Freehand scenes',
    note: 'Free drawings at low, medium, and high line counts.',
  },
  safety: {
    name: 'Pretend-play probe',
    note: 'A toy sword. The right answer is a picture, not a refusal.',
  },
  gen: {
    name: 'Filled drawings',
    note: 'Model-authored art with solid shapes and scribbled fill.',
  },
  line: {
    name: 'Outlines only',
    note: 'Open outlines with nothing filled in. With no color to anchor the palette, this is where models invent the most. Judge these rows for invention, not beauty.',
  },
  scribble: {
    name: 'Scribbled fill',
    note: 'Model-authored art with areas colored in by visible back-and-forth passes.',
  },
  mess: {
    name: 'Messy sessions',
    note: 'Dots, tangles, pretend writing, and crammed corners.',
  },
  crayon: {
    name: 'Crayon captures',
    note: 'Store scenes replayed in the live app with the crayon, captured off the real canvas.',
  },
  store: {
    name: 'Store scenes',
    note: 'The authored store-screenshot scenes rasterized onto paper: full multi-subject art.',
  },
};
const categoryInfo = (cat) => CATEGORY_NOTES[cat] ?? { name: cat, note: '' };

// `coloring-manual__cow__wide` → { name: 'cow', aspect: 'wide' }. Category and
// aspect are the outer segments; whatever sits between is the drawing's name.
function drawingParts(id) {
  const parts = id.split('__');
  return {
    name: parts.slice(1, -1).join(' · ') || id,
    aspect: parts.length > 2 ? parts.at(-1) : '',
  };
}

// The toolbar groups variants by model, with one chip per effort tier, so eight
// candidates fit one row on a laptop. The "-flash-image" suffix carries nothing
// once the color dot identifies the chip.
const shortModel = (model) => model.replace(/-flash-image$/, '').replace(/^gemini-/, 'gemini ');
function variantGroups(variants) {
  const groups = [];
  for (const v of variants) {
    const group = groups.find((g) => g.model === v.model);
    if (group) group.members.push(v);
    else groups.push({ model: v.model, members: [v] });
  }
  return groups;
}

// A provider error message is a paragraph with a request id in it; the first
// sentence is the part a reader can act on.
function firstSentence(text, max = 120) {
  const s = String(text ?? '').trim();
  const cut = s.search(/[.!?](\s|$)/);
  const head = cut === -1 ? s : s.slice(0, cut + 1);
  return head.length > max ? head.slice(0, max - 1) + '…' : head;
}

function runDate(runId) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(runId);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const EXTRA_CSS = `
.stat-row .chip b{font-variant-numeric:tabular-nums}
.lead{color:var(--muted);max-width:68ch;margin:0 0 14px}
.lead b{color:var(--ink);font-weight:700}
.hint{font-size:.8rem;color:var(--muted);margin:10px 0 0;max-width:80ch}
.hint b{color:var(--ink)}

/* ---- Verdict ------------------------------------------------------------ */
.verdict{display:grid;grid-template-columns:minmax(230px,300px) 1fr;gap:clamp(18px,3vw,36px);background:var(--card);border:1px solid var(--hair);border-left:5px solid var(--gold);border-radius:var(--r-md);padding:clamp(18px,3vw,28px);box-shadow:var(--shadow-sm)}
.verdict .pick{align-self:start;position:sticky;top:12px}
.verdict .pick h2{font-size:clamp(1.35rem,2.6vw,1.7rem);line-height:1.15;margin:4px 0 8px;letter-spacing:-.02em;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.verdict .pick h2 .swatch{width:14px;height:14px;border-radius:99px;background:var(--vc,var(--gold));flex:0 0 auto}
.verdict .pick p{margin:0;color:var(--muted);font-size:.95rem}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0 0;padding:0;list-style:none}
.kpis li{background:var(--card-2);border:1px solid var(--hair);border-radius:var(--r-sm);padding:10px 12px}
.kpis b{display:block;font-size:1.3rem;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.1}
.kpis span{font-size:.74rem;color:var(--muted);font-weight:600;line-height:1.2;display:block;margin-top:3px}
.verdict .body{max-width:72ch;font-size:.96rem}
.verdict .body h3{font-size:.95rem;margin:0 0 4px;color:var(--gold);font-weight:750;letter-spacing:0}
.verdict .body h3+p{margin-top:0}
.verdict .body p{margin:0 0 14px}
.verdict .body p:last-child{margin-bottom:0}
.verdict .body ul{margin:0 0 14px;padding-left:18px}
.verdict .body li{margin:0 0 6px}
.verdict .body li b{color:var(--ink)}
.verdict .body a{text-decoration:underline;text-underline-offset:2px}
@media (max-width:760px){.verdict{grid-template-columns:1fr}.verdict .pick{position:static}}
@media (max-width:420px){.kpis b{font-size:1.15rem}}

/* ---- Scorecard ---------------------------------------------------------- */
.seg{display:inline-flex;align-items:center;gap:4px;padding:3px;background:var(--card-2);border:1px solid var(--hair);border-radius:999px}
.seg .lbl{font-size:.74rem;color:var(--muted);font-weight:600;padding:0 6px 0 9px}
.seg button{font:inherit;font-size:.78rem;font-weight:650;color:var(--muted);background:none;border:0;border-radius:999px;padding:4px 11px;cursor:pointer}
.seg button:hover{color:var(--ink)}
.seg button[aria-pressed=true]{background:var(--card);color:var(--ink);box-shadow:var(--shadow-sm);border:1px solid var(--hair)}
.seg button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.score-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:0 0 12px}
.score{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.score-row{display:grid;grid-template-columns:minmax(170px,1.15fr) minmax(140px,1fr) minmax(190px,1.5fr) minmax(88px,auto);grid-template-areas:"name cost time out";gap:12px 22px;align-items:center;background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);padding:12px 18px;box-shadow:var(--shadow-sm)}
.score-row.now{border-color:color-mix(in srgb,var(--vc) 55%,var(--hair));background:color-mix(in srgb,var(--vc) 5%,var(--card))}
.sc-name{grid-area:name;display:flex;flex-direction:column;gap:3px;min-width:0}
.sc-name b{display:flex;align-items:center;gap:8px;font-weight:750;color:var(--vc,var(--ink));font-size:.98rem;line-height:1.2;white-space:nowrap}
.sc-name .swatch{width:10px;height:10px;border-radius:99px;background:var(--vc);flex:0 0 auto}
.sc-name .role{font-size:.76rem;color:var(--muted);font-weight:500;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.tag{display:inline-block;font-size:.66rem;font-weight:750;text-transform:uppercase;letter-spacing:.05em;padding:1px 7px;border-radius:999px;background:var(--accent-wash);color:var(--accent-ink)}
.sc-metric{min-width:0}
.sc-cost{grid-area:cost}.sc-time{grid-area:time}
.sc-val{font-size:1.2rem;font-weight:780;letter-spacing:-.015em;font-variant-numeric:tabular-nums;line-height:1.1;white-space:nowrap}
.sc-val small{font-size:.7rem;font-weight:600;color:var(--muted);letter-spacing:.02em;margin-left:3px}
.sc-sub{font-size:.74rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.bar{position:relative;height:7px;border-radius:99px;background:color-mix(in srgb,var(--ink) 8%,transparent);margin:7px 0 5px}
.bar i{position:absolute;left:0;top:0;height:100%;border-radius:99px;background:var(--vc,var(--accent))}
.bar i.p90{background:color-mix(in srgb,var(--vc,var(--accent)) 28%,transparent)}
.bar .mark{position:absolute;top:-4px;height:15px;border-left:2px dashed var(--bad);opacity:.7}
.sc-out{grid-area:out;text-align:right;font-size:.8rem;color:var(--muted);line-height:1.35;white-space:nowrap}
.sc-out b{display:block;font-size:1rem;color:var(--ink);font-variant-numeric:tabular-nums}
.sc-out .flag{color:var(--bad);font-weight:650}
.legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:.76rem;color:var(--muted);margin:10px 2px 0;align-items:center}
.legend i{display:inline-block;vertical-align:middle;width:18px;height:7px;border-radius:99px;background:var(--muted);margin-right:6px}
.legend i.p90{opacity:.3}
.legend i.mark{width:0;height:12px;border-left:2px dashed var(--bad);border-radius:0;opacity:.7}
@media (max-width:760px){
  .score-row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"name out" "cost time";gap:10px 14px;padding:12px 14px}
  .sc-name b{font-size:.9rem;gap:6px}
  .sc-val{font-size:1.1rem}
  .sc-sub{white-space:normal}
  .sc-out{font-size:.74rem}.sc-out b{font-size:.92rem}.sc-out .w{display:none}
  details.more summary .desc{display:none}
}
@media (max-width:380px){.score-row{grid-template-columns:1fr;grid-template-areas:"name" "out" "cost" "time"}.sc-out{text-align:left}.sc-out b{display:inline;margin-right:6px}}

/* ---- Tables (the full numbers, per-category times) ---------------------- */
details.more{margin:14px 0 0;border:1px solid var(--hair);border-radius:var(--r-md);background:var(--card)}
details.more summary{cursor:pointer;padding:11px 16px;font-weight:650;font-size:.9rem;color:var(--ink);list-style:none;display:flex;align-items:center;gap:8px}
details.more summary::-webkit-details-marker{display:none}
details.more summary::before{content:"";width:7px;height:7px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(-45deg);transition:transform .15s;margin-left:2px}
details.more[open] summary::before{transform:rotate(45deg)}
details.more summary .desc{color:var(--muted);font-weight:500;font-size:.82rem}
details.more .wrap{border:0;border-top:1px solid var(--hair);border-radius:0 0 var(--r-md) var(--r-md)}
.wrap{overflow-x:auto;border-radius:var(--r-md);border:1px solid var(--hair);-webkit-overflow-scrolling:touch}
table{border-collapse:separate;border-spacing:0;width:100%;margin:0;font-size:13px;background:var(--card)}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid var(--hair);white-space:nowrap}
th{background:var(--card-2);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);position:sticky;top:0}
th:not(:first-child),td:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
tr:last-child td{border-bottom:0}
td:first-child,th:first-child{position:sticky;left:0;background:var(--card);z-index:1}
th:first-child{background:var(--card-2);z-index:2}
td.vname{font-weight:700;color:var(--vc,var(--ink))}
td.vname small{display:block;font-weight:500;color:var(--muted)}
td.heat{background:color-mix(in srgb,var(--warn) calc(var(--t) * 34%),transparent)}
.outcomes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.outcomes li{background:var(--card);border:1px solid var(--hair);border-radius:var(--r-sm);padding:9px 14px;font-size:.88rem;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.outcomes .kind{font-size:.68rem;font-weight:750;text-transform:uppercase;letter-spacing:.05em;padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--bad) 14%,transparent);color:var(--bad)}
.outcomes .kind.refusal{background:color-mix(in srgb,var(--ok) 14%,transparent);color:var(--ok)}
.outcomes .who{font-weight:650;color:var(--vc,var(--ink))}
.outcomes .why{color:var(--muted)}

/* ---- Gallery ------------------------------------------------------------ */
.gbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:10px;margin:0 calc(-1 * clamp(16px,4vw,44px));padding:8px clamp(16px,4vw,44px);background:color-mix(in srgb,var(--paper) 88%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid var(--hair)}
.gbar select{flex:0 0 auto;width:auto;font:inherit;font-size:.82rem;font-weight:650;color:var(--ink);background:var(--card);border:1px solid var(--hair);border-radius:999px;padding:6px 30px 6px 12px;max-width:44vw;appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 15px) 55%,calc(100% - 10px) 55%;background-size:5px 5px;background-repeat:no-repeat;cursor:pointer;flex:0 1 auto;text-overflow:ellipsis}
.gbar select:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.vpick{display:flex;align-items:center;gap:6px;flex:1 1 0;min-width:0;overflow-x:auto;scrollbar-width:none;padding:2px 0;mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent);-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent)}
.vpick::-webkit-scrollbar{display:none}
.vpick::after{content:"";flex:0 0 28px}
.vgroup{display:inline-flex;align-items:center;flex:0 0 auto;gap:3px;padding:2px 3px 2px 9px;border:1px solid var(--hair);border-radius:999px;background:var(--card)}
.vgroup .vg-name{font-size:.74rem;font-weight:700;color:var(--ink);margin-right:3px;white-space:nowrap}
.vgroup .vchip{border-color:transparent;background:color-mix(in srgb,var(--vc) 10%,transparent);padding:3px 9px 3px 7px}
.vgroup .vchip[aria-pressed=false]{background:transparent}
.vchip{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;font:inherit;font-size:.76rem;font-weight:650;color:var(--vc,var(--ink));background:var(--card);border:1px solid color-mix(in srgb,var(--vc) 40%,var(--hair));border-radius:999px;padding:4px 10px 4px 8px;cursor:pointer;white-space:nowrap;line-height:1.2}
.vchip i{width:9px;height:9px;border-radius:99px;background:var(--vc);flex:0 0 auto}
.vchip[aria-pressed=false]{color:var(--faint);border-color:var(--hair);background:transparent;text-decoration:line-through;text-decoration-color:color-mix(in srgb,var(--faint) 60%,transparent)}
.vchip[aria-pressed=false] i{background:var(--hair-strong)}
.vchip:focus-visible,.vall:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.vall{flex:0 0 auto;font:inherit;font-size:.74rem;font-weight:650;color:var(--muted);background:none;border:1px solid var(--hair);border-radius:999px;padding:4px 9px;cursor:pointer}
.vall:hover{color:var(--ink)}
.gallery{display:flex;flex-direction:column;gap:clamp(22px,3vw,34px);margin-top:18px}
.cat{scroll-margin-top:58px}
.cat-head{margin:0 0 10px;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}
.cat-head h3{font-size:1.05rem;margin:0;letter-spacing:-.01em;font-weight:750}
.cat-head .ct{font-size:.72rem;color:var(--muted);font-weight:650;border:1px solid var(--hair);border-radius:999px;padding:1px 8px;vertical-align:middle}
.cat-head p{margin:0;flex-basis:100%;color:var(--muted);font-size:.86rem;max-width:72ch}
.draw{margin:0 0 14px;scroll-margin-top:58px}
.draw:last-child{margin-bottom:0}
.draw h4{margin:0 0 8px;font-size:.84rem;font-weight:650;color:var(--muted);display:flex;align-items:baseline;gap:8px}
.draw h4 b{color:var(--ink);font-weight:750;font-size:.9rem}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--tile,160px),1fr));gap:10px;align-items:start}
.tile{margin:0;min-width:0;position:relative}
.tile .art{width:100%;aspect-ratio:1;object-fit:contain;display:block;border-radius:var(--r-sm);border:1px solid var(--hair);background:#fff}
.tile.input .art{border:2px solid var(--ink)}
@media (min-width:600px){.gallery:not(.few) .tile.input{grid-column:span 2;grid-row:span 2}}
.tile.input figcaption{position:absolute;top:8px;left:8px;font-size:.62rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:var(--ink);color:var(--paper);pointer-events:none}
.swap{position:relative;display:block;width:100%;padding:0;border:0;background:none;cursor:pointer;border-radius:var(--r-sm);color:inherit;font:inherit}
.swap .art{transition:box-shadow .12s ease}
.swap:hover .art{box-shadow:var(--shadow-md)}
.swap:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.swap.show-in .art{border:2px solid var(--vc,var(--accent))}
.badge{position:absolute;top:8px;left:8px;font-size:.62rem;font-weight:800;letter-spacing:.02em;line-height:1.25;padding:3px 8px;border-radius:10px;background:color-mix(in srgb,#fff 86%,transparent);border:1px solid color-mix(in srgb,var(--vc) 35%,transparent);color:var(--vc,var(--ink));pointer-events:none;max-width:calc(100% - 16px);text-align:left}
.swap.show-in .badge{background:var(--vc,var(--accent));color:#fff;border-color:var(--vc,var(--accent))}
.ph{aspect-ratio:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;padding:12px;text-align:center;border:1px dashed var(--hair-strong);border-radius:var(--r-sm);background:color-mix(in srgb,var(--card),var(--bad) 7%);font-size:.72rem;color:var(--muted)}
.ph b{font-size:.66rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--bad)}
.ph .who{color:var(--vc,var(--ink));font-weight:650}
.ph.refusal{background:color-mix(in srgb,var(--card),var(--ok) 9%)}
.ph.refusal b{color:var(--ok)}
.method{margin:0;padding-left:20px;max-width:80ch}
.method li{margin:6px 0;color:var(--muted);font-size:.92rem}
.method li b{color:var(--ink)}
.method li a{text-decoration:underline;text-underline-offset:2px}
@media (min-width:700px){.vpick{flex-wrap:wrap;overflow:visible;mask-image:none;-webkit-mask-image:none}.vpick::after{display:none}.cat,.draw{scroll-margin-top:96px}}
@media (max-width:640px){
  .gbar{gap:8px;padding-top:7px;padding-bottom:7px}
  .gbar select{font-size:.78rem;padding:6px 26px 6px 10px}
  .tiles{--tile:150px;gap:8px}
  .cat-head h3{font-size:1rem}
}
@media (max-width:360px){.tiles{--tile:132px}}
@media (prefers-reduced-motion:reduce){.swap .art,details.more summary::before{transition:none}}
`;

const SCRIPT = `<script>
(function () {
  var gallery = document.getElementById('gallery');
  var KEY = 'model-eval-report:hidden-variants';
  // Below this many visible candidates a double-size input tile leaves a hole beside it.
  var FEW_SHOWN = 4;

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.swap');
    if (!btn) return;
    var img = btn.querySelector('img.art');
    var badge = btn.querySelector('.badge');
    if (!btn._out) btn._out = img.getAttribute('src');
    var inputImg = btn.closest('.draw').querySelector('.tile.input img');
    var showIn = btn.classList.toggle('show-in');
    img.setAttribute('src', showIn ? inputImg.getAttribute('src') : btn._out);
    badge.textContent = showIn ? "child's drawing" : btn.dataset.label;
    btn.setAttribute('aria-pressed', String(showIn));
  });

  var chips = Array.prototype.slice.call(document.querySelectorAll('.vchip'));
  function hidden() {
    return chips.filter(function (c) { return c.getAttribute('aria-pressed') === 'false'; })
      .map(function (c) { return c.dataset.v; });
  }
  function apply(save) {
    chips.forEach(function (c) {
      gallery.classList.toggle('off-' + c.dataset.v, c.getAttribute('aria-pressed') === 'false');
    });
    var all = document.querySelector('.vall');
    if (all) all.hidden = hidden().length === 0;
    gallery.classList.toggle('few', chips.length - hidden().length <= FEW_SHOWN);
    if (save) { try { localStorage.setItem(KEY, JSON.stringify(hidden())); } catch (_) {} }
  }
  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      c.setAttribute('aria-pressed', String(c.getAttribute('aria-pressed') === 'false'));
      apply(true);
    });
  });
  var all = document.querySelector('.vall');
  if (all) all.addEventListener('click', function () {
    chips.forEach(function (c) { c.setAttribute('aria-pressed', 'true'); });
    apply(true);
  });
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || '[]');
    chips.forEach(function (c) { if (saved.indexOf(c.dataset.v) !== -1) c.setAttribute('aria-pressed', 'false'); });
  } catch (_) {}
  apply(false);

  var jump = document.getElementById('cat-jump');
  if (jump) jump.addEventListener('change', function () {
    var target = jump.value && document.getElementById(jump.value);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    jump.selectedIndex = 0;
  });

  var score = document.getElementById('score');
  document.querySelectorAll('[data-sort]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-sort]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      btn.setAttribute('aria-pressed', 'true');
      var key = btn.dataset.sort;
      var rows = Array.prototype.slice.call(score.children);
      rows.sort(function (a, b) {
        if (key === 'listed') return Number(a.dataset.order) - Number(b.dataset.order);
        var av = Number(a.dataset[key]), bv = Number(b.dataset[key]);
        if (isNaN(av)) return 1; if (isNaN(bv)) return -1;
        return av - bv;
      });
      rows.forEach(function (r) { score.appendChild(r); });
    });
  });
})();
</script>`;

// Pure HTML assembly. Every result must already carry `_thumb` (or null) and
// `inThumb[id]` must resolve — no filesystem or browser work happens here, so a
// bundle can be re-rendered from an existing run without a browser.
export function renderReportHtml({
  runId,
  results,
  samples,
  concurrency,
  variants,
  inThumb,
  verdictHtml,
  agg,
}) {
  const ids = [...new Set(results.map((r) => r.id))];
  const cats = [...new Set(results.map((r) => r.category))].sort((a, b) => a.localeCompare(b));
  const varStyle = (v) => `--vc:var(--v-${v.key})`;
  const byKey = Object.fromEntries(variants.map((v) => [v.key, v]));
  const spend = results.reduce((total, r) => total + (r.cost ?? 0), 0);

  const costs = variants.map((v) => agg[v.key].avgCost).filter((c) => c != null);
  const cheapest = costs.length ? Math.min(...costs) : null;
  const maxCost = costs.length ? Math.max(...costs) : null;
  const maxP90 = Math.max(...variants.map((v) => agg[v.key].p90Ms ?? 0), GENERATE_DEADLINE_MS);
  const deadlineLeft = pct(GENERATE_DEADLINE_MS, maxP90);

  function scoreRow(v, order) {
    const s = agg[v.key];
    const isNow = PRODUCTION_VARIANT && v.key === PRODUCTION_VARIANT.key;
    const failed = s.refusals + s.errors;
    const flags = [
      s.errors ? `${s.errors} error${s.errors > 1 ? 's' : ''}` : '',
      s.refusals ? `${s.refusals} refusal${s.refusals > 1 ? 's' : ''}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return `<li class="score-row${isNow ? ' now' : ''}" style="${varStyle(v)}" data-order="${order}" data-cost="${s.avgCost ?? ''}" data-ms="${s.medianMs ?? ''}">
      <div class="sc-name"><b><span class="swatch"></span>${esc(v.label)}</b><span class="role">${esc(v.role)}${isNow ? ' <span class="tag">in production now</span>' : ''}</span></div>
      <div class="sc-metric sc-cost">
        <div class="sc-val">${cents(s.avgCost)}<small>per image</small></div>
        <div class="bar"><i style="width:${pct(s.avgCost, maxCost)}%"></i></div>
        <div class="sc-sub">${perThousand(s.avgCost)} per 1,000${cheapest && s.avgCost ? ` · ${s.avgCost === cheapest ? 'cheapest' : ratio(s.avgCost / cheapest) + ' cheapest'}` : ''}</div>
      </div>
      <div class="sc-metric sc-time">
        <div class="sc-val">${seconds(s.medianMs)}<small>median</small></div>
        <div class="bar"><i class="p90" style="width:${pct(s.p90Ms, maxP90)}%"></i><i style="width:${pct(s.medianMs, maxP90)}%"></i><span class="mark" style="left:${deadlineLeft}%"></span></div>
        <div class="sc-sub">p90 ${seconds(s.p90Ms)} · range ${secondsRange(s.minMs, s.maxMs)}</div>
      </div>
      <div class="sc-out"><b>${s.images} / ${s.n}</b><span class="w">images</span>${failed ? `<br><span class="flag">${esc(flags)}</span>` : ''}</div>
    </li>`;
  }

  const fullRows = variants
    .map((v) => {
      const s = agg[v.key];
      return `<tr>
      <td class="vname" style="${varStyle(v)}">${esc(v.label)}<small>${esc(v.role)}</small></td>
      <td>${s.images} / ${s.n}</td>
      <td>${count(s.imageTokens)}</td>
      <td>${usd(s.avgCost)}</td>
      <td>${perThousand(s.avgCost)}</td>
      <td>${cheapest && s.avgCost ? ratio(s.avgCost / cheapest) : '—'}</td>
      <td>${seconds(s.meanMs)}</td>
      <td>${seconds(s.medianMs)}</td>
      <td>${seconds(s.p90Ms)}</td>
      <td>${seconds(s.minMs)}</td>
      <td>${seconds(s.maxMs)}</td>
      <td>${s.refusals}</td>
      <td>${s.errors}</td>
      <td>${kb(s.avgBytes)}</td>
    </tr>`;
    })
    .join('');

  const catMeans = cats.map((c) => ({
    cat: c,
    n: new Set(results.filter((r) => r.category === c).map((r) => r.id)).size,
    cells: variants.map((v) =>
      mean(
        results
          .filter((r) => r.category === c && r.variant === v.key && r.kind === 'image')
          .map((r) => r.ms)
      )
    ),
  }));
  const maxCatMean = Math.max(...catMeans.flatMap((row) => row.cells.filter((x) => x != null)), 1);
  const catRows = catMeans
    .map(
      (row) =>
        `<tr><td>${esc(categoryInfo(row.cat).name)}</td><td>${row.n}</td>${row.cells
          .map(
            (ms) =>
              `<td class="heat" style="--t:${ms == null ? 0 : (ms / maxCatMean).toFixed(2)}">${wholeSeconds(ms)}</td>`
          )
          .join('')}</tr>`
    )
    .join('');

  const nonImage = results.filter((r) => r.kind !== 'image');

  function outputTile(s, variant, multi) {
    const tag = multi ? `${variant.label} #${s.sample}` : variant.label;
    if (s.kind !== 'image') {
      const cls = s.kind === 'refusal' ? 'ph refusal' : 'ph';
      return `<div class="tile ${cls}" data-v="${esc(variant.key)}" style="${varStyle(variant)}"><b>${s.kind === 'refusal' ? 'refused' : 'no image'}</b><span class="who">${esc(tag)}</span><span>${esc(firstSentence(s.reason || s.finishReason, 90))}</span></div>`;
    }
    return `<div class="tile" data-v="${esc(variant.key)}"><button class="swap" type="button" aria-pressed="false" style="${varStyle(variant)}" title="Tap to compare with the child's drawing" data-label="${esc(tag)}"><img class="art" loading="lazy" src="${s._thumb}" alt="${esc(tag)} output for ${esc(s.id)}"/><span class="badge">${esc(tag)}</span></button></div>`;
  }

  function drawing(id) {
    const { name, aspect } = drawingParts(id);
    const tiles = variants.flatMap((v) => {
      const ss = results
        .filter((r) => r.id === id && r.variant === v.key)
        .sort((a, b) => a.sample - b.sample);
      return ss.map((s) => outputTile(s, v, ss.length > 1));
    });
    return `<article class="draw" id="draw-${esc(id)}">
      <h4><b>${esc(name)}</b>${aspect ? `<span>${esc(aspect)}</span>` : ''}</h4>
      <div class="tiles">
        <figure class="tile input"><img class="art" loading="lazy" src="${inThumb[id]}" alt="the child's drawing, ${esc(id)}"/><figcaption>Child's drawing</figcaption></figure>
        ${tiles.join('\n        ')}
      </div>
    </article>`;
  }

  function categorySection(cat) {
    const rowIds = ids.filter((id) => id.startsWith(cat + '__'));
    const info = categoryInfo(cat);
    return `<section class="cat" id="cat-${esc(cat)}">
      <div class="cat-head"><h3>${esc(info.name)}</h3><span class="ct">${rowIds.length} drawing${rowIds.length === 1 ? '' : 's'}</span>${info.note ? `<p>${esc(info.note)}</p>` : ''}</div>
      ${rowIds.map(drawing).join('\n')}
    </section>`;
  }

  const date = runDate(runId);
  const tagline =
    `${variants.length} candidate image models were each handed the same ${ids.length} toddler drawings and the exact ` +
    `prompt the app sends. This page compares what each one cost, how long it took, and what it drew.`;

  const stats =
    `<span class="chip"><b>${variants.length}</b> candidates</span>` +
    `<span class="chip"><b>${ids.length}</b> drawings · ${cats.length} categories</span>` +
    `<span class="chip"><b>${results.length}</b> calls${samples > 1 ? ` · ${samples} per cell` : ''}</span>` +
    `<span class="chip"><b>$${spend.toFixed(2)}</b> spent</span>` +
    (date ? `<span class="chip">${esc(date)}</span>` : '');

  const body = `${masthead({
    title: 'Image-model bake-off',
    tagline,
    home: '../../index.html',
    crumbs: [{ label: 'Scrapbook', href: '../../index.html' }, { label: 'Image-model bake-off' }],
    stats,
  })}
<main>
  <div class="shell">
    ${verdictHtml ? `<div class="verdict">${verdictHtml}</div>` : ''}

    <div class="section-head"><h2>Cost and speed</h2><span class="desc">one row per candidate</span></div>
    <div class="score-tools">
      <p class="lead" style="margin:0">Cost is what one generated image costs at list prices. Time is how long each call took, from request to response.</p>
      <div class="seg" role="group" aria-label="Sort candidates"><span class="lbl">Sort</span><button type="button" data-sort="listed" aria-pressed="true">As listed</button><button type="button" data-sort="cost" aria-pressed="false">Cheapest</button><button type="button" data-sort="ms" aria-pressed="false">Fastest</button></div>
    </div>
    <ol class="score" id="score">
    ${variants.map(scoreRow).join('\n')}
    </ol>
    <div class="legend"><span><i></i>median</span><span><i class="p90"></i>p90 (9 in 10 calls finish by here)</span><span><i class="mark"></i>${(GENERATE_DEADLINE_MS / 1000).toFixed(0)} s, the limit of a single synchronous request</span></div>
    <p class="hint">The dashed line is the app's original one-request limit: the server had to answer inside
    ${(GENERATE_DEADLINE_MS / 1000).toFixed(0)} s or Netlify cut it off (ADR-0063). Generation now runs in a
    background worker the app polls (ADR-0115), so a candidate past the line is slow, not unusable.
    Times were measured with ${concurrency} call${concurrency > 1 ? 's running at once, so they run slower than a single call on its own would' : ' at a time'}.</p>

    <details class="more"><summary>All the numbers <span class="desc">tokens, mean, min and max, file size</span></summary>
    <div class="wrap"><table>
    <tr>
      <th>Candidate</th><th>Images</th><th>Image tokens<br>(median)</th><th>$ per image</th><th>$ per 1,000</th><th>vs cheapest</th>
      <th>Mean</th><th>Median</th><th>p90</th><th>Min</th><th>Max</th><th>Refused</th><th>Errors</th><th>File size</th>
    </tr>
    ${fullRows}
    </table></div></details>

    <details class="more"><summary>Time by category <span class="desc">mean seconds per drawing type</span></summary>
    <div class="wrap"><table>
    <tr><th>Category</th><th>Drawings</th>${variants.map((v) => `<th style="${varStyle(v)};color:var(--vc)">${esc(v.label)}</th>`).join('')}</tr>
    ${catRows}
    </table></div></details>

    <div class="section-head"><h2>Calls that returned no image</h2><span class="desc">${nonImage.length ? `${nonImage.length} of ${results.length}` : 'none'}</span></div>
    ${
      nonImage.length
        ? `<ul class="outcomes">${nonImage
            .map((r) => {
              const v = byKey[r.variant];
              const { name } = drawingParts(r.id);
              return `<li style="${v ? varStyle(v) : ''}"><span class="kind ${esc(r.kind)}">${r.kind === 'refusal' ? 'refused' : 'error'}</span><span class="who">${esc(r.variantLabel)}</span><span>on <a href="#draw-${esc(r.id)}">${esc(name)}</a> (${esc(categoryInfo(r.category).name)})</span><span class="why">${esc(firstSentence(r.reason || r.finishReason, 140))}</span></li>`;
            })
            .join('')}</ul>`
        : '<p class="lead">Every drawing came back as an image from every candidate. No refusals, no errors.</p>'
    }

    <div class="section-head"><h2>Gallery</h2><span class="desc">every drawing, every candidate</span></div>
    <p class="lead">Each drawing is shown first, followed by what every candidate made of it. <b>Tap any
    result to swap it for the child's drawing</b> and back, so you can see exactly what changed. Use the
    toolbar to hide candidates you have ruled out.</p>
    <div class="gbar">
      <select id="cat-jump" aria-label="Jump to a category">
        <option value="">Jump to…</option>
        ${cats.map((c) => `<option value="cat-${esc(c)}">${esc(categoryInfo(c).name)}</option>`).join('')}
      </select>
      <div class="vpick" role="group" aria-label="Candidates shown">
        ${variantGroups(variants)
          .map(
            ({ model, members }) =>
              `<div class="vgroup">${members.length > 1 || members[0].quality ? `<span class="vg-name">${esc(shortModel(model))}</span>` : ''}${members
                .map(
                  (v) =>
                    `<button class="vchip" type="button" data-v="${esc(v.key)}" aria-pressed="true" style="${varStyle(v)}" title="${esc(v.label)}"><i></i>${esc(v.quality ?? shortModel(v.model))}</button>`
                )
                .join('')}</div>`
          )
          .join('')}
        <button class="vall" type="button" hidden>Show all</button>
      </div>
    </div>
    <div class="gallery" id="gallery">
    ${cats.map(categorySection).join('\n')}
    </div>

    <div class="section-head"><h2>How this was measured</h2></div>
    <ul class="method">
    <li><b>Inputs</b> are built to look like what <code>/api/generate-image</code> really receives: the paper color, the app's coloring line art, and the child's marks in the app's 15-color palette, flattened into one image. Regenerate them with <code>npm run model-eval:fixtures</code>.</li>
    <li><b>Every call sends the production request.</b> The prompt and the safety instruction are checked byte for byte against the app source before the run starts. Temperature is the default.</li>
    <li><b>The OpenAI candidates go through the Responses API image tool</b>, not <code>/v1/images/edits</code>. Only that path accepts a real system instruction and lets the model decline in words, which is what the app turns into its safety refusal. The image tool is left optional so the model can still decline.</li>
    <li><b>Cost is measured token usage times list price.</b> Image output dominates: ${Object.entries(
      RATES
    )
      .map(([model, rate]) => `${esc(model)} $${rate.imageOutPerM}`)
      .join(
        ', '
      )} per million image-output tokens. The OpenAI rows also include the tokens of the text model that reads the drawing and calls the image tool.</li>
    <li><b>Time</b> is wall-clock per call, ${concurrency > 1 ? `with ${concurrency} calls in flight at once, so each one ran slower than it would alone` : 'one call at a time'}.</li>
    <li><b>Safety</b> is only spot-checked here, with one pretend-play drawing that must be allowed. The blocked-content corpus needs <code>REDTEAM_FIXTURE_KEY</code> and <code>npm run redteam</code>.</li>
    <li>Run <code>${esc(runId)}</code>.</li>
    </ul>
  </div>
</main>
${siteFooter({ home: '../../index.html' })}
${SCRIPT}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Splotch · image-model bake-off — ${esc(runId)}</title>
${chromeStyle(EXTRA_CSS + '\n' + variantColorCss(variants))}
</head>
<body>
${body}
</body>
</html>
`;
}

export async function buildReport({
  runId,
  outDir,
  inputsDir,
  results,
  samples,
  concurrency = 1,
  variants,
  browser,
  verdictHtml,
}) {
  // The report is a self-contained folder: <outDir>/report/{index.html, assets/}.
  const bundleDir = join(outDir, 'report');
  const assetsDir = join(bundleDir, 'assets');
  mkdirSync(bundleDir, { recursive: true });
  const th = await makeThumber(browser, assetsDir);
  const ids = [...new Set(results.map((r) => r.id))];

  const inThumb = {};
  for (const id of ids) inThumb[id] = await th.thumb(join(inputsDir, `${id}.png`), `in__${id}`);
  for (const r of results)
    r._thumb = r.outFile
      ? await th.thumb(join(outDir, r.outFile), `out__${r.id}__${r.variant}__${r.sample}`)
      : null;
  await th.close();

  // One aggregation for both outputs, so the report HTML and summary.json can
  // never describe different numbers.
  const agg = Object.fromEntries(variants.map((v) => [v.key, statsFor(results, v.key)]));

  const html = renderReportHtml({
    runId,
    results,
    samples,
    concurrency,
    variants,
    inThumb,
    verdictHtml,
    agg,
  });
  const htmlPath = join(bundleDir, 'index.html');
  writeFileSync(htmlPath, html);

  // Provenance stays in the run dir, NOT in the published bundle (ADR-0059: only
  // index.html + assets/ are promoted to scrapbook/).
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ runId, concurrency, agg }, null, 2));
  return htmlPath;
}
