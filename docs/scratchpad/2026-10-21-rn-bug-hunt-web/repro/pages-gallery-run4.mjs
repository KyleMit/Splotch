import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const root = 'docs/scratchpad/2026-10-21-rn-bug-hunt-web/evidence/run4';
const records = new Map();
for (const line of readFileSync(`${root}/pages-observations.jsonl`, 'utf8').trim().split('\n')) {
  const row = JSON.parse(line);
  if (!row.take) continue;
  records.set([row.take, row.engine, row.profile, row.scheme, row.js, row.path].join('|'), row);
}
const rows = [...records.values()];
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
const filter = (field, label) =>
  `<label>${label} <select data-filter="${field}"><option value="">All</option>${[
    ...new Set(rows.map((r) => String(r[field]))),
  ]
    .sort()
    .map((v) => `<option>${escape(v)}</option>`)
    .join('')}</select></label>`;
const cards = rows
  .map((row) => {
    const images = [
      'top',
      'bottom',
      'feedback-failure',
      'feedback-success',
      'admin-signed-in',
      'admin-added-code',
      'review',
    ]
      .map((state) => ({ state, file: `pages/${row.id}-${state}.png` }))
      .filter((x) => existsSync(`${root}/${x.file}`));
    const fields = {
      engine: row.engine,
      profile: row.profile,
      scheme: row.scheme,
      take: row.take,
      js: String(row.js),
      status: row.status,
    };
    return `<details ${Object.entries(fields)
      .map(([k, v]) => `data-${k}="${escape(v)}"`)
      .join(
        ' '
      )} data-search="${escape(row.id + ' ' + row.path)}"><summary>${escape(row.id)} — <b>${escape(row.status)}</b></summary><p>${escape(row.path)} · ${escape(row.browserVersion)} · HTTP ${row.http} · ${escape(row.error?.split('\n')[0] ?? '')}</p>${images.map(({ state, file }) => `<figure><figcaption>${escape(state)}</figcaption><a href="${file}" target="_blank" rel="noopener"><img width="280" data-src="${file}" alt="${escape(row.id + ' ' + state)}"></a></figure>`).join('')}</details>`;
  })
  .join('\n');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Splotch run 4 page evidence</title><style>body{font:16px/1.5 system-ui;margin:24px;max-width:1400px}form{position:sticky;top:0;background:Canvas;color:CanvasText;border-bottom:1px solid;padding:12px;display:flex;gap:12px;flex-wrap:wrap}details{border-bottom:1px solid #bbb;padding:8px}summary{cursor:pointer}figure{display:inline-block;vertical-align:top;margin:8px}img{max-width:100%;height:auto}input,select{font:inherit}[hidden]{display:none}</style><h1>Splotch run 4 — page evidence</h1><p>Candidate cbfa2dc91a861aa41ba64219c34feb0875a37ce7. Latest recorder row per combination. Captures load when a row opens. REVIEW is a raw script flag, adjudicated in results/pages.md. Main matrix: 720 combinations; supplements remain separate takes.</p><form onsubmit="return false">${filter('take', 'Take')}${filter('engine', 'Engine')}${filter('profile', 'Layout')}${filter('scheme', 'Theme')}${filter('js', 'Scripts enabled')}${filter('status', 'Raw result')}<label>Search <input id="search" type="search"></label><output id="count"></output></form><main>${cards}</main><script>const cards=[...document.querySelectorAll('details')];const selects=[...document.querySelectorAll('[data-filter]')];const search=document.getElementById('search');function filter(){let n=0;for(const card of cards){card.hidden=!selects.every(s=>!s.value||card.dataset[s.dataset.filter]===s.value)||!card.dataset.search.toLowerCase().includes(search.value.toLowerCase());if(!card.hidden)n++;}document.getElementById('count').textContent=n+' shown';}for(const select of selects)select.addEventListener('change',filter);search.addEventListener('input',filter);for(const card of cards)card.addEventListener('toggle',()=>{if(card.open)for(const img of card.querySelectorAll('img[data-src]')){img.src=img.dataset.src;img.removeAttribute('data-src');}});const take=selects.find(s=>s.dataset.filter==='take');take.value='matrix';filter();</script></html>`;
writeFileSync(`${root}/pages-gallery.html`, html);
console.log(
  JSON.stringify({ cards: rows.length, main: rows.filter((r) => r.take === 'matrix').length })
);
