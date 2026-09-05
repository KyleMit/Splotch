import { esc } from '../../lib/html.mjs';
import {
  captureReviewId,
  PAGE_INVENTORY_SEVERITIES,
  PAGE_INVENTORY_THEMES,
} from './page-inventory-data.mjs';
import { chromeStyle, masthead, siteFooter } from '../../scrapbook/lib/scrapbook-chrome.mjs';

const PAGE_INVENTORY_DEVICES = [
  ['iphone-13-mini', 'Small iPhone', 'iPhone 13 mini', 'phone', 375, 812],
  ['iphone-16-pro-max', 'Large iPhone', 'iPhone 16 Pro Max', 'phone', 440, 956],
  ['ipad-mini-7', 'iPad mini', 'iPad mini 7th Gen (2024)', 'tablet', 744, 1133],
  ['ipad-pro-13-m4', 'Large iPad Pro', 'iPad Pro 13-inch (M4)', 'tablet', 1032, 1376],
].map(([id, category, device, formFactor, width, height]) => ({
  id,
  category,
  device,
  formFactor,
  width,
  height,
}));

export const PAGE_INVENTORY_VIEWPORTS = [
  ...PAGE_INVENTORY_DEVICES.map((device) => ({ ...device, orientation: 'portrait' })),
  ...PAGE_INVENTORY_DEVICES.map((device) => ({
    ...device,
    id: `${device.id}-landscape`,
    width: device.height,
    height: device.width,
    orientation: 'landscape',
  })),
];

const PAGE_INVENTORY_GROUPS = {
  routes: {
    title: 'Routes',
    short: 'Routes',
    description: 'Every SvelteKit page route with a visual surface. API endpoints are omitted.',
  },
  settings: {
    title: 'Settings',
    short: 'Settings',
    description: 'The responsive hub and every section from the canonical Settings list.',
  },
  controls: {
    title: 'Canvas & controls',
    short: 'Canvas',
    description: 'Drawing states, flyouts, pickers, guidance, and transient chrome.',
  },
  ai: {
    title: 'AI flow',
    short: 'AI',
    description: 'The style picker and every meaningful generated-picture modal state.',
  },
  admin: {
    title: 'Admin',
    short: 'Admin',
    description: 'Authenticated ledger views and responsive row actions.',
  },
};

const SEVERITY_LABELS = {
  pass: 'Pass',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

// What the page tells a reader each theme was judged on. Deliberately not
// theme.reviewFocus: that string is the reviewer's brief, it is bound into every
// checkpoint's description digest, and it reads like a prompt rather than a caption.
const THEME_SUMMARIES = {
  light: 'Judged on layout, spacing, text fit, and touch targets.',
  dark: 'Judged on contrast and legibility only.',
};

const ORIENTATIONS = [
  ['portrait', 'Portrait'],
  ['landscape', 'Landscape'],
];

const REPORT_CSS = `
:root{--shot-cap:min(460px,62vh)}

/* ---- Toolbar ------------------------------------------------------------- */
.toolbar{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--paper) 88%,transparent);border-bottom:1px solid var(--hair);backdrop-filter:blur(14px)}
.toolbar .shell{padding-top:7px;padding-bottom:7px}
.bar{position:relative;display:flex;align-items:center;flex-wrap:wrap;gap:7px 12px}
.jump{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -2px;padding:2px;flex:0 1 auto;min-width:0}
.jump::-webkit-scrollbar{display:none}
.scrolls{mask-image:linear-gradient(90deg,#000 calc(100% - 22px),transparent)}
.jump a{flex:0 0 auto;padding:5px 11px;border-radius:999px;color:var(--muted);font-size:.79rem;font-weight:700;white-space:nowrap}
.jump a:hover{color:var(--accent-ink);background:var(--card);text-decoration:none}
.jump a[aria-current=true]{background:var(--accent-wash);color:var(--accent-ink)}

.facets{display:flex;align-items:center;gap:6px;flex:0 0 auto;padding-left:14px;border-left:1px solid var(--hair)}
.pick{--tint:var(--hair-strong);position:relative;display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--hair);border-radius:999px;background:var(--card);color:var(--muted);font-size:.76rem;font-weight:700;line-height:1.3;white-space:nowrap;cursor:pointer;user-select:none}
.pick input{position:absolute;opacity:0;pointer-events:none}
.pick::before{content:"";width:9px;height:9px;border-radius:99px;background:var(--tint);flex:0 0 auto}
.pick.no-dot::before{display:none}
.pick b{color:var(--faint);font-weight:700;font-variant-numeric:tabular-nums}
.pick:hover{border-color:var(--hair-strong)}
.pick:has(input:checked){border-color:color-mix(in srgb,var(--tint) 60%,var(--hair));background:color-mix(in srgb,var(--tint) 14%,var(--card));color:var(--ink)}
.pick:has(input:checked) b{color:var(--ink)}
.pick:has(input:focus-visible){outline:2px solid var(--accent);outline-offset:2px}

.more{flex:0 0 auto}
.more>summary{list-style:none;--tint:var(--accent)}
.more>summary::-webkit-details-marker{display:none}
.more>summary .short{display:none}
.more>summary::after{content:"▾";font-size:.62rem;color:var(--faint)}
.more[open]>summary::after{content:"▴"}
.more[open]>summary{border-color:var(--hair-strong);background:var(--card-2);color:var(--ink)}
.more-panel{position:absolute;z-index:5;top:calc(100% + 10px);right:0;width:min(360px,100%);padding:14px;border:1px solid var(--hair-strong);border-radius:var(--r-md);background:var(--card);box-shadow:var(--shadow-lg)}
.more-panel .row+.row{margin-top:12px}
.more-panel .legend{display:block;margin-bottom:6px;color:var(--faint);font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
.more-panel .picks{display:flex;flex-wrap:wrap;gap:6px}
.more-panel input[type=search]{width:100%;padding:8px 11px;border:1px solid var(--hair-strong);border-radius:var(--r-sm);background:var(--card-2);color:var(--ink);font:inherit;font-size:.85rem}
.more-panel input[type=search]:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.more-foot .muted-note{color:var(--faint);font-size:.72rem;line-height:1.35}
.more-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid var(--hair)}
.more-foot button{white-space:nowrap;padding:6px 12px;border:1px solid var(--hair-strong);border-radius:999px;background:var(--card-2);color:var(--ink);font:inherit;font-size:.76rem;font-weight:700;cursor:pointer}
.more-foot button:hover{border-color:var(--accent);color:var(--accent-ink)}
.tally{color:var(--muted);font-size:.76rem;font-weight:700;font-variant-numeric:tabular-nums;margin-left:auto;flex:0 0 auto;white-space:nowrap}

/* ---- Groups & surfaces --------------------------------------------------- */
.group{scroll-margin-top:calc(var(--bar-h,64px) + 16px);margin-top:clamp(34px,5vw,52px)}
.group:first-of-type{margin-top:0}
.group-head{margin-bottom:16px}
.group-head h2{margin:0;font-size:1.3rem;letter-spacing:-.015em}
.group-head p{margin:3px 0 0;color:var(--muted);font-size:.9rem;max-width:72ch}

.surface-list{display:flex;flex-direction:column;gap:20px}
.surface{scroll-margin-top:calc(var(--bar-h,64px) + 16px);background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);box-shadow:var(--shadow-sm);overflow:hidden}
.surface-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:14px 18px}
.surface-head h3{margin:0;font-size:1.02rem;letter-spacing:-.01em}
.surface-head h3 .anchor{margin-left:6px;color:var(--faint);font-weight:600;opacity:0;transition:opacity .12s}
.surface-head h3:hover .anchor,.surface-head h3 .anchor:focus-visible{opacity:1;text-decoration:none}
.surface-head p{margin:3px 0 0;color:var(--muted);font-size:.85rem;max-width:72ch}
.surface-meta{display:flex;align-items:center;gap:10px;flex:0 0 auto;flex-wrap:wrap;justify-content:flex-end}
.surface-source{color:var(--faint);font:600 .71rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--card-2);border:1px solid var(--hair);border-radius:6px;padding:3px 7px}
.tallies{--tint:var(--hair-strong);display:flex;gap:8px}
.tallies span{display:inline-flex;align-items:center;gap:5px;color:var(--muted);font-size:.72rem;font-weight:700;font-variant-numeric:tabular-nums}
.tallies span::before{content:"";width:8px;height:8px;border-radius:99px;background:var(--tint)}

.theme-captures{border-top:1px solid var(--hair)}
.theme-head{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;padding:9px 18px;background:var(--card-2);border-bottom:1px solid var(--hair)}
.theme-head h4{margin:0;font-size:.82rem;letter-spacing:.01em}
.theme-head p{margin:0;color:var(--faint);font-size:.73rem}
.orientation{background:var(--card-2)}
.orientation-label{margin:0;padding:12px 18px 0;color:var(--faint);font-size:.66rem;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
.orientation+.orientation .orientation-label{padding-top:4px}

/* ---- Shots --------------------------------------------------------------- */
.shots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));align-items:start;gap:14px;padding:9px 18px 16px;background:var(--card-2)}
.shot{--tint:var(--hair-strong);display:flex;flex-direction:column;margin:0;min-width:0;padding:11px;border:1px solid var(--hair);border-radius:var(--r-sm);background:var(--card)}
.shot-view{display:flex;align-items:baseline;gap:7px;margin-bottom:7px;line-height:1.25;white-space:nowrap}
.shot-view strong{font-size:.75rem;overflow:hidden;text-overflow:ellipsis}
.shot-view span{color:var(--faint);font-size:.67rem;font-variant-numeric:tabular-nums}
.shot-frame{display:flex;justify-content:center;margin-bottom:9px;border-radius:9px}
.shot-frame img{display:block;width:auto;height:auto;max-width:100%;max-height:var(--shot-cap);border:1px solid var(--hair-strong);border-radius:8px;background:var(--paper-2);box-shadow:var(--shadow-sm);transition:border-color .12s,box-shadow .12s}
.shot-frame:hover img{border-color:var(--accent);box-shadow:var(--shadow-md)}
.shot-frame:focus-visible{outline:2px solid var(--accent);outline-offset:3px}

.review{margin-top:9px;border:1px solid color-mix(in srgb,var(--tint) 34%,var(--hair));border-radius:7px;background:color-mix(in srgb,var(--tint) 10%,var(--card-2));overflow:hidden}
.review>summary{list-style:none;display:flex;align-items:center;gap:7px;padding:6px 9px;color:var(--muted);font-size:.7rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
.review>summary::-webkit-details-marker{display:none}
.review>summary::before{content:"";width:9px;height:9px;border-radius:99px;background:var(--tint);flex:0 0 auto}
.review>summary::after{content:"Read";margin-left:auto;color:var(--faint);font-size:.66rem;font-weight:700;letter-spacing:.04em;text-transform:none}
.review[open]>summary::after{content:"Hide"}
.review>summary:hover{color:var(--ink)}
.review>summary:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.review-body{padding:0 9px 9px;color:var(--muted);font-size:.76rem;line-height:1.5}
.review-body p{margin:7px 0 0}
.review-body p:first-child{color:var(--ink)}
.review-body strong{color:var(--ink)}
.review-body .shared{color:var(--faint);font-size:.71rem}

.no-match{margin:40px 0;padding:26px;border:1px dashed var(--hair-strong);border-radius:var(--r-md);background:var(--card);color:var(--muted);text-align:center}
.no-match b{display:block;color:var(--ink);margin-bottom:4px}

/* ---- Full-size viewer ---------------------------------------------------- */
.viewer{width:min(1120px,94vw);max-width:none;max-height:92vh;padding:0;border:1px solid var(--hair-strong);border-radius:var(--r-md);background:var(--card);color:var(--ink);box-shadow:var(--shadow-lg);overflow:hidden}
.viewer::backdrop{background:color-mix(in srgb,#000 62%,transparent)}
.viewer-head{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--hair);background:var(--card-2)}
.viewer-head h2{margin:0;font-size:.94rem;letter-spacing:-.01em}
.viewer-head .where{color:var(--muted);font-size:.76rem}
.viewer-head .step{margin-left:auto;display:flex;align-items:center;gap:6px}
.viewer-head button{display:inline-grid;place-items:center;min-width:32px;height:32px;padding:0 9px;border:1px solid var(--hair-strong);border-radius:8px;background:var(--card);color:var(--ink);font:inherit;font-size:.82rem;font-weight:700;cursor:pointer}
.viewer-head button:hover{border-color:var(--accent);color:var(--accent-ink)}
.viewer-head .count{color:var(--faint);font-size:.73rem;font-variant-numeric:tabular-nums;padding:0 2px}
.viewer-body{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;padding:16px;overflow:auto;max-height:calc(92vh - 56px)}
.viewer-body img{display:block;width:auto;max-width:100%;max-height:calc(92vh - 100px);margin:0 auto;border:1px solid var(--hair-strong);border-radius:9px;background:var(--paper-2)}
.viewer-side{--tint:var(--hair-strong);min-width:0}
.viewer-side .verdict{display:inline-flex;align-items:center;gap:7px;margin-bottom:8px;color:var(--ink);font-size:.7rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase}
.viewer-side .verdict::before{content:"";width:10px;height:10px;border-radius:99px;background:var(--tint)}
.viewer-side .review-body{padding:0;font-size:.8rem}

.to-top{position:fixed;right:16px;bottom:16px;z-index:15;display:none;align-items:center;gap:6px;padding:9px 14px;border:1px solid var(--hair-strong);border-radius:999px;background:var(--card);color:var(--ink);font:inherit;font-size:.78rem;font-weight:700;box-shadow:var(--shadow-md);cursor:pointer}
.to-top.on{display:inline-flex}
.to-top:hover{border-color:var(--accent);color:var(--accent-ink)}

.severity-pass{--tint:var(--c-green)}
.severity-low{--tint:var(--c-yellow)}
.severity-medium{--tint:var(--c-orange)}
.severity-high{--tint:var(--c-red)}

[hidden]{display:none!important}

@media (max-width:1080px){
  .viewer-body{grid-template-columns:1fr}
  .viewer-body img{max-height:56vh}
}
@media (max-width:640px){
  .viewer{width:100vw;max-height:100vh;border:0;border-radius:0}
  .viewer-head{flex-wrap:wrap;row-gap:2px}
  .viewer-head h2{flex:1 1 auto}
  .viewer-head .where{flex:1 0 100%;order:3;font-size:.72rem}
  .viewer-head .step{order:2}
  .viewer-body{max-height:calc(100vh - 84px);padding:12px}
}
@media (max-width:1120px){
  .facets .pick .name{display:none}
}
@media (max-width:1000px){
  .more>summary .name{display:none}
  .more>summary .short{display:inline}
}
@media (max-width:820px){
  .shots{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:9px 14px 14px}
  .surface-head{flex-direction:column;align-items:stretch}
  .surface-meta{justify-content:flex-start}
}
@media (max-width:640px){
  .more-panel{left:0;right:0;width:auto}
  .facets{order:2;padding-left:0;border-left:0;flex:1 1 90px;min-width:0;overflow-x:auto;scrollbar-width:none}
  .facets::-webkit-scrollbar{display:none}
  .jump{order:1;flex:1 0 100%}
  .more{order:3}
  .tally{order:4}
  .pick{padding:5px 9px}
}
@media (max-width:480px){
  :root{--shot-cap:min(620px,72vh)}
  .shots{grid-template-columns:1fr;gap:14px;padding:8px 12px 12px}
  .orientation-label{padding:12px 12px 0}
}
@media (prefers-reduced-motion:reduce){
  .shot-frame img,.surface-head h3 .anchor{transition:none}
}
`;

const REPORT_SCRIPT = `<script>
(() => {
  const root = document.documentElement;
  const toolbar = document.querySelector('.toolbar');
  const shots = [...document.querySelectorAll('.shot')];
  const rows = [...document.querySelectorAll('.orientation')];
  const themes = [...document.querySelectorAll('.theme-captures')];
  const surfaces = [...document.querySelectorAll('.surface')];
  const groups = [...document.querySelectorAll('.group')];

  const strips = [...document.querySelectorAll('.jump, .facets')];
  const measureBar = () => {
    root.style.setProperty('--bar-h', toolbar.offsetHeight + 'px');
    for (const strip of strips) {
      strip.classList.toggle('scrolls', strip.scrollWidth > strip.clientWidth + 1);
    }
  };
  measureBar();
  addEventListener('resize', measureBar);

  const viewer = { list: [], at: -1, resync() {} };

  const controls = document.querySelector('[data-controls]');
  if (controls) {
    const tally = controls.querySelector('[data-tally]');
    const search = controls.querySelector('[data-search]');
    const empty = document.querySelector('[data-empty]');
    const openAll = controls.querySelector('[data-open-reviews]');
    const picked = (facet) =>
      new Set(
        [...controls.querySelectorAll('input[data-facet="' + facet + '"]:checked')].map((i) => i.value)
      );

    const apply = () => {
      const severity = picked('severity');
      const device = picked('device');
      const orientation = picked('orientation');
      const theme = picked('theme');
      const query = search.value.trim().toLowerCase();
      let shown = 0;
      for (const surface of surfaces) {
        const named = !query || surface.dataset.search.includes(query);
        for (const shot of surface.querySelectorAll('.shot')) {
          const d = shot.dataset;
          shot.hidden = !named
            || (severity.size && !severity.has(d.severity))
            || (device.size && !device.has(d.device))
            || (orientation.size && !orientation.has(d.orientation))
            || (theme.size && !theme.has(d.theme));
          if (!shot.hidden) shown += 1;
        }
      }
      for (const row of rows) row.hidden = !row.querySelector('.shot:not([hidden])');
      for (const section of themes) section.hidden = !section.querySelector('.shot:not([hidden])');
      for (const surface of surfaces) surface.hidden = !surface.querySelector('.shot:not([hidden])');
      for (const group of groups) group.hidden = !group.querySelector('.surface:not([hidden])');
      empty.hidden = shown > 0;
      tally.textContent = shown === shots.length
        ? shots.length + ' shots'
        : shown + ' of ' + shots.length + ' shots';
      viewer.resync();
    };

    controls.addEventListener('input', (event) => {
      if (event.target === openAll) {
        for (const review of document.querySelectorAll('.review')) review.open = openAll.checked;
        return;
      }
      apply();
    });
    controls.querySelector('[data-reset]').addEventListener('click', () => {
      for (const input of controls.querySelectorAll('input[data-facet]')) input.checked = false;
      search.value = '';
      apply();
    });
    apply();
  }

  const dialog = document.querySelector('.viewer');
  if (dialog && typeof dialog.showModal === 'function') {
    const image = dialog.querySelector('[data-viewer-image]');
    const title = dialog.querySelector('[data-viewer-title]');
    const where = dialog.querySelector('[data-viewer-where]');
    const side = dialog.querySelector('[data-viewer-side]');
    const step = dialog.querySelector('[data-viewer-step]');

    const show = (index) => {
      const shot = viewer.list[index];
      if (!shot) return;
      viewer.at = index;
      const link = shot.querySelector('.shot-frame');
      const img = shot.querySelector('img');
      image.src = link.getAttribute('href');
      image.alt = img.alt;
      title.textContent = shot.closest('.surface').querySelector('h3 .name').textContent;
      where.textContent = shot.dataset.where;
      side.className = 'viewer-side ' + (shot.dataset.severity === 'unreviewed' ? '' : 'severity-' + shot.dataset.severity);
      const review = shot.querySelector('.review-body');
      side.innerHTML = review
        ? '<span class="verdict">' + shot.dataset.severityLabel + '</span>' + review.outerHTML
        : '<p class="review-body">No review recorded for this screenshot.</p>';
      step.textContent = index + 1 + ' / ' + viewer.list.length;
    };
    const move = (delta) => show((viewer.at + delta + viewer.list.length) % viewer.list.length);

    viewer.resync = () => {
      viewer.list = shots.filter((shot) => !shot.hidden);
    };
    viewer.resync();

    document.addEventListener('click', (event) => {
      const link = event.target.closest('.shot-frame');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      const index = viewer.list.indexOf(link.closest('.shot'));
      if (index < 0) return;
      show(index);
      dialog.showModal();
    });
    dialog.querySelector('[data-viewer-prev]').addEventListener('click', () => move(-1));
    dialog.querySelector('[data-viewer-next]').addEventListener('click', () => move(1));
    dialog.querySelector('[data-viewer-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  const links = new Map(
    [...document.querySelectorAll('.jump a')].map((a) => [a.getAttribute('href').slice(1), a])
  );
  const seen = new Set();
  const spy = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (record.isIntersecting) seen.add(record.target.id);
        else seen.delete(record.target.id);
      }
      let current = '';
      for (const [id, link] of links) {
        if (!current && seen.has(id)) current = id;
        link.removeAttribute('aria-current');
      }
      if (current) links.get(current).setAttribute('aria-current', 'true');
    },
    { rootMargin: '-25% 0px -60% 0px' }
  );
  for (const group of groups) spy.observe(group);

  const toTop = document.querySelector('.to-top');
  addEventListener('scroll', () => toTop.classList.toggle('on', scrollY > 900), { passive: true });
  toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
})();
</script>`;

export { PAGE_INVENTORY_THEMES };

export function inventoryCaptureKey(viewport, theme) {
  return `${viewport.id}--${theme.id}`;
}

export function inventoryCapturePath(item, viewport, theme) {
  return `assets/${item.group}/${item.id}--${viewport.id}--${theme.id}.webp`;
}

export function attachExpectedCapturePaths(items) {
  for (const item of items) {
    item.captures = Object.fromEntries(
      PAGE_INVENTORY_THEMES.flatMap((theme) =>
        PAGE_INVENTORY_VIEWPORTS.map((viewport) => [
          inventoryCaptureKey(viewport, theme),
          inventoryCapturePath(item, viewport, theme),
        ])
      )
    );
  }
  return items;
}

// Without this line two visually identical shots carrying different severities
// read as reviewer inconsistency, when what they record is one shared shell
// judged against two different expectations of what should have been there.
function sharedPixelsByReviewId(pixelIdenticalGroups) {
  const shared = new Map();
  for (const group of pixelIdenticalGroups) {
    for (const review of group.reviews) {
      const others = group.reviews.length - 1;
      shared.set(
        review.review_id,
        `Pixel-identical to ${others} other capture${others === 1 ? '' : 's'} in this theme${group.divergent ? ', judged differently' : ''}.`
      );
    }
  }
  return shared;
}

function titleCase(word) {
  return `${word[0].toUpperCase()}${word.slice(1)}`;
}

function reviewDisclosure(entry, sharedPixels) {
  if (!entry) return '';
  const recommendation = entry.recommendation?.trim()
    ? `<p><strong>Recommendation:</strong> ${esc(entry.recommendation)}</p>`
    : '';
  const shared = sharedPixels ? `<p class="shared">${esc(sharedPixels)}</p>` : '';
  return `<details class="review"><summary>${esc(SEVERITY_LABELS[entry.severity])}</summary><div class="review-body"><p>${esc(entry.critique)}</p>${recommendation}${shared}</div></details>`;
}

function pick(facet, value, label, { count, dotless = false } = {}) {
  const tally = count === undefined ? '' : `<b>${count}</b>`;
  const name = `<span class="name">${esc(label)}</span>`;
  const severity = facet === 'severity' ? ` severity-${value}` : '';
  return `<label class="pick${dotless ? ' no-dot' : ''}${severity}" title="${esc(label)}"><input type="checkbox" data-facet="${facet}" value="${esc(value)}"/>${name}${tally}</label>`;
}

function controls(severityCounts, hasCritique) {
  const severities = hasCritique
    ? `<div class="facets" role="group" aria-label="Filter by severity">${PAGE_INVENTORY_SEVERITIES.map(
        (severity) =>
          pick('severity', severity, SEVERITY_LABELS[severity], { count: severityCounts[severity] })
      ).join('')}</div>`
    : '';
  const devices = PAGE_INVENTORY_DEVICES.map((device) =>
    pick('device', device.id, device.category, { dotless: true })
  ).join('');
  const orientations = ORIENTATIONS.map(([id, label]) =>
    pick('orientation', id, label, { dotless: true })
  ).join('');
  const modes = PAGE_INVENTORY_THEMES.map((theme) =>
    pick('theme', theme.id, theme.label, { dotless: true })
  ).join('');
  const reviewsRow = hasCritique
    ? `<div class="row"><span class="legend">Reviews</span><label class="pick no-dot"><input type="checkbox" data-open-reviews/><span class="name">Open every review</span></label></div>`
    : '';
  return `<div class="bar" data-controls>
  <nav class="jump" aria-label="Jump to a group">${Object.entries(PAGE_INVENTORY_GROUPS)
    .map(([id, { title, short }]) => `<a href="#${id}" title="${esc(title)}">${esc(short)}</a>`)
    .join('')}</nav>
  ${severities}
  <details class="more">
    <summary class="pick no-dot"><span class="name">More filters</span><span class="short">Filter</span></summary>
    <div class="more-panel">
      <div class="row"><label class="legend" for="surface-search">Find a surface</label><input id="surface-search" type="search" data-search placeholder="Canvas, Settings, admin…" autocomplete="off"/></div>
      <div class="row"><span class="legend">Device</span><div class="picks">${devices}</div></div>
      <div class="row"><span class="legend">Orientation</span><div class="picks">${orientations}</div></div>
      <div class="row"><span class="legend">Mode</span><div class="picks">${modes}</div></div>
      ${reviewsRow}
      <div class="more-foot"><span class="muted-note">Nothing checked means everything shows.</span><button type="button" data-reset>Clear filters</button></div>
    </div>
  </details>
  <span class="tally" data-tally aria-live="polite"></span>
</div>`;
}

function viewerDialog() {
  return `<dialog class="viewer" aria-label="Screenshot at full size">
  <div class="viewer-head">
    <h2 data-viewer-title></h2><span class="where" data-viewer-where></span>
    <div class="step">
      <button type="button" data-viewer-prev aria-label="Previous screenshot">‹</button>
      <span class="count" data-viewer-step></span>
      <button type="button" data-viewer-next aria-label="Next screenshot">›</button>
      <button type="button" data-viewer-close aria-label="Close" title="Close">✕</button>
    </div>
  </div>
  <div class="viewer-body">
    <img data-viewer-image alt=""/>
    <div class="viewer-side" data-viewer-side></div>
  </div>
</dialog>`;
}

function surfaceTallies(item, critique) {
  const counts = Object.fromEntries(PAGE_INVENTORY_SEVERITIES.map((severity) => [severity, 0]));
  for (const theme of PAGE_INVENTORY_THEMES) {
    for (const view of PAGE_INVENTORY_VIEWPORTS) {
      const entry = critique.get(captureReviewId(item, view, theme));
      if (entry) counts[entry.severity] += 1;
    }
  }
  const shown = PAGE_INVENTORY_SEVERITIES.filter((severity) => counts[severity] > 0)
    .map(
      (severity) =>
        `<span class="severity-${severity}">${counts[severity]} ${esc(SEVERITY_LABELS[severity].toLowerCase())}</span>`
    )
    .join('');
  return shown ? `<div class="tallies">${shown}</div>` : '';
}

function shotFigure(item, view, theme, critique, sharedPixels) {
  const path = item.captures[inventoryCaptureKey(view, theme)];
  const reviewId = captureReviewId(item, view, theme);
  const entry = critique.get(reviewId);
  const severity = entry?.severity ?? 'unreviewed';
  const where = `${view.device} · ${titleCase(view.orientation)} · ${view.width} × ${view.height} · ${theme.label.toLowerCase()}`;
  const alt = `${item.title} in ${theme.label.toLowerCase()} at ${view.device} in ${view.orientation}`;
  return `<figure class="shot${entry ? ` severity-${severity}` : ''}" data-severity="${severity}" data-severity-label="${esc(SEVERITY_LABELS[severity] ?? 'Unreviewed')}" data-device="${esc(view.id.replace(/-landscape$/, ''))}" data-orientation="${view.orientation}" data-theme="${theme.id}" data-where="${esc(where)}"><figcaption class="shot-view"><strong>${esc(view.category)}</strong><span>${view.width} × ${view.height}</span></figcaption><a class="shot-frame" href="${esc(path)}"><img src="${esc(path)}" width="${view.width}" height="${view.height}" loading="lazy" alt="${esc(alt)}"/></a>${reviewDisclosure(entry, sharedPixels.get(reviewId))}</figure>`;
}

function surfaceCard(item, critique, sharedPixels) {
  const themeCaptures = PAGE_INVENTORY_THEMES.map((theme) => {
    const rows = ORIENTATIONS.map(([orientation, label]) => {
      const shots = PAGE_INVENTORY_VIEWPORTS.filter((view) => view.orientation === orientation)
        .map((view) => shotFigure(item, view, theme, critique, sharedPixels))
        .join('');
      return `<div class="orientation"><p class="orientation-label">${esc(label)}</p><div class="shots">${shots}</div></div>`;
    }).join('');
    return `<section class="theme-captures"><header class="theme-head"><h4>${esc(theme.label)}</h4><p>${esc(THEME_SUMMARIES[theme.id] ?? theme.reviewFocus)}</p></header>${rows}</section>`;
  }).join('');
  const search = esc(`${item.title} ${item.description} ${item.source}`.toLowerCase());
  return `<article class="surface" id="${esc(item.id)}" data-search="${search}"><header class="surface-head"><div><h3><span class="name">${esc(item.title)}</span><a class="anchor" href="#${esc(item.id)}" aria-label="Link to ${esc(item.title)}">#</a></h3><p>${esc(item.description)}</p></div><div class="surface-meta">${surfaceTallies(item, critique)}<span class="surface-source">${esc(item.source)}</span></div></header>${themeCaptures}</article>`;
}

export function renderPageInventoryReport(items, critique, pixelIdenticalGroups) {
  const sharedPixels = sharedPixelsByReviewId(pixelIdenticalGroups);
  const severityCounts = Object.fromEntries(
    PAGE_INVENTORY_SEVERITIES.map((severity) => [severity, 0])
  );
  for (const entry of critique.values()) severityCounts[entry.severity] += 1;
  const snapshotCount =
    items.length * PAGE_INVENTORY_VIEWPORTS.length * PAGE_INVENTORY_THEMES.length;
  const stats =
    `<span class="chip accent"><b>${items.length}</b> surfaces</span>` +
    `<span class="chip"><b>${snapshotCount}</b> screenshots</span>` +
    `<span class="chip"><b>${PAGE_INVENTORY_VIEWPORTS.length}</b> viewports</span>`;
  const groups = Object.entries(PAGE_INVENTORY_GROUPS)
    .map(([groupId, { title, description }]) => {
      const cards = items
        .filter((item) => item.group === groupId)
        .map((item) => surfaceCard(item, critique, sharedPixels))
        .join('');
      return `<section class="group" id="${groupId}"><header class="group-head"><h2>${esc(title)}</h2><p>${esc(description)}</p></header><div class="surface-list">${cards}</div></section>`;
    })
    .join('');
  const tagline = critique.size
    ? 'Every screen in the app in light and night mode, on four Apple devices in portrait and landscape. Each screenshot carries a review written from the image alone — open one to read it.'
    : 'Every screen in the app in light and night mode, on four Apple devices in portrait and landscape.';
  const emptyState = `<p class="no-match" data-empty hidden><b>Nothing matches those filters.</b>Clear one of them to bring screenshots back.</p>`;
  const body = `${masthead({
    title: 'App page inventory',
    tagline,
    home: '../index.html',
    crumbs: [{ label: 'App page inventory' }],
    stats,
  })}<div class="toolbar"><div class="shell">${controls(severityCounts, critique.size > 0)}</div></div><main><div class="shell">${emptyState}${groups}</div></main>${siteFooter({ home: '../index.html' })}<button type="button" class="to-top">↑ Top</button>${viewerDialog()}${REPORT_SCRIPT}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>App page inventory — Splotch scrapbook</title>${chromeStyle(REPORT_CSS)}</head><body>${body}</body></html>\n`.replace(
    /[ \t]+$/gm,
    ''
  );
}
