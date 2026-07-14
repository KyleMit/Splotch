// Builds the self-contained model-eval report (report.html) from a run's results.
// Thumbnails are downscaled with the provided Playwright browser so the report
// embeds everything as data URIs and stays portable and reasonably small.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MODELS, RATES } from './model-eval.mjs';

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
const usd = (n) => (n == null ? '—' : '$' + n.toFixed(4));
const kb = (n) => (n == null ? '—' : (n / 1024).toFixed(0) + ' KB');

async function makeThumber(browser, max = 380) {
  const page = await browser.newPage();
  return {
    async thumb(absPath) {
      if (!absPath || !existsSync(absPath)) return null;
      const uri = `data:image/*;base64,${readFileSync(absPath).toString('base64')}`;
      return page.evaluate(
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
    minMs: Math.min(...lat),
    maxMs: Math.max(...lat),
    imageTokens: median(imgs.map((r) => r.imageTokens).filter(Boolean)),
    avgCost: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    avgBytes: mean(imgs.map((r) => r.outBytes).filter(Boolean)),
    fmt: imgs[0]?.outFmt ?? '—',
  };
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
  const th = await makeThumber(browser);
  const ids = [...new Set(results.map((r) => r.id))];
  const cats = [...new Set(results.map((r) => r.category))];
  const modelIds = MODELS.map((m) => m.id);

  // Thumbnails.
  const inThumb = {};
  for (const id of ids) inThumb[id] = await th.thumb(join(inputsDir, `${id}.png`));
  for (const r of results) r._thumb = r.outFile ? await th.thumb(join(outDir, r.outFile)) : null;
  await th.close();

  const agg = Object.fromEntries(modelIds.map((m) => [m, statsFor(results, m)]));
  const A = agg[modelIds[0]],
    B = agg[modelIds[1]];
  const ratio = A.avgCost && B.avgCost ? B.avgCost / A.avgCost : null;

  // Per-category latency means for a small breakdown.
  const catRows = cats
    .map((c) => {
      const cell = (m) => {
        const l = results
          .filter((r) => r.category === c && r.model === m && r.kind === 'image')
          .map((r) => r.ms);
        return mean(l);
      };
      return {
        c,
        a: cell(modelIds[0]),
        b: cell(modelIds[1]),
        n: results.filter((r) => r.category === c && r.model === modelIds[0]).length,
      };
    })
    .sort((x, y) => x.c.localeCompare(y.c));

  const refusalRows = results.filter((r) => r.kind !== 'image');

  function sampleCell(id, model) {
    const ss = results
      .filter((r) => r.id === id && r.model === model)
      .sort((a, b) => a.sample - b.sample);
    return ss
      .map((s) =>
        s.kind === 'image'
          ? `<figure class="s"><img loading="lazy" src="${s._thumb}" alt=""/><figcaption>${s.ms}ms · ${usd(s.cost)}${samples > 1 ? ` · #${s.sample}` : ''}</figcaption></figure>`
          : `<figure class="s bad"><div class="ref"><b>${esc(s.kind)}</b><span>${esc((s.reason || s.finishReason || '').slice(0, 100))}</span></div><figcaption>${s.ms}ms</figcaption></figure>`
      )
      .join('');
  }

  function galleryRow(id) {
    const cells = modelIds
      .map((m) => `<td class="mcell"><div class="samples">${sampleCell(id, m)}</div></td>`)
      .join('');
    return `<tr><td class="inputcell"><figure><img loading="lazy" src="${inThumb[id]}" alt=""/><figcaption>${esc(id.replace(/__/g, ' · '))}</figcaption></figure></td>${cells}</tr>`;
  }

  function categorySection(cat) {
    const rows = ids
      .filter((id) => id.startsWith(cat + '__'))
      .map(galleryRow)
      .join('\n');
    return `<h3 id="cat-${esc(cat)}">${esc(cat)}</h3>
    <div class="wrap"><table class="gallery">
      <tr><th class="inputcell">input</th><th class="colhead a">${esc(MODELS[0].label)}</th><th class="colhead b">${esc(MODELS[1].label)}</th></tr>
      ${rows}
    </table></div>`;
  }

  const html = `<title>Splotch · image-model eval — ${esc(runId)}</title>
<style>
  :root{--ink:#1f2430;--mut:#6b7280;--line:#e6e2da;--bg:#faf9f6;--card:#fff;--a:#2f6fed;--b:#b8552f;--warn:#e67e22;--ok:#27ae60;--bad:#c0392b}
  @media (prefers-color-scheme:dark){:root{--ink:#e8e6e1;--mut:#a3a09a;--line:#2c2f36;--bg:#15171b;--card:#1c1f24}}
  :root[data-theme=dark]{--ink:#e8e6e1;--mut:#a3a09a;--line:#2c2f36;--bg:#15171b;--card:#1c1f24}
  :root[data-theme=light]{--ink:#1f2430;--mut:#6b7280;--line:#e6e2da;--bg:#faf9f6;--card:#fff}
  *{box-sizing:border-box}
  body{font:15px/1.55 -apple-system,system-ui,sans-serif;color:var(--ink);background:var(--bg);margin:0}
  main{max-width:1160px;margin:0 auto;padding:30px 20px 90px}
  h1{font-size:25px;margin:0 0 4px}h2{font-size:19px;margin:38px 0 10px;padding-top:10px;border-top:1px solid var(--line)}
  h3{font-size:15px;margin:26px 0 8px;color:var(--mut);text-transform:capitalize;letter-spacing:.02em}
  .sub{color:var(--mut);margin:0 0 6px}
  .verdict{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--warn);border-radius:12px;padding:16px 20px;margin:16px 0}
  .verdict b{color:var(--warn)}
  table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13.5px;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th,td{padding:8px 11px;text-align:left;border-bottom:1px solid var(--line)}
  th{background:color-mix(in srgb,var(--card),var(--ink) 5%);font-weight:600}
  tr:last-child td{border-bottom:0}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .lose{color:var(--b);font-weight:600}.winc{color:var(--ok);font-weight:600}
  .wrap{overflow-x:auto}
  .gallery{border-spacing:0 8px;border-collapse:separate}
  .gallery td{vertical-align:top;padding:5px}
  .gallery img{width:100%;max-width:250px;border-radius:8px;border:1px solid var(--line);display:block;background:#fff}
  .gallery figure{margin:0}.gallery figcaption{font-size:10.5px;color:var(--mut);margin-top:3px;text-align:center;word-break:break-word}
  .inputcell{width:220px}.samples{display:flex;gap:6px}.s{flex:1}
  .s.bad .ref{min-height:120px;display:flex;flex-direction:column;justify-content:center;gap:4px;padding:8px;border:1px dashed var(--line);border-radius:8px;background:color-mix(in srgb,var(--card),var(--warn) 8%);font-size:11px}
  .colhead.a{color:var(--a)}.colhead.b{color:var(--b)}
  code{background:color-mix(in srgb,var(--card),var(--ink) 8%);padding:1px 5px;border-radius:4px;font-size:.9em}
  .toc{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
  .toc a{font-size:12px;text-decoration:none;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:2px 10px}
  ul{margin:6px 0;padding-left:20px}li{margin:3px 0}
</style>
<main>
<h1>Splotch image-model evaluation</h1>
<p class="sub"><code>${esc(MODELS[0].id)}</code> (${MODELS[0].role}) vs <code>${esc(MODELS[1].id)}</code> (${MODELS[1].role}) · ${ids.length} inputs across ${cats.length} categories · ${samples} sample(s)/model · ${results.length} real Gemini calls · run <code>${esc(runId)}</code></p>

${verdictHtml ? `<div class="verdict">${verdictHtml}</div>` : ''}

<h2>Cost</h2>
<div class="wrap"><table>
<tr><th>Metric</th><th class="colhead a">${esc(MODELS[0].label)}</th><th class="colhead b">${esc(MODELS[1].label)}</th><th>Δ</th></tr>
<tr><td>Median image-output tokens</td><td class="num">${A.imageTokens ?? '—'}</td><td class="num">${B.imageTokens ?? '—'}</td><td class="num">${A.imageTokens && B.imageTokens ? B.imageTokens - A.imageTokens : '—'}</td></tr>
<tr><td>Output rate ($/1M image tokens)</td><td class="num">$${RATES[modelIds[0]].imgOutPerM.toFixed(0)}</td><td class="num">$${RATES[modelIds[1]].imgOutPerM.toFixed(0)}</td><td class="num">${(RATES[modelIds[1]].imgOutPerM / RATES[modelIds[0]].imgOutPerM).toFixed(1)}×</td></tr>
<tr><td><b>Avg cost / image (measured)</b></td><td class="num">${usd(A.avgCost)}</td><td class="num">${usd(B.avgCost)}</td><td class="num lose">${ratio ? ratio.toFixed(2) + '×' : '—'}</td></tr>
<tr><td>Per 100,000 generations</td><td class="num">$${A.avgCost ? (A.avgCost * 1e5).toFixed(0) : '—'}</td><td class="num">$${B.avgCost ? (B.avgCost * 1e5).toFixed(0) : '—'}</td><td class="num lose">${A.avgCost && B.avgCost ? '+$' + ((B.avgCost - A.avgCost) * 1e5).toFixed(0) : '—'}</td></tr>
</table></div>

<h2>Performance (latency)</h2>
<div class="wrap"><table>
<tr><th>Metric</th><th class="colhead a">${esc(MODELS[0].label)}</th><th class="colhead b">${esc(MODELS[1].label)}</th></tr>
<tr><td>Mean</td><td class="num">${A.meanMs} ms</td><td class="num">${B.meanMs} ms</td></tr>
<tr><td>Median</td><td class="num">${A.medianMs} ms</td><td class="num">${B.medianMs} ms</td></tr>
<tr><td>Min / Max</td><td class="num">${A.minMs} / ${A.maxMs} ms</td><td class="num">${B.minMs} / ${B.maxMs} ms</td></tr>
</table></div>
<details><summary class="sub">Per-category latency mean</summary>
<div class="wrap"><table>
<tr><th>Category</th><th>n</th><th class="colhead a">${esc(MODELS[0].label)}</th><th class="colhead b">${esc(MODELS[1].label)}</th></tr>
${catRows.map((r) => `<tr><td>${esc(r.c)}</td><td class="num">${r.n}</td><td class="num">${r.a ?? '—'} ms</td><td class="num">${r.b ?? '—'} ms</td></tr>`).join('')}
</table></div></details>

<h2>Output format &amp; safety</h2>
<div class="wrap"><table>
<tr><th></th><th class="colhead a">${esc(MODELS[0].label)}</th><th class="colhead b">${esc(MODELS[1].label)}</th></tr>
<tr><td>Returned format</td><td>${esc(A.fmt)}</td><td>${esc(B.fmt)}</td></tr>
<tr><td>Avg payload</td><td class="num">${kb(A.avgBytes)}</td><td class="num">${kb(B.avgBytes)}</td></tr>
<tr><td>Refusals</td><td class="num">${A.refusals}</td><td class="num">${B.refusals}</td></tr>
<tr><td>Errors</td><td class="num">${A.errors}</td><td class="num">${B.errors}</td></tr>
</table></div>
${
  refusalRows.length
    ? `<details open><summary class="sub">${refusalRows.length} non-image outcome(s)</summary><ul>${refusalRows
        .map(
          (r) =>
            `<li><code>${esc(r.id)}</code> · ${esc(r.modelLabel)} · <b>${esc(r.kind)}</b> — ${esc((r.reason || r.finishReason || '').slice(0, 140))}</li>`
        )
        .join('')}</ul></details>`
    : '<p class="sub">No refusals or errors — every input produced an image on both models.</p>'
}

<h2>Quality gallery</h2>
<div class="toc">${cats.map((c) => `<a href="#cat-${esc(c)}">${esc(c)}</a>`).join('')}</div>
<p class="sub"><span style="color:var(--a)">middle = ${esc(MODELS[0].label)}</span> · <span style="color:var(--b)">right = ${esc(MODELS[1].label)}</span> · captions show latency · cost${samples > 1 ? ' · sample #' : ''}</p>
${cats.map(categorySection).join('\n')}

<h2>Method</h2>
<ul>
<li>Inputs mirror what <code>/api/generate-image</code> receives — a flattened canvas of paper + coloring line art + the child's pen / magic-brush marks — built from the real <code>web/static/coloring</code> assets and the app's 10-color palette on the true paper colors. Regenerate with <code>npm run model-eval:fixtures</code>. Gemini-authored inputs carry a <code>gen</code> prefix.</li>
<li>Each call uses the exact production request: <code>DEFAULT_PROMPT</code>, <code>SAFETY_SYSTEM_INSTRUCTION</code>, and <code>SAFETY_SETTINGS</code>, asserted byte-for-byte against the app source at runtime; default temperature.</li>
<li>Cost = measured <code>usageMetadata</code> tokens × published rates ($${RATES[modelIds[0]].imgOutPerM.toFixed(0)} vs $${RATES[modelIds[1]].imgOutPerM.toFixed(0)} per 1M image-output tokens).</li>
<li>Full safety re-validation of the <em>block-*</em> corpus still needs <code>REDTEAM_FIXTURE_KEY</code> and <code>npm run redteam</code>; this harness covers quality/cost/latency + a pretend-play false-positive probe.</li>
</ul>
</main>`;

  const htmlPath = join(outDir, 'report.html');
  writeFileSync(htmlPath, html);
  writeFileSync(
    join(outDir, 'summary.json'),
    JSON.stringify({ runId, agg, catRows, refusals: refusalRows.length }, null, 2)
  );
  return htmlPath;
}
