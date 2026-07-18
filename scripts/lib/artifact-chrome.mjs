// The shared "chrome" for every page under /artifacts — the crayon masthead,
// breadcrumbs, footer, and the design-system CSS (tokens, typography, cards,
// chips, buttons) that make the committed run outputs (ADR-0059) read as one
// small site rather than a folder of loose HTML files.
//
// This is the single source of truth for the artifact look. The Node generators
// that live under scripts/ import it directly (artifacts-index, the icons sheet,
// the model-eval report). The coloring-book proof sheet lives under
// tools/asset-gen/ and may not import across that boundary, so it mirrors these
// tokens in its own CSS asset — keep the two crayon strips and the paper/ink
// palette in sync by eye when either changes.
//
// Pure string builders: no DOM, no network. GitHub Pages serves the result as-is.

export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

// The brand crayon strip — the app's 7 palette hues. `size` picks a preset:
// "lg" for the masthead, "sm" for the footer.
export function crayons(size = 'lg') {
  const hues = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
  return (
    `<span class="crayons crayons-${size}" aria-hidden="true">` +
    hues.map((h) => `<i style="background:var(--c-${h})"></i>`).join('') +
    `</span>`
  );
}

// The design system. Emitted once per page inside a <style> block by chromeStyle().
export const CHROME_CSS = `
:root{
  color-scheme: light dark;
  --paper:#f5f3ee; --paper-2:#efece5; --card:#fdfbf6; --card-2:#f6f3ec;
  --ink:#23212a; --muted:#6b6774; --faint:#948f9c;
  --hair:#e6e1d8; --hair-strong:#d9d3c8;
  --accent:#2f6fed; --accent-ink:#1e50c4; --accent-wash:#e8effe;
  --gold:#b1780a;
  --ok:#3f9d55; --warn:#e08a1e; --bad:#d24b3f;
  --c-red:#ec534e; --c-orange:#f89c45; --c-yellow:#f9d24f;
  --c-green:#8cc864; --c-blue:#62a2e9; --c-purple:#ab71e1; --c-pink:#f47cb0;
  --shadow-sm:0 1px 2px rgba(30,28,40,.05);
  --shadow-md:0 1px 2px rgba(30,28,40,.05), 0 10px 26px rgba(30,28,40,.07);
  --shadow-lg:0 2px 6px rgba(30,28,40,.06), 0 22px 48px rgba(30,28,40,.12);
  --r-sm:9px; --r-md:16px; --r-lg:18px;
  --shell:1160px;
  --font: ui-rounded,"SF Pro Rounded",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
@media (prefers-color-scheme: dark){
  :root{
    --paper:#131418; --paper-2:#0f1013; --card:#1d1f27; --card-2:#181a20;
    --ink:#e9e7e2; --muted:#a8a4af; --faint:#807d89;
    --hair:#34373f; --hair-strong:#464a55;
    --accent:#7aa8ff; --accent-ink:#a9c6ff; --accent-wash:#1b2536;
    --gold:#d9a441;
    --ok:#5cc078; --warn:#e6a545; --bad:#e8695c;
    --shadow-sm:0 1px 2px rgba(0,0,0,.3);
    --shadow-md:0 1px 2px rgba(0,0,0,.3), 0 10px 26px rgba(0,0,0,.4);
    --shadow-lg:0 2px 6px rgba(0,0,0,.35), 0 22px 48px rgba(0,0,0,.5);
  }
}
:root[data-theme=light]{
  color-scheme: light;
  --paper:#f5f3ee; --paper-2:#efece5; --card:#fdfbf6; --card-2:#f6f3ec;
  --ink:#23212a; --muted:#6b6774; --faint:#948f9c;
  --hair:#e6e1d8; --hair-strong:#d9d3c8;
  --accent:#2f6fed; --accent-ink:#1e50c4; --accent-wash:#e8effe; --gold:#b1780a;
  --ok:#3f9d55; --warn:#e08a1e; --bad:#d24b3f;
  --shadow-sm:0 1px 2px rgba(30,28,40,.05);
  --shadow-md:0 1px 2px rgba(30,28,40,.05), 0 10px 26px rgba(30,28,40,.07);
  --shadow-lg:0 2px 6px rgba(30,28,40,.06), 0 22px 48px rgba(30,28,40,.12);
}
:root[data-theme=dark]{
  color-scheme: dark;
  --paper:#131418; --paper-2:#0f1013; --card:#1c1e24; --card-2:#191b20;
  --ink:#e9e7e2; --muted:#a19da8; --faint:#797682;
  --hair:#2b2e36; --hair-strong:#3a3e48;
  --accent:#7aa8ff; --accent-ink:#a9c6ff; --accent-wash:#1b2536; --gold:#d9a441;
  --ok:#5cc078; --warn:#e6a545; --bad:#e8695c;
  --shadow-sm:0 1px 2px rgba(0,0,0,.3);
  --shadow-md:0 1px 2px rgba(0,0,0,.3), 0 10px 26px rgba(0,0,0,.4);
  --shadow-lg:0 2px 6px rgba(0,0,0,.35), 0 22px 48px rgba(0,0,0,.5);
}

*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--paper); color:var(--ink);
  font-family:var(--font); font-size:16px; line-height:1.55;
  -webkit-font-smoothing:antialiased;
}
a{color:var(--accent-ink); text-decoration:none}
a:hover{text-decoration:underline}
.shell{width:100%; max-width:var(--shell); margin:0 auto; padding:0 clamp(16px,4vw,44px)}

/* ---- Masthead ------------------------------------------------------------ */
.masthead{
  position:relative; overflow:hidden;
  background:
    radial-gradient(120% 140% at 100% 0, color-mix(in srgb,var(--accent-wash) 55%, transparent), transparent 60%),
    linear-gradient(180deg, var(--card-2), var(--paper));
  border-bottom:1px solid var(--hair);
}
.masthead .shell{padding-top:clamp(16px,3vw,26px); padding-bottom:clamp(20px,3.5vw,34px)}
.topbar{display:flex; align-items:center; gap:14px; flex-wrap:wrap; min-height:34px}
.brand{
  display:inline-flex; align-items:center; gap:10px;
  color:var(--ink); font-weight:700; letter-spacing:-.01em;
}
.brand:hover{text-decoration:none}
.brand:hover .brand-name{color:var(--accent-ink)}
.brand-name{font-size:15px; transition:color .12s}
.brand-name .brand-sub{color:var(--muted); font-weight:600}
.brand-name .brand-sub::before{content:"/"; margin:0 5px; color:var(--faint); font-weight:400}
.crayons{display:inline-flex; gap:4px; flex:0 0 auto}
.crayons i{display:block; border-radius:99px}
.crayons-lg i{width:22px; height:7px}
.crayons-sm i{width:15px; height:5px}
.brand .crayons-lg i{width:16px; height:6px}

.crumbs{margin-left:auto; display:flex; align-items:center; gap:2px; font-size:13px; color:var(--muted); flex-wrap:wrap}
.crumbs a{color:var(--muted)}
.crumbs a:hover{color:var(--accent-ink)}
.crumbs .sep{color:var(--faint); margin:0 5px}
.crumbs .here{color:var(--ink); font-weight:650}

.masthead-body{margin-top:clamp(16px,3vw,26px); position:relative; z-index:1}
.masthead h1{
  font-size:clamp(1.85rem,4.4vw,2.7rem); line-height:1.03; margin:0;
  letter-spacing:-.032em; text-wrap:balance; font-weight:800;
}
.tagline{color:var(--muted); max-width:58ch; margin:.55rem 0 0; font-size:clamp(1rem,1.4vw,1.08rem)}
.masthead-deco{position:absolute; top:-8px; right:clamp(-20px,-1vw,0px); width:clamp(150px,20vw,240px); pointer-events:none; opacity:.14; filter:saturate(1.1); z-index:0}
.masthead-deco svg{width:100%; height:auto; display:block}
@media (prefers-color-scheme:dark){.masthead-deco{opacity:.2}}
:root[data-theme=dark] .masthead-deco{opacity:.2}
@media (max-width:640px){.masthead-deco{display:none}}
.tagline b{color:var(--ink); font-weight:650}
.tagline a{color:var(--accent-ink); text-decoration:underline; text-underline-offset:2px}
.masthead .stat-row{display:flex; flex-wrap:wrap; gap:8px; margin-top:16px}

/* ---- Content ------------------------------------------------------------- */
main{display:block}
main .shell{padding-top:clamp(24px,4vw,40px); padding-bottom:clamp(48px,7vw,84px)}
.section-head{display:flex; align-items:baseline; gap:10px; margin:clamp(30px,5vw,46px) 0 14px}
.section-head:first-child{margin-top:0}
.section-head h2{font-size:1.18rem; margin:0; letter-spacing:-.01em; font-weight:750}
.section-head .desc{color:var(--muted); font-size:.9rem}
.eyebrow{font-size:.72rem; text-transform:uppercase; letter-spacing:.12em; color:var(--gold); font-weight:700}

/* chips / pills */
.chip{
  display:inline-flex; align-items:center; gap:6px; white-space:nowrap;
  font-size:.76rem; font-weight:600; padding:4px 11px; border-radius:999px;
  background:var(--card); border:1px solid var(--hair); color:var(--muted);
}
.chip b{color:var(--ink); font-weight:700}
.chip.accent{background:var(--accent-wash); border-color:transparent; color:var(--accent-ink)}
.chip .dot{width:7px; height:7px; border-radius:99px; background:var(--accent)}

/* card grid — each card carries a single collection --hue (a crayon color) that
   tints its top edge and icon plaque; the full rainbow is reserved for the
   masthead brand + footer so the motif stays a signature, not wallpaper. */
.card-grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(288px,1fr)); gap:clamp(14px,2vw,20px)}
.card{
  --hue:var(--accent); position:relative; display:flex; flex-direction:column;
  background:var(--card); border:1px solid var(--hair); border-radius:var(--r-md);
  box-shadow:var(--shadow-sm); overflow:hidden; transition:transform .14s ease, box-shadow .14s ease, border-color .14s ease;
}
.card:hover{transform:translateY(-3px); box-shadow:var(--shadow-lg); border-color:color-mix(in srgb,var(--hue) 45%, var(--hair-strong))}
.card > a.card-hit{position:absolute; inset:0; z-index:1}
.card-top{height:5px; background:linear-gradient(90deg,var(--hue),color-mix(in srgb,var(--hue) 40%, transparent))}
.card-body{padding:18px 18px 16px; display:flex; flex-direction:column; gap:9px; flex:1}
.card-emoji{
  width:46px; height:46px; border-radius:13px; display:grid; place-items:center;
  background:color-mix(in srgb,var(--hue) 13%, var(--card-2));
  border:1px solid color-mix(in srgb,var(--hue) 26%, var(--hair)); color:var(--hue);
}
.card-emoji svg{width:26px; height:26px; display:block}
.card-emoji.is-emoji{font-size:24px}
.card h3{margin:2px 0 0; font-size:1.14rem; letter-spacing:-.01em; font-weight:750}
.card p{margin:0; color:var(--muted); font-size:.92rem; flex:1}
.card-meta{margin-top:2px; font-size:.78rem; color:var(--faint)}
.card-meta .kind{color:var(--muted); font-weight:650}
.card-links{position:relative; z-index:2; display:flex; flex-wrap:wrap; gap:6px 14px; margin-top:2px; font-size:.82rem}
.card .go{position:relative; z-index:2; margin-top:4px; align-self:flex-start; display:inline-flex; align-items:center; gap:6px; font-weight:700; color:var(--accent-ink); font-size:.9rem}
.card:hover .go .arrow{transform:translateX(3px)}
.go .arrow{transition:transform .14s ease}

/* footer */
.site-foot{border-top:1px solid var(--hair); background:var(--card-2)}
.site-foot .shell{display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding-top:22px; padding-bottom:26px; color:var(--muted); font-size:.85rem}
.site-foot .crayons{opacity:.9}
.site-foot p{margin:0}
.site-foot a{color:var(--accent-ink); text-decoration:none}
.site-foot a:hover{text-decoration:underline; text-underline-offset:2px}

.empty{color:var(--muted); background:var(--card); border:1px dashed var(--hair-strong); border-radius:var(--r-md); padding:22px}
code{background:color-mix(in srgb,var(--ink) 8%, transparent); padding:.1em .42em; border-radius:5px; font-size:.88em}

@media (max-width:560px){
  .crumbs{width:100%; margin-left:0; margin-top:6px}
  .card-grid{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){
  .card,.go .arrow{transition:none}
}
`;

// A page's <style> block: shared chrome first, then any page-specific CSS.
export function chromeStyle(extraCss = '') {
  return `<style>${CHROME_CSS}${extraCss ? '\n/* page */\n' + extraCss : ''}</style>`;
}

// The crayon masthead. `crumbs` is an ordered trail — every entry except the last
// should carry an `href`; the last renders as the current location. `home` is the
// relative path back to the artifacts index (the brand + first crumb target).
export function masthead({
  title,
  tagline = '',
  crumbs = [],
  home = 'index.html',
  stats = '',
  decoration = '',
}) {
  const trail = crumbs.length
    ? `<nav class="crumbs" aria-label="Breadcrumb">` +
      crumbs
        .map((c, i) => {
          const last = i === crumbs.length - 1;
          const node = last
            ? `<span class="here" aria-current="page">${esc(c.label)}</span>`
            : `<a href="${esc(c.href)}">${esc(c.label)}</a>`;
          return (i ? `<span class="sep">/</span>` : '') + node;
        })
        .join('') +
      `</nav>`
    : '';
  return `<header class="masthead">
  ${decoration ? `<div class="masthead-deco" aria-hidden="true">${decoration}</div>` : ''}
  <div class="shell">
    <div class="topbar">
      <a class="brand" href="${esc(home)}">${crayons('lg')}<span class="brand-name">Splotch<span class="brand-sub">Artifacts</span></span></a>
      ${trail}
    </div>
    <div class="masthead-body">
      <h1>${esc(title)}</h1>
      ${tagline ? `<p class="tagline">${tagline}</p>` : ''}
      ${stats ? `<div class="stat-row">${stats}</div>` : ''}
    </div>
  </div>
</header>`;
}

// Standard footer. `home` matches the masthead's relative index path.
export function siteFooter({ home = 'index.html' } = {}) {
  return `<footer class="site-foot">
  <div class="shell">
    ${crayons('sm')}
    <p>Committed run outputs from the Splotch generators — see <code>artifacts/README.md</code>. · <a href="https://github.com/KyleMit/Splotch">GitHub</a> · <a href="${esc(home)}">All artifacts</a></p>
  </div>
</footer>`;
}

// Full self-contained HTML document wrapper for the pages this module fully owns
// (the index and the icons sheet). The report/proof-sheet generators inject the
// pieces above into their own shells instead.
export function page({ title, extraCss = '', body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
${chromeStyle(extraCss)}
</head>
<body>
${body}
</body>
</html>
`;
}
