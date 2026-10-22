// The counting rules behind docs/CODE-MAP.md. Every tracked path resolves to
// exactly one exclusion class or exactly one measured area; within a measured
// area it resolves to one sub-bucket, and within src to one functional
// domain. See tools/code-map/README.md for how these tables are maintained.

const BINARY_EXTENSIONS = new Set([
  'gif',
  'gz',
  'ico',
  'jar',
  'jpeg',
  'jpg',
  'mp3',
  'png',
  'wav',
  'webp',
  'woff',
  'woff2',
  'zip',
]);
const PAYLOAD_EXTENSIONS = new Set(['diff', 'enc', 'patch', 'sha256']);
const MEASUREMENT_EXTENSIONS = new Set(['csv', 'json', 'jsonl', 'out', 'tsv']);

// Trees whose data files are captured run output rather than authored source.
// Their scripts and Markdown stay measured. Data under any `fixtures/`
// directory is treated the same way: recorded device captures and goldens.
const EVIDENCE_ROOTS = [
  'docs/investigations/',
  'docs/migration/evidence/',
  'docs/scratchpad/',
  'perf-profiles/',
  'scrapbook/',
  'tools/asset-gen/',
  'tools/centerline-tracing/benchmark/',
];
const REPORT_HTML_ROOTS = ['scrapbook/', 'tools/asset-gen/'];
// Coloring outlines, traced corpora, and vectorizer output: drawings stored as
// SVG, not source. Hand-authored icons under src stay measured.
const VECTOR_ART_ROOTS = [
  'tools/centerline-tracing/',
  'tools/model-eval/samples/',
  'tools/vectorize/pilot/',
  'assets/static/coloring/',
];

export const CODE_MAP_PATH = 'docs/CODE-MAP.md';
export const WEB_SRC_PREFIX = 'src/';

// Ruler writes a CLAUDE.md and AGENTS.md beside every `.ruler/AGENTS.md` source;
// the source itself is measured.
const GENERATED_INSTRUCTION_FILE = /(^|\/)(?<!\.ruler\/)(CLAUDE|AGENTS)\.md$/;

const extensionOf = (path) => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};
const basenameOf = (path) => path.slice(path.lastIndexOf('/') + 1);
const under = (path, roots) => roots.some((root) => path.startsWith(root));

// Ordered so the first class that applies names the reason a file is left out.
export const EXCLUSION_CLASSES = [
  {
    label: 'Generated / provider agent delivery trees',
    matches: (path) =>
      GENERATED_INSTRUCTION_FILE.test(path) ||
      /^\.claude\/(skills|skill-notes)\//.test(path) ||
      path.startsWith('.agents/'),
  },
  { label: 'Binary media / archives', matches: (path) => BINARY_EXTENSIONS.has(extensionOf(path)) },
  {
    label: 'Vector art assets / traced samples',
    matches: (path) => extensionOf(path) === 'svg' && under(path, VECTOR_ART_ROOTS),
  },
  { label: 'Dependency lockfile', matches: (path) => path === 'pnpm-lock.yaml' },
  {
    label: 'Repository metadata outside LOC scope',
    matches: (path) => path === 'LICENSE' || path === '.git-blame-ignore-revs',
  },
  {
    label: 'Code map output',
    matches: (path) => path === CODE_MAP_PATH,
  },
  { label: 'Publishing marker', matches: (path) => path === 'scrapbook/.nojekyll' },
  {
    label: 'Archived payloads / hashes',
    matches: (path) =>
      PAYLOAD_EXTENSIONS.has(extensionOf(path)) || basenameOf(path) === 'SHA256SUMS',
  },
  {
    label: 'Generated measurement data',
    matches: (path) =>
      MEASUREMENT_EXTENSIONS.has(extensionOf(path)) &&
      (under(path, EVIDENCE_ROOTS) || path.includes('/fixtures/')) &&
      basenameOf(path) !== 'package.json',
  },
  {
    label: 'Generated report / proof-sheet HTML',
    matches: (path) => extensionOf(path) === 'html' && under(path, REPORT_HTML_ROOTS),
  },
  {
    label: 'Generated audit / ranking text and captured logs',
    matches: (path) => extensionOf(path) === 'txt' && under(path, EVIDENCE_ROOTS),
  },
];

const firstSegmentAfter = (path, prefix) => {
  const rest = path.slice(prefix.length);
  const slash = rest.indexOf('/');
  return slash === -1 ? null : rest.slice(0, slash);
};

// A nested `.ruler/` source counts in the area it describes, under its own sub-bucket.
const subtreeBucket =
  (prefix, labels = {}) =>
  (path) => {
    const segment = firstSegmentAfter(path, prefix);
    if (segment === null) return labels['(root)'] ?? '(root)';
    if (segment === '.ruler') return 'instruction source';
    return labels[segment] ?? segment;
  };
// Areas that span several roots split by the root first.
const rootBucket = (path) => (path.includes('/') ? path.slice(0, path.indexOf('/')) : '(root)');

const NATIVE_ROOTS = ['android/', 'ios/', 'fastlane/', '.maestro/', 'perf/'];

// Areas are disjoint by construction; `areasFor` returns every match so the
// coverage test can prove it rather than trust rule order.
export const AREAS = [
  {
    label: '**src** — the app',
    key: 'src',
    matches: (path) => path.startsWith('src/'),
    bucket: (path) => webSrcDomainRuleOf(path.slice(WEB_SRC_PREFIX.length)).domain,
  },
  {
    label: '**tools (excluding asset-gen)** — repo automation',
    key: 'tools excluding asset-gen',
    matches: (path) => path.startsWith('tools/') && !path.startsWith('tools/asset-gen/'),
    bucket: subtreeBucket('tools/'),
  },
  {
    label: '**tools/asset-gen** — art pipeline',
    key: 'tools/asset-gen',
    matches: (path) => path.startsWith('tools/asset-gen/'),
    bucket: subtreeBucket('tools/asset-gen/', {
      'ideas-exploration': 'ideas-exploration (R&D scratch)',
      lib: 'lib (pipeline core)',
      coloring: 'coloring (pipeline CLIs)',
      docs: 'docs (pipeline records)',
    }),
  },
  {
    label: '**docs** — ADRs & guides',
    key: 'docs',
    matches: (path) => path.startsWith('docs/'),
    bucket: subtreeBucket('docs/', { '(root)': '(root docs)' }),
  },
  {
    label: '**e2e** — RN web export E2E',
    key: 'e2e',
    matches: (path) => path.startsWith('e2e/'),
    bucket: subtreeBucket('e2e/', { '(root)': '(root) config / fixtures' }),
  },
  {
    label: '**.ruler** — agent-instruction sources',
    key: '.ruler',
    matches: (path) => path.startsWith('.ruler/'),
    bucket: subtreeBucket('.ruler/', {
      '(root)': 'root instruction / config',
      skills: 'skill sources',
      'skill-forks': 'skill fork sources',
      'skill-notes': 'skill notes',
    }),
  },
  {
    label: 'perf-profiles — committed profiling evidence',
    key: 'perf-profiles',
    matches: (path) => path.startsWith('perf-profiles/'),
    bucket: subtreeBucket('perf-profiles/'),
  },
  {
    label: 'android + ios + fastlane + Maestro + replay traces — native projects',
    key: 'native shells',
    matches: (path) => under(path, NATIVE_ROOTS),
    bucket: rootBucket,
  },
  {
    label: '.github — CI and issue config',
    key: '.github',
    matches: (path) => path.startsWith('.github/'),
    bucket: subtreeBucket('.github/'),
  },
  {
    label: 'root config / README / shared assets',
    key: 'root',
    matches: (path) =>
      !path.includes('/') || path.startsWith('assets/') || path.startsWith('.vscode/'),
    bucket: rootBucket,
  },
  {
    label: 'scrapbook — run-artifact prose',
    key: 'scrapbook',
    matches: (path) => path.startsWith('scrapbook/'),
    bucket: subtreeBucket('scrapbook/'),
  },
  {
    label: '.claude / .codex — agent runtime config',
    key: 'agent runtime',
    matches: (path) => path.startsWith('.claude/') || path.startsWith('.codex/'),
    bucket: rootBucket,
  },
  {
    label: 'store-assets — listing text',
    key: 'store-assets',
    matches: (path) => path.startsWith('store-assets/'),
    bucket: subtreeBucket('store-assets/'),
  },
  {
    label: 'releases — release notes',
    key: 'releases',
    matches: (path) => path.startsWith('releases/'),
    bucket: subtreeBucket('releases/'),
  },
  {
    label: 'netlify — API, workers and server modules',
    key: 'netlify',
    matches: (path) => path.startsWith('netlify/'),
    bucket: subtreeBucket('netlify/'),
  },
];

export function areasFor(path) {
  return AREAS.filter((area) => area.matches(path));
}

export class UnmappedPathError extends Error {}

// Throws rather than inventing a bucket: a path no area claims is a new part of
// the repository the rules have to be taught about.
export function classifyPath(path) {
  const exclusion = EXCLUSION_CLASSES.find((candidate) => candidate.matches(path));
  if (exclusion) return { kind: 'excluded', exclusion: exclusion.label };
  const areas = areasFor(path);
  if (areas.length !== 1) {
    const found = areas.map((area) => area.key).join(', ') || 'none';
    throw new UnmappedPathError(`${path} matches ${areas.length} areas (${found})`);
  }
  const [area] = areas;
  return { kind: 'measured', area: area.key, bucket: area.bucket(path) };
}

// A co-located test and a test harness follow the module they exercise:
// `lib/storage.restore.integration.test.ts` classifies as `lib/storage`. Route
// files and the files at the src root keep their full names, where the stem
// alone would be ambiguous (`app.css` versus `app.html`).
export function subjectOf(webSrcPath) {
  const slash = webSrcPath.lastIndexOf('/');
  const dir = webSrcPath.slice(0, slash + 1);
  const name = webSrcPath.slice(slash + 1);
  if (name.startsWith('+') || dir === '') return webSrcPath;
  const stem = name.split('.')[0].replace(/TestHarness$/, '');
  return `${dir}${stem}`;
}

const D = {
  drawing: 'Drawing / canvas engine',
  ai: 'AI image generation',
  design: 'Design system, styleguide + icons',
  settings: 'Settings / parent center',
  shell: 'App shell / information pages',
  controls: 'Core UI controls',
  gestures: 'Gestures',
  admin: 'Web admin console',
  coloring: 'Coloring books + offline library',
  pwa: 'PWA / installation',
  platform: 'Platform / device integration',
  color: 'Color palette & picker',
  storage: 'Storage / picture export',
  utilities: 'Focused utilities / generated app data',
  feedback: 'Feedback / reporting',
  audio: 'Audio',
};

// Specific feature owners precede the component and shared-utility fallbacks.
export const WEB_SRC_DOMAIN_RULES = [
  [D.ai, /^ai\//],
  [D.ai, /^lib\/ai\//],
  [D.ai, /^lib\/(freeGenerations|imageReport|usageRecord)$/],
  [D.ai, /^lib\/components\/aiDialGeometry$/],
  [D.ai, /^rsdDrawing\/(RsdAi\w+|ai\w+|polaroid\w+)$/],

  [D.drawing, /^(drawing|clear)\//],
  [D.drawing, /^lib\/drawing\//],
  [
    D.drawing,
    /^rsdDrawing\/(NativePaper|RsdPaperSlot|Departing\w+|paintedTile|RsdClear\w+|clearSurfaces|RsdUndoTile|undo\w+|useMeasuredPaperArea)$/,
  ],
  [D.drawing, /^(useUndoAction|useRendererRecovery|drawingScan|drawingMessages)\.ts$/],

  [D.admin, /^pageDocument\/admin\//],
  [D.admin, /^lib\/(adminFormat|inviteLink)$/],
  [D.feedback, /^feedback\//],
  [D.feedback, /^lib\/(report|reportReply|errorLog)$/],

  [D.settings, /^(settings|parentCenter)\//],
  [D.settings, /^lib\/components\/settings\//],
  [
    D.settings,
    /^rsdDrawing\/(RsdSettings\w+|RsdParent\w+|RsdSavingSection|RsdOrientationPicker|soundSettingsActions)$/,
  ],

  [D.coloring, /^offlineLibrary\//],
  [D.coloring, /^lib\/(coloringPacks|state)\//],
  [D.coloring, /^rsdDrawing\/(RsdColoring\w+|coloringGrid)$/],
  [D.pwa, /^install\//],
  [D.pwa, /^lib\/pwa\//],
  [D.pwa, /^lib\/installPromptCopy$/],
  [D.pwa, /^rsdDrawing\/(RsdInstall\w+|installBanner\w+)$/],

  [D.color, /^lib\/(colorRing|palette|hexPickerLayout)$/],
  [D.color, /^rsdDrawing\/(RsdColor\w+|colorMenuLayout|hexPicker|RsdSwatch\w+|swatch\w+)$/],
  [D.design, /^lib\/design\//],
  [D.design, /^pageDocument\/design\//],
  [D.design, /^rsdDrawing\/(RsdIcon|RsdSectionIcon|icons)$/],
  [D.design, /^strict\.css$/],
  [D.gestures, /^lib\/actions\//],
  [D.audio, /^audio\//],
  [D.audio, /^lib\/audio\//],
  [D.audio, /^useDrawingSound\.ts$/],
  [D.platform, /^platform\//],
  [D.platform, /^lib\/platform\//],
  [D.platform, /^rsdDrawing\/(NativeFrame|RsdNotchBand|notchBandSurface)$/],

  [D.storage, /^export\//],
  [D.storage, /^lib\/(idbDatabase|storageKeys|saveNaming|installationId)$/],
  [D.storage, /^(keepPicture|useSavePicture|lazyExport)\.ts$/],
  [D.shell, /^(information|pageDocument|product)\//],
  [D.shell, /^lib\/boot\//],
  [D.shell, /^lib\/components\/(page|beta)\//],
  [
    D.shell,
    /^rsdDrawing\/(RsdPage\w+|RsdInformation\w+|RsdNotFoundPage|notFound\w+|RsdReleaseArticle|RsdWhatsNewSection|useInformation\w+|useReleaseHistory|page\w+)$/,
  ],

  [D.controls, /^rsdDrawing\//],
  [D.controls, /^lib\/components\//],
  [D.utilities, /^lib\//],
  [D.shell, /^/],
];

export function webSrcDomainRuleOf(srcPath) {
  const subject = subjectOf(srcPath);
  const ruleIndex = WEB_SRC_DOMAIN_RULES.findIndex(([, pattern]) => pattern.test(subject));
  return { domain: WEB_SRC_DOMAIN_RULES[ruleIndex][0], ruleIndex };
}

const DRAWING_SUBDOMAIN_RULES = [
  ['Bundled coloring assets & paper layout', /^(drawing\/bundledFarm|lib\/drawing\/paper)/],
  ['Shared drawing geometry & retained primitives', /^lib\/drawing\//],
  ['Clear gesture & animation', /^clear\//],
  ['Native / web rendering, input & history', /./],
];
const AI_SUBDOMAIN_RULES = [
  ['Generation, result & reporting UI', /^rsdDrawing\//],
  ['Shared contracts & progress geometry', /^lib\//],
  ['Client transport, recovery & generation state', /./],
];

export const DOMAIN_SUBDIVISIONS = {
  [D.drawing]: {
    definition:
      'The drawing domain contains `drawing/`, `clear/`, shared `lib/drawing/` primitives and ' +
      'the paper, departing-ink, clear and undo components in `rsdDrawing/`. ' +
      'Picture export lives in the storage domain; server code is measured under `netlify/`.',
    rules: DRAWING_SUBDOMAIN_RULES,
  },
  [D.ai]: {
    definition:
      'This domain includes the client transport, recovery and generation state in `ai/`, ' +
      'shared AI contracts and the generation/result/reporting components. ' +
      'The hosted API and workers are measured separately under `netlify/`.',
    rules: AI_SUBDOMAIN_RULES,
  },
};

export function subdomainOf(domain, srcPath) {
  const subdivision = DOMAIN_SUBDIVISIONS[domain];
  if (!subdivision) return null;
  return subdivision.rules.find(([, pattern]) => pattern.test(subjectOf(srcPath)))[0];
}

export const SPLIT_THRESHOLD_LOC = 3000;
