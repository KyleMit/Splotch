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
// effort tier, so the summary tables put variants in ROWS and metrics in columns
// (the only orientation that survives adding a tier), and the gallery scrolls
// sideways through one column per variant.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { NETLIFY_SYNC_TIMEOUT_MS } from '../../../web/src/lib/ai/limits.ts';
import { RATES } from './model-eval.mjs';
import { esc } from '../../lib/html.mjs';
import { chromeStyle, masthead, siteFooter } from '../../scrapbook/lib/scrapbook-chrome.mjs';

const usd = (n) => (n == null ? '—' : '$' + n.toFixed(4));
const kb = (n) => (n == null ? '—' : (n / 1024).toFixed(0) + ' KB');
const secs = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1) + ' s');

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
function percentile(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
}

function statsFor(results, variantKey) {
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
        `:root[data-theme=light]{--v-${v.key}:hsl(${hue} 62% 34%)}`
      );
    })
    .join('\n');
}

const EXTRA_CSS = `
.matchup{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.vs{display:inline-flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--hair);border-radius:999px;padding:5px 13px;font-size:.82rem;box-shadow:var(--shadow-sm)}
.vs .swatch{width:10px;height:10px;border-radius:99px;background:var(--vc,var(--muted))}
.vs b{font-weight:750}.vs .role{color:var(--muted);font-weight:500}
.verdict{background:var(--card);border:1px solid var(--hair);border-left:5px solid var(--gold);border-radius:var(--r-md);padding:16px 20px;margin:18px 0;box-shadow:var(--shadow-sm)}
.verdict b{color:var(--gold)}
table{border-collapse:separate;border-spacing:0;width:100%;margin:6px 0;font-size:13.5px;background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);overflow:hidden}
th,td{padding:9px 13px;text-align:left;border-bottom:1px solid var(--hair);white-space:nowrap}
th{background:var(--card-2);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:var(--muted)}
th:not(:first-child),td:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
tr:last-child td{border-bottom:0}
tbody tr:hover td{background:color-mix(in srgb,var(--accent-wash) 45%,transparent)}
td.vname{font-weight:700;color:var(--vc,var(--ink))}
td.vname small{display:block;font-weight:500;color:var(--muted);text-transform:none;letter-spacing:0}
.num{text-align:right;font-variant-numeric:tabular-nums}
.lose{color:var(--bad);font-weight:700}.winc{color:var(--ok);font-weight:700}
.wrap{overflow-x:auto;border-radius:var(--r-md);border:1px solid var(--hair)}
.wrap table{border:0;margin:0}
h3 .ct{font-size:12px;color:var(--muted);font-weight:600;border:1px solid var(--hair);border-radius:999px;padding:1px 9px;margin-left:6px;vertical-align:middle}
h3{font-size:15px;margin:26px 0 10px;color:var(--muted);text-transform:capitalize;letter-spacing:.02em;font-weight:750}
.gallery{display:flex;flex-direction:column;gap:14px}
.gscroll{overflow-x:auto;padding-bottom:6px}
.grow{display:grid;gap:12px;align-items:start;grid-auto-flow:column;grid-auto-columns:var(--colw);width:max-content;min-width:100%}
.grow.head{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--paper) 92%,transparent);backdrop-filter:blur(8px);padding:8px 0;border-bottom:1px solid var(--hair);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.grow.head .h{padding:0 4px;color:var(--vc,var(--muted));overflow:hidden;text-overflow:ellipsis}
.cell{margin:0;min-width:0}
.samples{display:flex;flex-direction:column;gap:12px}
.art{width:100%;height:200px;object-fit:contain;display:block;border-radius:var(--r-md);border:1px solid var(--hair);background:#fff}
.cap{font-size:11px;color:var(--muted);margin-top:6px;text-align:center;word-break:break-word}
.swap{position:relative;display:block;width:100%;padding:0;border:0;background:none;cursor:pointer;border-radius:var(--r-md)}
.swap .art{transition:box-shadow .12s ease}
.swap:hover .art{box-shadow:var(--shadow-md)}
.swap:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.swap.show-in .art{border-color:var(--vc,var(--accent));box-shadow:0 0 0 2px var(--vc,var(--accent))}
.badge{position:absolute;top:7px;left:7px;font-size:9.5px;font-weight:800;letter-spacing:.02em;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,#fff 84%,transparent);border:1px solid var(--hair);color:var(--vc,var(--ink));pointer-events:none;max-width:calc(100% - 14px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.swap.show-in .badge{background:var(--vc,var(--accent));color:#fff;border-color:var(--vc,var(--accent))}
.ph{height:200px;display:flex;flex-direction:column;justify-content:center;gap:5px;padding:12px;text-align:center;border:1px dashed var(--hair-strong);border-radius:var(--r-md);background:color-mix(in srgb,var(--card),var(--warn) 8%);font-size:11px}
.ph b{font-size:13px}.ph span{color:var(--muted);word-break:break-word}
.ph.refusal{background:color-mix(in srgb,var(--card),var(--ok) 10%)}
.toc{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.toc a{font-size:12px;text-decoration:none;color:var(--muted);border:1px solid var(--hair);border-radius:999px;padding:3px 11px;background:var(--card)}
.toc a:hover{border-color:var(--accent);color:var(--accent-ink)}
.lead{color:var(--muted);max-width:66ch}
.lead b{color:var(--ink);font-weight:700}
details{margin:8px 0}summary{cursor:pointer;color:var(--muted);font-size:.9rem}
ul.method{margin:8px 0;padding-left:20px}ul.method li{margin:5px 0;color:var(--muted)}ul.method li b{color:var(--ink)}
.hint{font-size:12px;color:var(--muted);margin:4px 0 0}
@media (prefers-reduced-motion:reduce){.swap .art{transition:none}}
@media (max-width:720px){.art,.ph{height:150px}}
`;

const SWAP_SCRIPT = `<script>
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.swap');
    if (!btn) return;
    var img = btn.querySelector('img.art');
    var badge = btn.querySelector('.badge');
    if (!btn._out) btn._out = img.getAttribute('src');
    var inputImg = btn.closest('.grow').querySelector('figure.cell .art');
    var showIn = btn.classList.toggle('show-in');
    img.setAttribute('src', showIn ? inputImg.getAttribute('src') : btn._out);
    badge.textContent = showIn ? 'input' : btn.dataset.label;
    btn.setAttribute('aria-pressed', String(showIn));
  });
</script>`;

// Pure HTML assembly. Every result must already carry `_thumb` (or null) and
// `inThumb[id]` must resolve — no filesystem or browser work happens here, so
// this is shared by the browser build and the no-browser reskin path.
function renderReportHtml({
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
  const cats = [...new Set(results.map((r) => r.category))];
  // One column per variant plus the input column, sized so about three fit on a
  // laptop and the rest are a sideways scroll away.
  const colWidth = 'minmax(210px, 1fr)';
  const varStyle = (v) => `--vc:var(--v-${v.key})`;

  const cheapest = variants
    .map((v) => agg[v.key].avgCost)
    .filter((c) => c != null)
    .sort((a, b) => a - b)[0];

  const summaryRows = variants
    .map((v) => {
      const s = agg[v.key];
      const overCeiling = s.medianMs != null && s.medianMs > NETLIFY_SYNC_TIMEOUT_MS;
      const costRatio = cheapest && s.avgCost ? s.avgCost / cheapest : null;
      return `<tr>
      <td class="vname" style="${varStyle(v)}">${esc(v.label)}<small>${esc(v.role)}</small></td>
      <td class="num">${s.images}/${s.n}</td>
      <td class="num">${s.imageTokens ?? '—'}</td>
      <td class="num">${usd(s.avgCost)}</td>
      <td class="num">${costRatio ? costRatio.toFixed(1) + '×' : '—'}</td>
      <td class="num">${s.avgCost ? '$' + Math.round(s.avgCost * 1e5).toLocaleString() : '—'}</td>
      <td class="num ${overCeiling ? 'lose' : 'winc'}">${secs(s.medianMs)}</td>
      <td class="num">${secs(s.p90Ms)}</td>
      <td class="num">${secs(s.minMs)} / ${secs(s.maxMs)}</td>
      <td class="num">${s.refusals}</td>
      <td class="num">${s.errors}</td>
      <td class="num">${kb(s.avgBytes)}</td>
    </tr>`;
    })
    .join('');

  const catRows = cats
    .sort((a, b) => a.localeCompare(b))
    .map((c) => {
      const cells = variants
        .map((v) => {
          const ms = mean(
            results
              .filter((r) => r.category === c && r.variant === v.key && r.kind === 'image')
              .map((r) => r.ms)
          );
          return `<td class="num">${secs(ms)}</td>`;
        })
        .join('');
      const n = new Set(results.filter((r) => r.category === c).map((r) => r.id)).size;
      return `<tr><td>${esc(c)}</td><td class="num">${n}</td>${cells}</tr>`;
    })
    .join('');

  const refusalRows = results.filter((r) => r.kind !== 'image');

  function outputButton(s, variant) {
    if (s.kind !== 'image') {
      const cls = s.kind === 'refusal' ? 'ph refusal' : 'ph';
      return `<div class="${cls}"><b>${esc(s.kind)}</b><span>${esc((s.reason || s.finishReason || '').slice(0, 160))}</span></div>`;
    }
    const tag = variant.label;
    return `<button class="swap" type="button" aria-pressed="false" style="${varStyle(variant)}" title="Tap to flip ${esc(tag)} ↔ input" data-label="${esc(tag)}"><img class="art" loading="lazy" src="${s._thumb}" alt="${esc(tag)} output for ${esc(s.id)}"/><span class="badge">${esc(tag)}</span></button>`;
  }

  function variantCell(id, variant) {
    const ss = results
      .filter((r) => r.id === id && r.variant === variant.key)
      .sort((a, b) => a.sample - b.sample);
    if (!ss.length) return `<div class="samples"></div>`;
    return `<div class="samples">${ss.map((s) => outputButton(s, variant)).join('')}</div>`;
  }

  function galleryRow(id) {
    const label = esc(id.split('__').slice(1).join(' · ')) || esc(id);
    return `<div class="gscroll"><div class="grow" style="--colw:${colWidth}">
      <figure class="cell"><img class="art" loading="lazy" src="${inThumb[id]}" alt="input ${esc(id)}"/><figcaption class="cap">${label}</figcaption></figure>
      ${variants.map((v) => `<div class="cell">${variantCell(id, v)}</div>`).join('')}
    </div></div>`;
  }

  function categorySection(cat) {
    const rowIds = ids.filter((id) => id.startsWith(cat + '__'));
    return `<h3 id="cat-${esc(cat)}">${esc(cat)} <span class="ct">${rowIds.length}</span></h3>
    <div class="gallery">
    <div class="gscroll"><div class="grow head" style="--colw:${colWidth}"><span class="h">Input</span>${variants
      .map((v) => `<span class="h" style="${varStyle(v)}">${esc(v.label)}</span>`)
      .join('')}</div></div>
    ${rowIds.map(galleryRow).join('')}</div>`;
  }

  const tagline =
    `Every candidate production image variant — provider × model × effort tier — over the real ` +
    `coloring corpus, under the exact <code>/api/generate-image</code> request config. Cost, ` +
    `latency against the Netlify ceiling, and a tap-to-flip quality gallery. Run <code>${esc(runId)}</code>.`;

  const stats =
    `<div class="matchup">` +
    variants
      .map(
        (v) =>
          `<span class="vs" style="${varStyle(v)}"><span class="swatch"></span><b>${esc(v.label)}</b> <span class="role">${esc(v.role)}</span></span>`
      )
      .join('') +
    `<span class="vs"><b>${ids.length}</b>&nbsp;<span class="role">inputs · ${cats.length} categories · ${samples} sample(s) · ${results.length} calls</span></span>` +
    `</div>`;

  const overCeiling = variants.filter(
    (v) => agg[v.key].medianMs != null && agg[v.key].medianMs > NETLIFY_SYNC_TIMEOUT_MS
  );

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

    <div class="section-head"><h2>Cost &amp; latency</h2><span class="desc">per variant</span></div>
    <div class="wrap"><table>
    <tr>
      <th>Variant</th><th>Images</th><th>Img tokens</th><th>Avg $/image</th><th>vs cheapest</th>
      <th>$ / 100k</th><th>Median</th><th>p90</th><th>Min / Max</th><th>Refusals</th><th>Errors</th><th>Payload</th>
    </tr>
    ${summaryRows}
    </table></div>
    <p class="hint">Cost is measured token usage × published list rates, including the orchestrator's
    own tokens on the OpenAI variants. Median latency is red when it exceeds Netlify's measured
    ${(NETLIFY_SYNC_TIMEOUT_MS / 1000).toFixed(0)} s synchronous function ceiling (ADR-0063) — a red
    cell cannot be served by a buffered request/response handler at all.</p>
    ${
      overCeiling.length
        ? `<p class="lead"><b>${overCeiling.length} of ${variants.length} variants exceed the ${(NETLIFY_SYNC_TIMEOUT_MS / 1000).toFixed(0)} s ceiling at the median:</b> ${overCeiling
            .map((v) => esc(v.label))
            .join(', ')}. Serving any of them needs the generation to start and finish across two
            requests rather than inside one.</p>`
        : ''
    }

    <details><summary>Per-category latency mean</summary>
    <div class="wrap"><table>
    <tr><th>Category</th><th>n</th>${variants.map((v) => `<th style="${varStyle(v)};color:var(--vc)">${esc(v.label)}</th>`).join('')}</tr>
    ${catRows}
    </table></div></details>

    ${
      refusalRows.length
        ? `<div class="section-head"><h2>Non-image outcomes</h2><span class="desc">${refusalRows.length}</span></div>
           <ul class="method">${refusalRows
             .map(
               (r) =>
                 `<li><code>${esc(r.id)}</code> · ${esc(r.variantLabel)} · <b>${esc(r.kind)}</b> — ${esc((r.reason || r.finishReason || '').slice(0, 200))}</li>`
             )
             .join('')}</ul>`
        : '<p class="lead">No refusals or errors — every input produced an image on every variant.</p>'
    }

    <div class="section-head"><h2>Quality gallery</h2></div>
    <div class="toc">${cats.map((c) => `<a href="#cat-${esc(c)}">${esc(c)}</a>`).join('')}</div>
    <p class="lead">Each row is the input followed by one column per variant — <b>scroll a row
    sideways</b> to reach the rest. <b>Tap any generated image to flip it in place to the input</b>
    and back, to spot exactly what the model changed.</p>
    ${cats.map(categorySection).join('\n')}

    <div class="section-head"><h2>Method</h2></div>
    <ul class="method">
    <li>Inputs mirror what <code>/api/generate-image</code> receives — a flattened canvas of paper + coloring line art + the child's pen / magic-brush marks — built from the real <code>web/static/coloring</code> assets and the app's 15-color palette on the true paper colors. Regenerate with <code>npm run model-eval:fixtures</code>. Model-authored inputs carry a <code>gen</code> (filled) or <code>line</code> (stroke-only) prefix.</li>
    <li>Every call sends the exact production request: <code>DEFAULT_PROMPT</code> and <code>SAFETY_SYSTEM_INSTRUCTION</code>, asserted byte-for-byte against the app source at runtime; default temperature.</li>
    <li>The OpenAI variants run through the <b>Responses API image-generation tool</b>, not <code>/v1/images/edits</code>: only that shape accepts a real system instruction and lets the model decline in prose, which is what the app turns into its 422 safety refusal. <code>tool_choice</code> stays on auto so declining stays possible.</li>
    <li>Cost = measured usage × published list rates. Image output is the dominant term (${Object.entries(
      RATES
    )
      .map(([model, rate]) => `${esc(model)} $${rate.imageOutPerM}`)
      .join(
        ', '
      )} per 1M image-output tokens); the OpenAI rows also carry the orchestrator's text tokens.</li>
    <li>Latency was measured at concurrency ${concurrency}${concurrency > 1 ? ' — calls overlapped, so treat these as throughput-under-load rather than an isolated single-call floor' : ' (one call at a time)'}.</li>
    <li>Full safety re-validation of the <em>block-*</em> corpus needs <code>REDTEAM_FIXTURE_KEY</code> and <code>npm run redteam</code>; this harness covers quality/cost/latency plus a pretend-play false-positive probe.</li>
    </ul>
  </div>
</main>
${siteFooter({ home: '../../index.html' })}
${SWAP_SCRIPT}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Splotch · image-model eval — ${esc(runId)}</title>
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
