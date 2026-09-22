import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { format } from 'prettier';
import sharp from 'sharp';
import { optimize } from 'svgo';

const repo = resolve(import.meta.dirname, '../../..');
const output = import.meta.dirname;
const candidatesDir = join(output, 'candidates');
const variantsDir = join(output, 'variants');
const temp = '/tmp/splotch-icon-refresh';
const materialDir = join(temp, 'material-package/package/rounded');
const iconDir = join(repo, 'web/src/lib/icons');

const svgoConfig = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: { overrides: { cleanupIds: { preservePrefixes: ['icon-'] } } },
    },
  ],
};

const materialCandidates = {
  'release-new-new-releases': 'new_releases',
  'release-new-auto-awesome': 'auto_awesome',
  'release-improved-trending-up': 'trending_up',
  'release-improved-upgrade': 'upgrade',
  'release-fixed-build': 'build',
  'release-fixed-healing': 'healing',
  'camera-party-archive': 'archive',
  'camera-party-save': 'save',
  'camera-party-history': 'history',
  'photo-size-select-small-touch-app': 'touch_app',
  'photo-size-select-small-fit-screen': 'fit_screen',
  refresh: 'refresh',
  'button-style-row-smart-button': 'smart_button',
  'feedback-bug-report': 'bug_report',
  'feedback-lightbulb': 'lightbulb',
  'policy-auto-fix-high': 'auto_fix_high',
  'policy-flag': 'flag',
  'policy-open-in-new': 'open_in_new',
  'policy-mail': 'mail',
  'policy-supervisor-account': 'supervisor_account',
};

const spotCandidates = {
  accessibility: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
    <rect x="650" y="235" width="255" height="430" rx="127.5" fill="#ef407d"/>
    <ellipse cx="777.5" cy="450" rx="84" ry="132" fill="#f5e9d1"/>
    <path fill="#f5b825" d="M90 645c0-48 39-87 87-87h197l214-146c38-26 90-16 116 22 25 38 15 90-23 116L448 709c-14 10-31 15-49 15H177c-48 0-87-31-87-79Z"/>
    <rect x="174" y="458" width="108" height="268" rx="54" fill="#f5a623"/>
    <rect x="270" y="429" width="108" height="297" rx="54" fill="#f5b825"/>
    <path fill="#3f68a8" d="M88 650h383v184c0 39-32 71-71 71H159c-39 0-71-32-71-71Z"/>
    <path fill="#212d4c" d="M88 792h383v42c0 39-32 71-71 71H159c-39 0-71-32-71-71Z"/>
  </svg>`,
  'swipe-down': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
    <rect x="273" y="93" width="454" height="172" rx="86" fill="#3f68a8"/>
    <path fill="#f5b825" d="M232 238h536c48 0 86 39 86 86v179c0 45-36 81-81 81h-76v111c0 55-44 99-99 99s-99-44-99-99V533h-75v51c0 47-38 85-85 85s-85-38-85-85v-28c-49-9-86-52-86-104V324c0-47 29-86 64-86Z"/>
    <path fill="#f5a623" d="M255 452h86v132c0 23-19 42-42 42s-44-19-44-42Zm169 81h75v68c0 21-17 38-38 38s-37-17-37-38Z"/>
    <path fill="#212d4c" d="M449 762h102v79h94c30 0 45 36 24 57L530 955c-17 17-44 17-61 0L330 898c-21-21-6-57 24-57h95Z"/>
  </svg>`,
  undo: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
    <path fill="#4a1a9e" d="M421 174c182-19 354 33 451 153 102 127 118 304 39 447-80 144-236 230-399 220-87-5-169-38-236-93-43-36-49-100-13-143s100-49 143-13c36 30 79 48 126 51 85 5 167-40 208-114 41-73 32-166-20-231-53-66-150-95-256-78l2 89c1 32-35 52-61 33L139 310c-29-21-31-64-4-87L386 15c25-21 63-3 63 29Z"/>
    <path fill="none" stroke="#f5b825" stroke-linecap="round" stroke-width="82" d="M407 829c62 39 143 45 211 13 74-35 124-108 132-190"/>
  </svg>`,
};

const derivedCandidates = {
  'dashboard-customize': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" fill="#1f1f1f">
    <path d="M96 298h808a41.5 41.5 0 0 1 0 83H96a41.5 41.5 0 0 1 0-83Zm0 321h808a41.5 41.5 0 0 1 0 83H96a41.5 41.5 0 0 1 0-83Z"/>
    <circle cx="327.21" cy="339.63" r="92"/><circle cx="668.3" cy="660.48" r="92"/>
  </svg>`,
  'button-style-raised': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" fill="#1f1f1f">
    <rect x="205" y="205" width="680" height="680" rx="130"/><rect x="115" y="115" width="680" height="680" rx="130"/>
  </svg>`,
  'button-style-flat': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" fill="#1f1f1f">
    <path fill-rule="evenodd" d="M291.5 130h417C797.7 130 870 202.3 870 291.5v417C870 797.7 797.7 870 708.5 870h-417C202.3 870 130 797.7 130 708.5v-417C130 202.3 202.3 130 291.5 130Zm0 83c-43.4 0-78.5 35.1-78.5 78.5v417c0 43.4 35.1 78.5 78.5 78.5h417c43.4 0 78.5-35.1 78.5-78.5v-417c0-43.4-35.1-78.5-78.5-78.5Z"/>
  </svg>`,
};

const sections = [
  {
    id: 'spot',
    title: 'Bucket 1 · spot illustrations',
    groups: [
      {
        title: 'Accessibility section',
        current: 'accessibility',
        neighbors: ['appearance', 'sound', 'controls'],
        candidates: ['accessibility'],
        spot: true,
      },
      {
        title: 'Clear coachmark swipe hand',
        current: 'swipe-down',
        neighbors: ['trash-open', 'camera', 'undo'],
        candidates: ['swipe-down'],
        spot: true,
      },
      {
        title: 'Undo (optional)',
        current: 'undo',
        neighbors: ['camera', 'trash-open', 'appearance'],
        candidates: ['undo'],
        spot: true,
      },
    ],
  },
  {
    id: 'releases',
    title: 'Bucket 2 · release-note replacements',
    groups: [
      {
        title: 'Release · new',
        current: 'release-new',
        neighbors: ['release-improved', 'release-fixed', 'check'],
        candidates: ['release-new-new-releases', 'release-new-auto-awesome'],
      },
      {
        title: 'Release · improved',
        current: 'release-improved',
        neighbors: ['release-new', 'release-fixed', 'check'],
        candidates: ['release-improved-trending-up', 'release-improved-upgrade'],
      },
      {
        title: 'Release · fixed',
        current: 'release-fixed',
        neighbors: ['release-new', 'release-improved', 'check'],
        candidates: ['release-fixed-build', 'release-fixed-healing'],
      },
    ],
  },
  {
    id: 'settings-options',
    title: 'Bucket 2 · settings rows and chrome',
    groups: [
      {
        title: 'Auto-Save on Delete',
        current: 'camera-party',
        neighbors: ['settings', 'check', 'chevron-right'],
        candidates: ['camera-party-archive', 'camera-party-save', 'camera-party-history'],
      },
      {
        title: 'Button size',
        current: 'photo-size-select-small',
        neighbors: ['settings', 'check', 'chevron-right'],
        candidates: ['photo-size-select-small-touch-app', 'photo-size-select-small-fit-screen'],
      },
      {
        title: 'AI · Try again',
        current: 'refresh',
        neighbors: ['close', 'check', 'chevron-right'],
        candidates: ['refresh'],
      },
      {
        title: 'Button style row label',
        current: null,
        neighbors: ['settings', 'check', 'chevron-right'],
        candidates: ['button-style-row-smart-button'],
      },
    ],
  },
  {
    id: 'feedback-policy',
    title: 'Bucket 2 · feedback and Parent Center',
    groups: [
      {
        title: 'Feedback picker segments',
        current: null,
        neighbors: ['flag', 'settings', 'check'],
        candidates: ['feedback-bug-report', 'feedback-lightbulb'],
      },
      {
        title: 'Parent Center policy rows',
        current: null,
        neighbors: ['flag', 'settings', 'chevron-right'],
        candidates: [
          'policy-auto-fix-high',
          'policy-flag',
          'policy-open-in-new',
          'policy-mail',
          'policy-supervisor-account',
        ],
      },
    ],
  },
  {
    id: 'derived',
    title: 'Bucket 3 · derived mono glyphs',
    groups: [
      {
        title: 'Enable tool drawer',
        current: 'dashboard-customize',
        neighbors: ['controls', 'settings', 'chevron-right'],
        candidates: ['dashboard-customize'],
      },
      {
        title: 'Button-style picker',
        current: 'button-style-raised',
        neighbors: ['button-style-flat', 'settings', 'check'],
        candidates: ['button-style-raised', 'button-style-flat'],
        segmented: true,
      },
    ],
  },
];

async function iconPath(name) {
  const paths = [join(iconDir, `${name}.svg`), join(iconDir, 'deferred', `${name}.svg`)];
  for (const path of paths) {
    try {
      await readFile(path);
      return path;
    } catch {}
  }
  throw new Error(`Missing current icon: ${name}`);
}

function optimizeSvg(svg, name) {
  return optimize(svg, { ...svgoConfig, path: `${name}.svg` }).data;
}

async function writeCandidate(name, svg) {
  await writeFile(join(candidatesDir, `${name}.svg`), `${optimizeSvg(svg, name)}\n`);
}

async function buildMaterialCandidates() {
  for (const [name, source] of Object.entries(materialCandidates)) {
    const raw = await readFile(join(materialDir, `${source}-fill.svg`), 'utf8');
    const inner = raw.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/)?.[1];
    if (!inner) throw new Error(`Could not read Material source ${source}`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" fill="#1f1f1f"><g transform="translate(0 1000) scale(1.0416666667)">${inner}</g></svg>`;
    await writeCandidate(name, svg);
  }
}

async function buildVariantGrid(subject) {
  const width = 1440;
  const height = 960;
  const cell = 480;
  const composites = [];
  for (let index = 0; index < 6; index++) {
    const label = `${subject.replace('-', ' ')} · ${index + 1}`;
    const image = await sharp(
      join(temp, 'generated', `${subject}-${String(index + 1).padStart(2, '0')}.png`)
    )
      .flatten({ background: '#ffffff' })
      .resize(400, 400, { fit: 'contain', background: '#ffffff' })
      .png()
      .toBuffer();
    const x = (index % 3) * cell + 40;
    const y = Math.floor(index / 3) * cell + 24;
    composites.push({ input: image, left: x, top: y });
    composites.push({
      input: Buffer.from(
        `<svg width="400" height="42"><rect width="400" height="42" rx="12" fill="#f8f8f8"/><text x="200" y="27" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#212d4c">${label}</text></svg>`
      ),
      left: x,
      top: y + 406,
    });
  }
  await sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite(composites)
    .webp({ quality: 82 })
    .toFile(join(variantsDir, `${subject}-grid.webp`));
}

function stripSvgSize(svg) {
  return svg.replace(
    /<svg\b([^>]*)>/,
    (tag, attributes) => `<svg${attributes.replace(/\s(?:width|height)="[^"]*"/g, '')}>`
  );
}

async function inlineIcon(name, candidate = false) {
  const path = candidate ? join(candidatesDir, `${name}.svg`) : await iconPath(name);
  return stripSvgSize(await readFile(path, 'utf8'));
}

function contextCell(svg, theme, surface, size, label, mono) {
  const classNames = ['context', theme, surface, mono ? 'mono' : 'spot'].join(' ');
  return `<div class="${classNames}"><div class="icon" style="--size:${size}px">${svg}</div><span>${label}</span></div>`;
}

function contextMatrix(svg, mono, segmented) {
  const cells = [];
  for (const theme of ['light', 'dark']) {
    cells.push(contextCell(svg, theme, 'surface', 34, `${theme} · surface · 34`, mono));
    cells.push(contextCell(svg, theme, 'surface-2', 34, `${theme} · surface-2 · 34`, mono));
    cells.push(contextCell(svg, theme, 'brand', 34, `${theme} · brand · 34`, mono));
    cells.push(contextCell(svg, theme, 'surface-2', 24, `${theme} · row · 24`, mono));
    cells.push(contextCell(svg, theme, 'surface-2', 28, `${theme} · row · 28`, mono));
    if (segmented)
      cells.push(contextCell(svg, theme, 'segment', 20, `${theme} · segment · 20`, mono));
  }
  return `<div class="contexts">${cells.join('')}</div>`;
}

async function buildGroup(group) {
  const current = group.current
    ? `<div class="comparison-item current"><span>Current · ${group.current}</span><div class="comparison-icon ${group.spot ? 'spot' : 'mono'}">${await inlineIcon(group.current)}</div></div>`
    : `<div class="comparison-item empty"><span>Current</span><div class="empty-slot">new slot</div></div>`;
  const neighbors = await Promise.all(
    group.neighbors.map(
      async (name) =>
        `<div class="comparison-item"><span>Neighbour · ${name}</span><div class="comparison-icon">${await inlineIcon(name)}</div></div>`
    )
  );
  const candidates = await Promise.all(
    group.candidates.map(async (name) => {
      const svg = await inlineIcon(name, true);
      return `<article class="candidate"><h3>${name}</h3>${contextMatrix(svg, !group.spot, group.segmented)}</article>`;
    })
  );
  return `<section class="group"><h2>${group.title}</h2><div class="comparison-strip">${current}${neighbors.join('')}</div>${candidates.join('')}</section>`;
}

async function buildContactSheet() {
  const sectionHtml = [];
  for (const section of sections) {
    const groups = await Promise.all(section.groups.map(buildGroup));
    sectionHtml.push(
      `<main class="sheet" id="${section.id}"><header><p>Splotch icon refresh · review candidates</p><h1>${section.title}</h1></header>${groups.join('')}</main>`
    );
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Splotch icon refresh candidates</title><style>
  *{box-sizing:border-box}body{margin:0;background:#e9e8ef;color:#212d4c;font-family:ui-rounded,"SF Pro Rounded",system-ui,sans-serif}.sheet{width:1440px;margin:32px auto;padding:48px;background:#fff;border-radius:28px;box-shadow:0 18px 60px rgb(33 45 76 / 16%)}header{margin-bottom:38px;border-bottom:4px solid #7c50bb;padding-bottom:22px}header p{margin:0 0 8px;color:#7c50bb;font-size:18px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}h1{margin:0;font-size:38px}h2{margin:0 0 16px;font-size:26px}.group{padding:26px 0;border-bottom:1px solid #dedce8}.group:last-child{border-bottom:0}.comparison-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}.comparison-item{height:108px;display:flex;align-items:center;gap:14px;padding:14px;border-radius:16px;background:#f8f8f8}.comparison-item.current{background:#f1eafb}.comparison-item span{max-width:180px;font-size:13px;font-weight:700}.comparison-icon{width:52px;height:52px;flex:0 0 52px}.comparison-icon svg{width:100%;height:100%}.comparison-icon.mono svg{fill:#212d4c}.empty-slot{width:56px;height:56px;display:grid;place-items:center;border:2px dashed #aaa5b8;border-radius:14px;color:#777285;font-size:12px}.candidate{margin:18px 0 0}.candidate h3{margin:0 0 10px;font-size:18px}.contexts{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}.context{height:116px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;border:1px solid rgb(33 45 76 / 10%);border-radius:14px}.context span{font-size:11px;font-weight:700}.context .icon{width:var(--size);height:var(--size)}.context svg{display:block;width:100%;height:100%}.context.mono svg{fill:var(--ink)!important;stroke:var(--ink)!important}.context.light{--ink:#212d4c;color:#212d4c}.context.dark{--ink:#dedce8;color:#dedce8}.context.light.surface{background:#fff}.context.light.surface-2,.context.light.segment{background:#f8f8f8}.context.light.brand{background:#7c50bb;--ink:#fff;color:#fff}.context.dark.surface{background:#23232b}.context.dark.surface-2,.context.dark.segment{background:#2d2d37}.context.dark.brand{background:#8058c0;--ink:#fff;color:#fff}.context.segment{border-radius:999px;box-shadow:inset 0 0 0 8px rgb(124 80 187 / 12%)}
  </style></head><body>${sectionHtml.join('')}</body></html>`;
  await writeFile(
    join(output, 'contact-sheet.html'),
    await format(html, { parser: 'html', printWidth: 100, singleQuote: true })
  );
}

await mkdir(candidatesDir, { recursive: true });
await mkdir(variantsDir, { recursive: true });
await Promise.all(Object.entries(spotCandidates).map(([name, svg]) => writeCandidate(name, svg)));
await Promise.all(
  Object.entries(derivedCandidates).map(([name, svg]) => writeCandidate(name, svg))
);
await buildMaterialCandidates();
await Promise.all(['accessibility', 'swipe-down', 'undo'].map(buildVariantGrid));
await buildContactSheet();

console.log(
  `Built ${Object.keys(spotCandidates).length + Object.keys(derivedCandidates).length + Object.keys(materialCandidates).length} candidates in ${candidatesDir}`
);
