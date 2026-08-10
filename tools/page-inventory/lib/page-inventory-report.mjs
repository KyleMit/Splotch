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
  routes: [
    'Routes',
    'Every SvelteKit page route with a visual surface. API endpoints are omitted.',
  ],
  settings: ['Settings', 'The responsive hub and every section from the canonical Settings list.'],
  controls: [
    'Canvas & controls',
    'Drawing states, flyouts, pickers, guidance, and transient chrome.',
  ],
  ai: ['AI flow', 'The style picker and every meaningful generated-picture modal state.'],
  admin: ['Admin', 'Authenticated ledger views and responsive row actions.'],
};

const SEVERITY_LABELS = {
  pass: 'Pass',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const REPORT_CSS = `
.inventory-nav{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--paper) 92%,transparent);border-bottom:1px solid var(--hair);backdrop-filter:blur(12px)}
.inventory-nav .shell{display:flex;gap:8px;overflow:auto;padding-top:10px;padding-bottom:10px}
.inventory-nav a{flex:0 0 auto;padding:6px 11px;border:1px solid var(--hair);border-radius:999px;background:var(--card);color:var(--muted);font-size:.78rem;font-weight:700}
.inventory-nav a:hover{color:var(--accent-ink);text-decoration:none;border-color:var(--accent)}
.viewport-key{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}
.viewport-key article{padding:12px;border:1px solid var(--hair);border-radius:var(--r-sm);background:var(--card)}
.viewport-key strong,.viewport-key span{display:block}.viewport-key strong{font-size:.82rem}.viewport-key span{color:var(--muted);font-size:.73rem}
.severity-filter{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:32px;padding:12px;border:1px solid var(--hair);border-radius:var(--r-sm);background:var(--card)}
.severity-filter fieldset{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0;padding:0;border:0}.severity-filter legend{float:left;margin-right:4px;color:var(--ink);font-size:.78rem;font-weight:800;line-height:44px}.severity-filter label{--severity-color:var(--accent);position:relative;display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:7px 11px;border:1px solid var(--hair);border-radius:999px;background:var(--card-2);color:var(--muted);font-size:.76rem;font-weight:700;cursor:pointer}.severity-filter label::before{content:"";width:12px;height:12px;border:3px solid var(--severity-color);border-radius:3px}.severity-filter label.filter-all::before{border-color:var(--hair-strong)}.severity-filter input{position:absolute;opacity:0;pointer-events:none}.severity-filter label:has(input:checked){border-color:var(--severity-color);background:color-mix(in srgb,var(--severity-color) 12%,var(--card));color:var(--ink)}.severity-filter label:has(input:focus-visible){outline:2px solid var(--accent);outline-offset:2px}.severity-filter output{color:var(--muted);font-size:.76rem;font-weight:700}
.group{scroll-margin-top:72px;margin-top:46px}.group:first-of-type{margin-top:0}.group-head{margin-bottom:16px}.group-head h2{margin:0;font-size:1.35rem}.group-head p{margin:4px 0 0;color:var(--muted);max-width:72ch}
.surface-list{display:flex;flex-direction:column;gap:24px}.surface{scroll-margin-top:72px;background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);box-shadow:var(--shadow-sm);overflow:hidden}
.surface-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:16px 18px;border-bottom:1px solid var(--hair)}
.surface-head h3{margin:0;font-size:1.03rem}.surface-head p{margin:4px 0 0;color:var(--muted);font-size:.86rem;max-width:72ch}.surface-source{flex:0 0 auto;color:var(--faint);font:600 .72rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--card-2);border:1px solid var(--hair);border-radius:6px;padding:4px 7px}
.theme-captures+.theme-captures{border-top:1px solid var(--hair)}.theme-head{display:flex;align-items:baseline;gap:10px;padding:10px 18px;background:var(--card-2);border-bottom:1px solid var(--hair)}.theme-head h4{margin:0;font-size:.84rem}.theme-head p{margin:0;color:var(--faint);font-size:.72rem}.shots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--hair)}.shot{margin:0;padding:12px;background:var(--card-2);min-width:0}.shot a{display:block}.shot img{display:block;width:100%;height:auto;border:1px solid var(--hair-strong);border-radius:7px;background:var(--paper-2);box-shadow:var(--shadow-sm)}
.shot figcaption{margin-bottom:7px;line-height:1.25}.shot figcaption strong,.shot figcaption span{display:block}.shot figcaption strong{font-size:.76rem}.shot figcaption span{color:var(--faint);font-size:.68rem}
.shot.has-critique{--severity-color:var(--hair-strong)}.shot.has-critique img{border:3px solid var(--severity-color)}
.shot.severity-pass,.severity-filter .severity-pass{--severity-color:var(--c-green)}.shot.severity-low,.severity-filter .severity-low{--severity-color:var(--c-yellow)}.shot.severity-medium,.severity-filter .severity-medium{--severity-color:var(--c-orange)}.shot.severity-high,.severity-filter .severity-high{--severity-color:var(--c-red)}
.critique-note{margin-top:10px;padding:10px;border-radius:var(--r-sm);background:color-mix(in srgb,var(--severity-color) 10%,var(--card));color:var(--muted);font-size:.76rem;line-height:1.45}.critique-note p{margin:6px 0 0}.critique-note p:first-of-type{color:var(--ink)}.critique-note strong{color:var(--ink)}
.critique-severity{display:inline-flex;align-items:center;gap:6px;color:var(--ink);font-size:.68rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.critique-severity::before{content:"";width:9px;height:9px;border-radius:99px;background:var(--severity-color)}
[hidden]{display:none!important}@media(max-width:820px){.shots,.viewport-key{grid-template-columns:repeat(2,minmax(0,1fr))}.surface-head{flex-direction:column}.surface-source{flex:none}}@media(max-width:600px){.severity-filter{align-items:flex-start}.severity-filter fieldset{width:100%}.severity-filter legend{width:100%;line-height:1.4}.severity-filter label{flex:1 1 auto;justify-content:center}}@media(max-width:480px){.shots,.viewport-key{grid-template-columns:1fr}.shot{padding:10px}}
`;

const FILTER_SCRIPT = `<script>
const severityFilter=document.querySelector('[data-severity-filter]');
if(severityFilter){
  const shots=[...document.querySelectorAll('.shot[data-severity]')];
  const surfaces=[...document.querySelectorAll('.surface')];
  const groups=[...document.querySelectorAll('.group')];
  const status=severityFilter.querySelector('output');
  severityFilter.addEventListener('change',(event)=>{
    const severity=event.target.value;
    let visibleCount=0;
    for(const shot of shots){
      shot.hidden=severity!=='all'&&shot.dataset.severity!==severity;
      if(!shot.hidden)visibleCount+=1;
    }
    for(const surface of surfaces)surface.hidden=!surface.querySelector('.shot:not([hidden])');
    for(const group of groups)group.hidden=!group.querySelector('.surface:not([hidden])');
    status.value='Showing '+visibleCount+' of '+shots.length+' snapshots';
  });
}
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

function critiqueNote(entry) {
  if (!entry) return '';
  const recommendation = entry.recommendation?.trim()
    ? `<p><strong>Recommendation:</strong> ${esc(entry.recommendation)}</p>`
    : '';
  return `<div class="critique-note"><span class="critique-severity">${esc(SEVERITY_LABELS[entry.severity])}</span><p>${esc(entry.critique)}</p>${recommendation}</div>`;
}

function severityFilter(critique, snapshotCount) {
  if (!critique.size) return '';
  const options = PAGE_INVENTORY_SEVERITIES.map(
    (severity) =>
      `<label class="severity-${severity}"><input type="radio" name="severity" value="${severity}"/>${esc(SEVERITY_LABELS[severity])}</label>`
  ).join('');
  return `<form class="severity-filter" data-severity-filter><fieldset><legend>Filter by severity</legend><label class="filter-all"><input type="radio" name="severity" value="all" checked/>All</label>${options}</fieldset><output aria-live="polite">Showing ${snapshotCount} of ${snapshotCount} snapshots</output></form>`;
}

export function renderPageInventoryReport(items, critique = new Map()) {
  const severityCounts = Object.fromEntries(
    PAGE_INVENTORY_SEVERITIES.map((severity) => [severity, 0])
  );
  for (const entry of critique.values()) severityCounts[entry.severity] += 1;
  const critiqueStats = critique.size
    ? PAGE_INVENTORY_SEVERITIES.map(
        (severity) =>
          `<span class="chip"><b>${severityCounts[severity]}</b> ${esc(SEVERITY_LABELS[severity].toLowerCase())}</span>`
      ).join('')
    : '';
  const snapshotCount =
    items.length * PAGE_INVENTORY_VIEWPORTS.length * PAGE_INVENTORY_THEMES.length;
  const stats = `<span class="chip accent"><b>${items.length}</b> surfaces</span><span class="chip"><b>${snapshotCount}</b> snapshots</span><span class="chip"><b>${PAGE_INVENTORY_VIEWPORTS.length}</b> logical viewports</span><span class="chip"><b>${PAGE_INVENTORY_THEMES.length}</b> themes</span>${critiqueStats}`;
  const nav = Object.entries(PAGE_INVENTORY_GROUPS)
    .map(([id, [title]]) => `<a href="#${id}">${esc(title)}</a>`)
    .join('');
  const key = PAGE_INVENTORY_VIEWPORTS.map((view) => {
    const orientation = `${view.orientation[0].toUpperCase()}${view.orientation.slice(1)}`;
    return `<article><strong>${esc(view.category)}</strong><span>${esc(view.device)}</span><span>${orientation} · ${view.width} × ${view.height} pt</span></article>`;
  }).join('');
  const groups = Object.entries(PAGE_INVENTORY_GROUPS)
    .map(([groupId, [title, description]]) => {
      const cards = items
        .filter((item) => item.group === groupId)
        .map((item) => {
          const themeCaptures = PAGE_INVENTORY_THEMES.map((theme) => {
            const shots = PAGE_INVENTORY_VIEWPORTS.map((view) => {
              const path = item.captures[inventoryCaptureKey(view, theme)];
              const feedback = critique.get(captureReviewId(item, view, theme));
              const severityClass = feedback ? ` has-critique severity-${feedback.severity}` : '';
              const severityData = critique.size
                ? ` data-severity="${feedback?.severity ?? 'unreviewed'}"`
                : '';
              const orientation = `${view.orientation[0].toUpperCase()}${view.orientation.slice(1)}`;
              return `<figure class="shot${severityClass}"${severityData}><figcaption><strong>${esc(view.category)} · ${orientation}</strong><span>${view.width} × ${view.height}</span></figcaption><a href="${esc(path)}"><img src="${esc(path)}" width="${view.width}" height="${view.height}" loading="lazy" alt="${esc(`${item.title} in ${theme.label.toLowerCase()} at ${view.device} in ${view.orientation}`)}"/></a>${critiqueNote(feedback)}</figure>`;
            }).join('');
            return `<section class="theme-captures"><header class="theme-head"><h4>${esc(theme.label)}</h4><p>${esc(theme.reviewFocus)}</p></header><div class="shots">${shots}</div></section>`;
          }).join('');
          return `<article class="surface" id="${esc(item.id)}"><header class="surface-head"><div><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></div><span class="surface-source">${esc(item.source)}</span></header>${themeCaptures}</article>`;
        })
        .join('');
      return `<section class="group" id="${groupId}"><header class="group-head"><h2>${esc(title)}</h2><p>${esc(description)}</p></header><div class="surface-list">${cards}</div></section>`;
    })
    .join('');
  const body = `${masthead({
    title: 'App page inventory',
    tagline:
      'A static, source-discovered inventory of every route, every Settings section, every modal, and the app’s most useful transient views. Every surface is captured in light and night mode across four Apple devices in portrait and landscape.',
    home: '../index.html',
    crumbs: [{ label: 'App page inventory' }],
    stats,
  })}<nav class="inventory-nav" aria-label="Inventory groups"><div class="shell">${nav}</div></nav><main><div class="shell"><div class="viewport-key">${key}</div>${severityFilter(critique, snapshotCount)}${groups}</div></main>${siteFooter({ home: '../index.html' })}${critique.size ? FILTER_SCRIPT : ''}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>App page inventory — Splotch scrapbook</title>${chromeStyle(REPORT_CSS)}</head><body>${body}</body></html>\n`.replace(
    /[ \t]+$/gm,
    ''
  );
}
