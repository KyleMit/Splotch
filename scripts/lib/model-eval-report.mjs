// Builds the model-eval report from a run's results. The report is a `report/`
// bundle — `index.html` plus a sibling `assets/` folder of downscaled thumbnails
// (referenced by relative path, not base64-inlined) so the committed/Pages copy
// stays a small HTML file with readable diffs and thumbnails that dedupe in git
// across re-publishes (ADR-0059). Only index.html + assets/ get published; the
// run's raw results.json / summary.json stay in the (gitignored) run dir, not in
// the bundle. The report chrome (masthead, breadcrumbs, footer, tokens) comes
// from the shared design system in ./scrapbook-chrome.mjs.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODELS, RATES } from './model-eval.mjs';
import { esc, chromeStyle, masthead, siteFooter } from './scrapbook-chrome.mjs';

const usd = (n) => (n == null ? '—' : '$' + n.toFixed(4));
const kb = (n) => (n == null ? '—' : (n / 1024).toFixed(0) + ' KB');

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

function statsFor(results, model) {
  const rows = results.filter((r) => r.model === model);
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
    minMs: lat.length ? Math.min(...lat) : null,
    maxMs: lat.length ? Math.max(...lat) : null,
    imageTokens: median(imgs.map((r) => r.imageTokens).filter(Boolean)),
    avgCost: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    avgBytes: mean(imgs.map((r) => r.outBytes).filter(Boolean)),
    fmt: imgs[0]?.outFmt ?? '—',
  };
}

// Report-specific CSS layered on the shared chrome tokens. The two model series
// get their own colors (teal / rust) deliberately distinct from the interactive
// blue --accent, so a colored model name never reads as a tappable link; deltas
// use the shared --bad/--ok semantics, separate from series identity.
const EXTRA_CSS = `
:root{--a:#17897a;--b:#bd5f36}
@media (prefers-color-scheme:dark){:root{--a:#4bc4b1;--b:#e6926a}}
:root[data-theme=dark]{--a:#4bc4b1;--b:#e6926a}
:root[data-theme=light]{--a:#17897a;--b:#bd5f36}
.matchup{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.vs{display:inline-flex;align-items:center;gap:9px;background:var(--card);border:1px solid var(--hair);border-radius:999px;padding:6px 14px;font-size:.86rem;box-shadow:var(--shadow-sm)}
.vs .swatch{width:10px;height:10px;border-radius:99px}
.vs.a .swatch{background:var(--a)}.vs.b .swatch{background:var(--b)}
.vs b{font-weight:750}.vs .role{color:var(--muted);font-weight:500}
.verdict{background:var(--card);border:1px solid var(--hair);border-left:5px solid var(--gold);border-radius:var(--r-md);padding:16px 20px;margin:18px 0;box-shadow:var(--shadow-sm)}
.verdict b{color:var(--gold)}
table{border-collapse:separate;border-spacing:0;width:100%;max-width:860px;margin:6px 0;font-size:13.5px;background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);overflow:hidden}
th,td{padding:9px 13px;text-align:left;border-bottom:1px solid var(--hair)}
th{background:var(--card-2);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:var(--muted)}
th:not(:first-child),td:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
tr:last-child td{border-bottom:0}
tbody tr:hover td{background:color-mix(in srgb,var(--accent-wash) 45%,transparent)}
.num{text-align:right;font-variant-numeric:tabular-nums}
.lose{color:var(--bad);font-weight:700}.winc{color:var(--ok);font-weight:700}
.wrap{overflow-x:auto;border-radius:var(--r-md)}
.colhead.a{color:var(--a)}.colhead.b{color:var(--b)}
h3 .ct{font-size:12px;color:var(--muted);font-weight:600;border:1px solid var(--hair);border-radius:999px;padding:1px 9px;margin-left:6px;vertical-align:middle}
h3{font-size:15px;margin:26px 0 10px;color:var(--muted);text-transform:capitalize;letter-spacing:.02em;font-weight:750}
.gallery{display:flex;flex-direction:column;gap:14px}
.grow{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;align-items:start}
.grow.head{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--paper) 90%,transparent);backdrop-filter:blur(8px);padding:8px 0;border-bottom:1px solid var(--hair);gap:14px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.grow.head .h{padding:0 4px}.grow.head .h.a{color:var(--a)}.grow.head .h.b{color:var(--b)}.grow.head .h.in{color:var(--muted)}
.cell{margin:0;min-width:0}
.samples{display:flex;flex-direction:column;gap:14px}
.art{width:100%;height:230px;object-fit:contain;display:block;border-radius:var(--r-md);border:1px solid var(--hair);background:#fff}
.cap{font-size:11px;color:var(--muted);margin-top:6px;text-align:center;word-break:break-word}
.swap{position:relative;display:block;width:100%;padding:0;border:0;background:none;cursor:pointer;border-radius:var(--r-md)}
.swap .art{transition:box-shadow .12s ease}
.swap:hover .art{box-shadow:var(--shadow-md)}
.swap:focus-visible{outline:2px solid var(--a);outline-offset:3px}
.swap.show-in .art{border-color:var(--a);box-shadow:0 0 0 2px var(--a)}
.badge{position:absolute;top:8px;left:8px;font-size:10px;font-weight:800;letter-spacing:.02em;padding:3px 9px;border-radius:999px;background:color-mix(in srgb,#fff 82%,transparent);border:1px solid var(--hair);color:var(--ink);pointer-events:none}
.badge.a{color:var(--a)}.badge.b{color:var(--b)}
.swap.show-in .badge{background:var(--a);color:#fff;border-color:var(--a)}
.ph{height:230px;display:flex;flex-direction:column;justify-content:center;gap:5px;padding:12px;text-align:center;border:1px dashed var(--hair-strong);border-radius:var(--r-md);background:color-mix(in srgb,var(--card),var(--warn) 8%);font-size:11px}
.ph b{font-size:13px}.ph span{color:var(--muted);word-break:break-word}
.toc{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.toc a{font-size:12px;text-decoration:none;color:var(--muted);border:1px solid var(--hair);border-radius:999px;padding:3px 11px;background:var(--card)}
.toc a:hover{border-color:var(--accent);color:var(--accent-ink)}
.lead{color:var(--muted);max-width:66ch}
.lead b{color:var(--ink);font-weight:700}
.mA{color:var(--a);font-weight:650}.mB{color:var(--b);font-weight:650}
details{margin:8px 0}summary{cursor:pointer;color:var(--muted);font-size:.9rem}
ul.method{margin:8px 0;padding-left:20px}ul.method li{margin:5px 0;color:var(--muted)}ul.method li b{color:var(--ink)}
@media (prefers-reduced-motion:reduce){.swap .art{transition:none}}
@media (max-width:720px){.art,.ph{height:170px}.grow.head{display:none}}
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
function renderReportHtml({ runId, results, samples, inThumb, verdictHtml }) {
  const ids = [...new Set(results.map((r) => r.id))];
  const cats = [...new Set(results.map((r) => r.category))];
  const modelIds = MODELS.map((m) => m.id);

  const agg = Object.fromEntries(modelIds.map((m) => [m, statsFor(results, m)]));
  const A = agg[modelIds[0]],
    B = agg[modelIds[1]];
  const ratio = A.avgCost && B.avgCost ? B.avgCost / A.avgCost : null;

  const catRows = cats
    .map((c) => {
      const cell = (m) =>
        mean(
          results
            .filter((r) => r.category === c && r.model === m && r.kind === 'image')
            .map((r) => r.ms)
        );
      return {
        c,
        a: cell(modelIds[0]),
        b: cell(modelIds[1]),
        n: results.filter((r) => r.category === c && r.model === modelIds[0]).length,
      };
    })
    .sort((x, y) => x.c.localeCompare(y.c));

  const refusalRows = results.filter((r) => r.kind !== 'image');
  const shortLabel = (label) => label.replace('-flash-image', '');

  function outputButton(s) {
    if (s.kind !== 'image') {
      return `<div class="ph"><b>${esc(s.kind)}</b><span>${esc((s.reason || s.finishReason || '').slice(0, 100))}</span></div>`;
    }
    const tag = shortLabel(s.modelLabel);
    const cls = s.model === modelIds[0] ? 'a' : 'b';
    return `<button class="swap" type="button" aria-pressed="false" title="Tap to flip ${esc(tag)} ↔ input" data-label="${esc(tag)}"><img class="art" loading="lazy" src="${s._thumb}" alt="${esc(tag)} output for ${esc(s.id)}"/><span class="badge ${cls}">${esc(tag)}</span></button>`;
  }

  function modelCell(id, model) {
    const ss = results
      .filter((r) => r.id === id && r.model === model)
      .sort((a, b) => a.sample - b.sample);
    return `<div class="samples">${ss.map(outputButton).join('')}</div>`;
  }

  function galleryRow(id) {
    const label = esc(id.split('__').slice(1).join(' · ')) || esc(id);
    return `<div class="grow">
      <figure class="cell"><img class="art" loading="lazy" src="${inThumb[id]}" alt="input ${esc(id)}"/><figcaption class="cap">${label}</figcaption></figure>
      <div class="cell">${modelCell(id, modelIds[0])}</div>
      <div class="cell">${modelCell(id, modelIds[1])}</div>
    </div>`;
  }

  function categorySection(cat) {
    const rowIds = ids.filter((id) => id.startsWith(cat + '__'));
    return `<h3 id="cat-${esc(cat)}">${esc(cat)} <span class="ct">${rowIds.length}</span></h3>
    <div class="gallery">
    <div class="grow head"><span class="h in">Input</span><span class="h a">${esc(MODELS[0].label)}</span><span class="h b">${esc(MODELS[1].label)}</span></div>
    ${rowIds.map(galleryRow).join('')}</div>`;
  }

  const tagline =
    `A/B comparison of the two candidate production image models over the real coloring corpus, ` +
    `under the exact <code>/api/generate-image</code> request config. Cost, latency, and a ` +
    `tap-to-flip quality gallery. Run <code>${esc(runId)}</code>.`;

  const stats =
    `<div class="matchup">` +
    `<span class="vs a"><span class="swatch"></span><b>${esc(MODELS[0].label)}</b> <span class="role">${esc(MODELS[0].role)}</span></span>` +
    `<span class="vs b"><span class="swatch"></span><b>${esc(MODELS[1].label)}</b> <span class="role">${esc(MODELS[1].role)}</span></span>` +
    `<span class="vs"><b>${ids.length}</b>&nbsp;<span class="role">inputs · ${cats.length} categories · ${samples} sample(s)/model · ${results.length} Gemini calls</span></span>` +
    `</div>`;

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

    <div class="section-head"><h2>Cost</h2></div>
    <div class="wrap"><table>
    <tr><th>Metric</th><th class="colhead a">${esc(MODELS[0].label)}</th><th class="colhead b">${esc(MODELS[1].label)}</th><th>Δ</th></tr>
    <tr><td>Median image-output tokens</td><td class="num">${A.imageTokens ?? '—'}</td><td class="num">${B.imageTokens ?? '—'}</td><td class="num">${A.imageTokens && B.imageTokens ? B.imageTokens - A.imageTokens : '—'}</td></tr>
    <tr><td>Output rate ($/1M image tokens)</td><td class="num">$${RATES[modelIds[0]].imgOutPerM.toFixed(0)}</td><td class="num">$${RATES[modelIds[1]].imgOutPerM.toFixed(0)}</td><td class="num">${(RATES[modelIds[1]].imgOutPerM / RATES[modelIds[0]].imgOutPerM).toFixed(1)}×</td></tr>
    <tr><td><b>Avg cost / image (measured)</b></td><td class="num">${usd(A.avgCost)}</td><td class="num">${usd(B.avgCost)}</td><td class="num lose">${ratio ? ratio.toFixed(2) + '×' : '—'}</td></tr>
    <tr><td>Per 100,000 generations</td><td class="num">$${A.avgCost ? (A.avgCost * 1e5).toFixed(0) : '—'}</td><td class="num">$${B.avgCost ? (B.avgCost * 1e5).toFixed(0) : '—'}</td><td class="num lose">${A.avgCost && B.avgCost ? '+$' + ((B.avgCost - A.avgCost) * 1e5).toFixed(0) : '—'}</td></tr>
    </table></div>

    <div class="section-head"><h2>Performance</h2><span class="desc">latency</span></div>
    <div class="wrap"><table>
    <tr><th>Metric</th><th class="colhead a">${esc(MODELS[0].label)}</th><th class="colhead b">${esc(MODELS[1].label)}</th></tr>
    <tr><td>Mean</td><td class="num">${A.meanMs} ms</td><td class="num">${B.meanMs} ms</td></tr>
    <tr><td>Median</td><td class="num">${A.medianMs} ms</td><td class="num">${B.medianMs} ms</td></tr>
    <tr><td>Min / Max</td><td class="num">${A.minMs} / ${A.maxMs} ms</td><td class="num">${B.minMs} / ${B.maxMs} ms</td></tr>
    </table></div>
    <details><summary>Per-category latency mean</summary>
    <div class="wrap"><table>
    <tr><th>Category</th><th>n</th><th class="colhead a">${esc(MODELS[0].label)}</th><th class="colhead b">${esc(MODELS[1].label)}</th></tr>
    ${catRows.map((r) => `<tr><td>${esc(r.c)}</td><td class="num">${r.n}</td><td class="num">${r.a ?? '—'} ms</td><td class="num">${r.b ?? '—'} ms</td></tr>`).join('')}
    </table></div></details>

    <div class="section-head"><h2>Output format &amp; safety</h2></div>
    <div class="wrap"><table>
    <tr><th></th><th class="colhead a">${esc(MODELS[0].label)}</th><th class="colhead b">${esc(MODELS[1].label)}</th></tr>
    <tr><td>Returned format</td><td>${esc(A.fmt)}</td><td>${esc(B.fmt)}</td></tr>
    <tr><td>Avg payload</td><td class="num">${kb(A.avgBytes)}</td><td class="num">${kb(B.avgBytes)}</td></tr>
    <tr><td>Refusals</td><td class="num">${A.refusals}</td><td class="num">${B.refusals}</td></tr>
    <tr><td>Errors</td><td class="num">${A.errors}</td><td class="num">${B.errors}</td></tr>
    </table></div>
    ${
      refusalRows.length
        ? `<details open><summary>${refusalRows.length} non-image outcome(s)</summary><ul class="method">${refusalRows
            .map(
              (r) =>
                `<li><code>${esc(r.id)}</code> · ${esc(r.modelLabel)} · <b>${esc(r.kind)}</b> — ${esc((r.reason || r.finishReason || '').slice(0, 140))}</li>`
            )
            .join('')}</ul></details>`
        : '<p class="lead">No refusals or errors — every input produced an image on both models.</p>'
    }

    <div class="section-head"><h2>Quality gallery</h2></div>
    <div class="toc">${cats.map((c) => `<a href="#cat-${esc(c)}">${esc(c)}</a>`).join('')}</div>
    <p class="lead">Each row is input · <span class="mA">${esc(MODELS[0].label)}</span> · <span class="mB">${esc(MODELS[1].label)}</span>. <b>Tap any generated image to flip it in place to the input</b> — toggle back and forth to spot exactly what the model changed.</p>
    ${cats.map(categorySection).join('\n')}

    <div class="section-head"><h2>Method</h2></div>
    <ul class="method">
    <li>Inputs mirror what <code>/api/generate-image</code> receives — a flattened canvas of paper + coloring line art + the child's pen / magic-brush marks — built from the real <code>web/static/coloring</code> assets and the app's 10-color palette on the true paper colors. Regenerate with <code>npm run model-eval:fixtures</code>. Gemini-authored inputs carry a <code>gen</code> prefix.</li>
    <li>Each call uses the exact production request: <code>DEFAULT_PROMPT</code>, <code>SAFETY_SYSTEM_INSTRUCTION</code>, and <code>SAFETY_SETTINGS</code>, asserted byte-for-byte against the app source at runtime; default temperature.</li>
    <li>Cost = measured <code>usageMetadata</code> tokens × published rates ($${RATES[modelIds[0]].imgOutPerM.toFixed(0)} vs $${RATES[modelIds[1]].imgOutPerM.toFixed(0)} per 1M image-output tokens).</li>
    <li>Full safety re-validation of the <em>block-*</em> corpus still needs <code>REDTEAM_FIXTURE_KEY</code> and <code>npm run redteam</code>; this harness covers quality/cost/latency + a pretend-play false-positive probe.</li>
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
${chromeStyle(EXTRA_CSS)}
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
      ? await th.thumb(join(outDir, r.outFile), `out__${r.id}__${r.model}__${r.sample}`)
      : null;
  await th.close();

  const html = renderReportHtml({ runId, results, samples, inThumb, verdictHtml });
  const htmlPath = join(bundleDir, 'index.html');
  writeFileSync(htmlPath, html);

  // Provenance stays in the run dir, NOT in the published bundle (ADR-0059: only
  // index.html + assets/ are promoted to scrapbook/).
  const agg = Object.fromEntries(MODELS.map((m) => [m.id, statsFor(results, m.id)]));
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ runId, agg }, null, 2));
  return htmlPath;
}

// Re-render index.html from a finished report bundle's results.json + the
// thumbnails already sitting in assets/, with no browser. This is the path a
// design/chrome change takes to reskin an already-committed report: the thumbnail
// filenames are deterministic from (id, model, sample), so the HTML rebuilds
// offline as long as the JPEGs exist.
export function rebuildReportHtml({ reportDir, results, runId, samples = 1, verdictHtml }) {
  const assetsExist = (name) => existsSync(join(reportDir, 'assets', `${name}.jpg`));
  const ids = [...new Set(results.map((r) => r.id))];
  const inThumb = {};
  for (const id of ids) inThumb[id] = assetsExist(`in__${id}`) ? `assets/in__${id}.jpg` : null;
  for (const r of results) {
    const name = `out__${r.id}__${r.model}__${r.sample}`;
    r._thumb = r.outFile && assetsExist(name) ? `assets/${name}.jpg` : null;
  }
  const html = renderReportHtml({ runId, results, samples, inThumb, verdictHtml });
  writeFileSync(join(reportDir, 'index.html'), html);
  return join(reportDir, 'index.html');
}
