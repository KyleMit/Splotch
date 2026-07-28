import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { ROOT } from './lib/proc.mjs';
import { chromeStyle, compactTopbar } from './lib/scrapbook-chrome.mjs';

export const PROOF_SHEET_HUB_PATH = join(
  ROOT,
  'scrapbook',
  'coloring-book-proof-sheets',
  'index.html'
);

const EXTRA_CSS = `
html,body{height:100%}
body{display:flex;flex-direction:column}
.proof-sheet-header{flex:0 0 auto;background:var(--card-2);border-bottom:1px solid var(--hair);box-shadow:0 1px 0 rgba(20,18,26,.06),0 6px 16px rgba(20,18,26,.05)}
.titlebar{display:flex;align-items:center;gap:.55rem;padding:.6rem 1rem .55rem;flex-wrap:wrap}
.count{color:var(--muted);font-size:.78rem;white-space:nowrap}
.tabsrow{display:flex;align-items:center;gap:.4rem;padding:0 .6rem .6rem}
.tabs{display:flex;gap:.4rem;overflow-x:auto;scrollbar-width:thin;padding:.15rem;flex:1 1 auto}
.tabs button{flex:0 0 auto;border:1px solid transparent;background:var(--tab-bg);color:var(--tab-fg);font:inherit;font-size:.9rem;font-weight:600;padding:.35rem .8rem;border-radius:999px;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s,border-color .12s}
.tabs button:hover{border-color:var(--accent)}
.tabs button.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.nudge{flex:0 0 auto;width:2rem;height:2rem;border:1px solid var(--hair);background:var(--paper);color:var(--ink);border-radius:50%;cursor:pointer;font-size:1.1rem;line-height:1;display:grid;place-items:center}
.nudge:hover{border-color:var(--accent);color:var(--accent)}
main{flex:1 1 auto;min-height:0}
iframe{width:100%;height:100%;border:0;display:block;background:var(--paper)}
:root{--tab-bg:#efeae1;--tab-fg:#4a4650}
@media (prefers-color-scheme:dark){:root{--tab-bg:#24262d;--tab-fg:#c4c8d0}}
@media (max-width:560px){.count{display:none}}
`;

const CATEGORIES = `[
        { id: 'farm', name: 'Farm', pages: 6 },
        { id: 'dinosaur', name: 'Dinosaurs', pages: 6 },
        { id: 'creatures', name: 'Creatures', pages: 6 },
        { id: 'nature', name: 'Nature', pages: 6 },
        { id: 'objects', name: 'Objects', pages: 6 },
        { id: 'shapes', name: 'Shapes', pages: 6 },
        { id: 'space', name: 'Space', pages: 6 },
        { id: 'vehicles', name: 'Vehicles', pages: 6 },
      ]`;

export function buildColoringBookProofSheetHub() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Splotch coloring-book proof sheets</title>
    ${chromeStyle(EXTRA_CSS)}
  </head>
  <body>
    <header class="proof-sheet-header">
      <div class="titlebar">
        ${compactTopbar({
          home: '../index.html',
          crumbs: [
            { label: 'Scrapbook', href: '../index.html' },
            { label: 'Coloring-book proof sheets' },
          ],
        })}
      </div>
      <nav class="tabsrow">
        <button class="nudge" id="prev" title="Previous category (←)" aria-label="Previous category">&#8592;</button>
        <div class="tabs" id="tabs" role="tablist" aria-label="Coloring categories"></div>
        <button class="nudge" id="next" title="Next category (→)" aria-label="Next category">&#8594;</button>
        <span class="count" id="count"></span>
      </nav>
    </header>
    <main>
      <iframe id="sheet" role="tabpanel" title="Category proof sheet"></iframe>
    </main>
    <script>
      const CATEGORIES = ${CATEGORIES};

      const tabsEl = document.getElementById('tabs');
      const frame = document.getElementById('sheet');
      const countEl = document.getElementById('count');
      const buttons = {};
      let current = -1;

      CATEGORIES.forEach((cat, i) => {
        const b = document.createElement('button');
        b.textContent = cat.name;
        b.id = \`tab-\${cat.id}\`;
        b.dataset.id = cat.id;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-controls', 'sheet');
        b.addEventListener('click', () => { show(i); });
        tabsEl.appendChild(b);
        buttons[cat.id] = b;
      });

      const indexFromHash = () => {
        const id = (location.hash || '').replace(/^#/, '');
        const i = CATEGORIES.findIndex((c) => c.id === id);
        return i === -1 ? 0 : i;
      };

      const show = (i, skipHash, initialLoad) => {
        i = (i + CATEGORIES.length) % CATEGORIES.length;
        if (i === current) return;
        current = i;
        const cat = CATEGORIES[i];
        frame.src = \`\${cat.id}.html\`;
        countEl.textContent = \`Category \${i + 1} of \${CATEGORIES.length} · \${cat.pages} pages\`;
        Object.keys(buttons).forEach((id) => {
          buttons[id].classList.toggle('on', id === cat.id);
          buttons[id].setAttribute('aria-selected', String(id === cat.id));
        });
        frame.setAttribute('aria-labelledby', buttons[cat.id].id);
        buttons[cat.id].scrollIntoView({ block: 'nearest', inline: 'center' });
        if (!skipHash) {
          if (location.hash.replace(/^#/, '') !== cat.id) {
            if (initialLoad) history.replaceState(null, '', \`#\${cat.id}\`);
            else location.hash = \`#\${cat.id}\`;
          }
        }
        document.title = \`Splotch proof sheets — \${cat.name}\`;
      };

      document.getElementById('prev').addEventListener('click', () => { show(current - 1); });
      document.getElementById('next').addEventListener('click', () => { show(current + 1); });

      window.addEventListener('keydown', (e) => {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (e.key === 'ArrowLeft') { show(current - 1); }
        else if (e.key === 'ArrowRight') { show(current + 1); }
      });

      window.addEventListener('hashchange', () => { show(indexFromHash(), true); });

      show(indexFromHash(), false, true);
    </script>
  </body>
</html>
`;
}

export function writeColoringBookProofSheetHub() {
  writeFileSync(PROOF_SHEET_HUB_PATH, buildColoringBookProofSheetHub());
}

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeColoringBookProofSheetHub();
  console.log(`Rebuilt ${PROOF_SHEET_HUB_PATH}`);
}
