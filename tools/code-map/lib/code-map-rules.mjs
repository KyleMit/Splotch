// The counting rules behind docs/CODE-MAP.md. Every tracked path resolves to
// exactly one exclusion class or exactly one measured area; within a measured
// area it resolves to one sub-bucket, and within web/src to one functional
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
  'docs/scratchpad/',
  'perf-profiles/',
  'scrapbook/',
  'tools/asset-gen/',
  'tools/centerline-tracing/benchmark/',
];
const REPORT_HTML_ROOTS = ['scrapbook/', 'tools/asset-gen/'];
// Coloring outlines, traced corpora, and vectorizer output: drawings stored as
// SVG, not source. Hand-authored icons under web/src stay measured.
const VECTOR_ART_ROOTS = [
  'tools/centerline-tracing/',
  'tools/model-eval/samples/',
  'tools/vectorize/pilot/',
  'web/static/coloring/',
];

export const CODE_MAP_PATH = 'docs/CODE-MAP.md';
export const WEB_SRC_PREFIX = 'web/src/';

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

const NATIVE_ROOTS = ['android/', 'ios/', 'fastlane/', '.maestro/'];

// Areas are disjoint by construction; `areasFor` returns every match so the
// coverage test can prove it rather than trust rule order.
export const AREAS = [
  {
    label: '**web/src** — the app',
    key: 'web/src',
    matches: (path) => path.startsWith('web/src/'),
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
    label: '**web/tests** — E2E + integration',
    key: 'web/tests',
    matches: (path) => path.startsWith('web/tests/'),
    bucket: subtreeBucket('web/tests/', { '(root)': '(root) E2E / integration' }),
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
    label: 'android + ios + fastlane + Maestro — native shells',
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
    label: 'web/\\* — build/test config and static text',
    key: 'web config',
    matches: (path) =>
      path.startsWith('web/') && !path.startsWith('web/src/') && !path.startsWith('web/tests/'),
    bucket: subtreeBucket('web/'),
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
    label: 'netlify — edge functions and config',
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
// files and the files at the web/src root keep their full names, where the stem
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
  settings: 'Settings surface',
  shell: 'Routes / app shell / dev surfaces',
  controls: 'Core UI controls',
  gestures: 'Gestures / Svelte actions',
  admin: 'Admin console + token backend',
  coloring: 'Coloring books + pack delivery',
  pwa: 'PWA / installation',
  platform: 'Platform / device integration',
  color: 'Color palette & picker',
  server: 'Server / API backend',
  storage: 'Storage / persistence',
  state: 'App state (runes)',
  beta: 'Beta onboarding',
  utilities: 'Focused utilities / generated app data',
  feedback: 'Feedback / reporting',
  audio: 'Audio',
};

// First match wins, and matching runs on the subject path relative to web/src.
// The directory-wide rules at the bottom of each group are the fallbacks that
// place a new file somewhere plausible; `reconcile-code-map` reviews what they caught.
export const WEB_SRC_DOMAIN_RULES = [
  [D.ai, /^lib\/drawing\/(aiGenerationPoll|aiImage|aiImageResponse|polaroidAnimation)$/],
  [D.drawing, /^lib\/drawing\//],
  [D.drawing, /^lib\/components\/(DrawingCanvas|LiveSurface)$/],
  [D.drawing, /^lib\/state\/canvas$/],
  [D.drawing, /^routes\/dev\/engine\//],

  [D.ai, /^lib\/ai\//],
  [D.ai, /^lib\/server\/ai\//],
  [
    D.ai,
    /^lib\/server\/(generation\w*|generateImagePolicy|freeGenerationGrants|imageReport\w*|retentionSweep|usage\w*)$/,
  ],
  [
    D.ai,
    /^routes\/api\/(generate-image|generation-result|report-image|free-generation-grant|verify-key)\//,
  ],
  [D.ai, /^lib\/components\/(Ai\w+|aiDialGeometry|aiPreview)$/],
  [
    D.ai,
    /^lib\/state\/(aiGeneration|aiProgress|aiKey|aiAccessToken|freeGenerations|secureCredentialCoordinator)$/,
  ],
  [D.ai, /^lib\/(aiCredential|freeGenerations|imageReport|usageRecord)$/],

  [D.admin, /^lib\/components\/admin\//],
  [D.admin, /^routes\/(api\/)?admin\//],
  [D.admin, /^lib\/server\/(admin|tokens)$/],
  [D.admin, /^lib\/(adminFormat|adminPersistence|inviteLink)$/],
  [D.admin, /^lib\/pwa\/adminRoute$/],

  [D.beta, /^lib\/components\/beta\//],
  [D.beta, /^routes\/(beta|android-beta|ios-beta)\//],
  [D.beta, /^lib\/phoneStep$/],

  [D.feedback, /^lib\/components\/report\//],
  [D.feedback, /^routes\/feedback\//],
  [D.feedback, /^lib\/(report|errorLog)$/],
  [D.feedback, /^lib\/components\/settings\/ReportForm$/],

  [D.settings, /^lib\/components\/settings\//],
  [D.settings, /^lib\/components\/(SettingsModal|SettingsButton|ParentalGate\w*)$/],
  [D.settings, /^lib\/state\/(settings|parentalGate|parentalGateLockout)$/],

  [D.coloring, /^lib\/coloringPacks\//],
  [D.coloring, /^lib\/components\/(Coloring\w+)$/],
  [D.coloring, /^lib\/state\/(coloringBook|coloringPacks|coloringPicker|books|bookCatalog)$/],
  [D.coloring, /^lib\/(boot|plugins)\/coloringPacks$/],

  [D.pwa, /^lib\/pwa\//],
  [D.pwa, /^lib\/components\/InstallBanner$/],
  [D.pwa, /^lib\/state\/install$/],
  [D.pwa, /^lib\/imagePrefetch$/],

  [D.color, /^lib\/components\/(Color\w+)$/],
  [D.color, /^lib\/(colorRing|palette|hexPickerLayout)$/],
  [D.color, /^lib\/state\/colors$/],

  [D.design, /^lib\/components\/(design|styleguide|nav)\//],
  [D.design, /^lib\/(design|icons)\//],
  [
    D.design,
    /^lib\/components\/(Icon|SectionIcon|SplotchyIcon|InkOrMagicIcon|iconRegistry|iconTypes|deferredIcons)$/,
  ],
  [D.design, /^routes\/design\//],
  [D.design, /^tokens\.css$/],

  [D.gestures, /^lib\/actions\//],

  [D.audio, /^lib\/audio\//],

  [D.platform, /^lib\/(platform|plugins)\//],
  [D.platform, /^lib\/(nativePlugin|secureStorage|storeCapture)$/],
  [D.platform, /^lib\/components\/(FullscreenToggle|NotchBand)$/],

  [D.storage, /^lib\/(idb|idbDatabase|storage|storageKeys|saveNaming|hydration)$/],
  [D.storage, /^lib\/state\/(saveFolder|saveFailure)$/],
  [D.storage, /^lib\/components\/SaveFailureBanner$/],
  [D.storage, /^lib\/boot\/(persistedState|persistedStateStatus)$/],

  [D.state, /^lib\/state\//],

  [D.server, /^lib\/server\//],
  [D.server, /^routes\/api\//],

  [
    D.controls,
    /^lib\/(actionButtonLayout|actionUnavailableFeedback|bareToolbar|breakpoints|glassPanes|landscapeToolbar)$/,
  ],
  [D.controls, /^lib\/components\/[^/]+$/],

  [D.shell, /^lib\/boot\//],
  [D.shell, /^lib\/components\/page\//],
  [D.shell, /^routes\//],

  [D.utilities, /^lib\//],
  [D.shell, /^/],
];

// The last rule matches every path, so each web/src file resolves to a domain.
export function webSrcDomainRuleOf(webSrcPath) {
  const subject = subjectOf(webSrcPath);
  const ruleIndex = WEB_SRC_DOMAIN_RULES.findIndex(([, pattern]) => pattern.test(subject));
  return { domain: WEB_SRC_DOMAIN_RULES[ruleIndex][0], ruleIndex };
}

const DRAWING_SUBDOMAIN_RULES = [
  [
    'Paper view & coloring integration',
    /^lib\/drawing\/(paperView|paperLayout|coloringAppearance)$/,
  ],
  [
    'Export, saving & screenshot pipeline',
    /^lib\/drawing\/(export\w*|screenshot\w*|pngEncoder\w*|folderSave|androidGallery|saveOnDelete|saveFailureCopy|unsavedPictureStore)$/,
  ],
  [
    'Tiled renderer, retained history & undo',
    /^lib\/drawing\/(tiled\w*|undoHistory|liveTile\w*|progressiveClearCapture)$/,
  ],
  [
    'Stroke model & brush rendering',
    /^lib\/drawing\/(crayon\w*|magic\w*|stroke\w*|inkMotion\w*|penStreamQuirks|opGeometry|canvas2d)$/,
  ],
  ['Engine orchestration & canvas integration', /./],
];

const AI_SUBDOMAIN_RULES = [
  ['Server authorization, jobs, storage & endpoints', /^(lib\/server\/|routes\/api\/)/],
  ['Generation, result & reporting UI', /^lib\/components\//],
  ['Client pipeline, state & shared contracts', /./],
];

export const DOMAIN_SUBDIVISIONS = {
  [D.drawing]: {
    definition:
      'The drawing domain contains `lib/drawing/**` except the AI-generation and polaroid modules, ' +
      'plus `DrawingCanvas.svelte`, `LiveSurface.svelte`, `state/canvas.svelte.ts`, and ' +
      '`routes/dev/engine/**`.',
    rules: DRAWING_SUBDOMAIN_RULES,
  },
  [D.ai]: {
    definition:
      'This vertical includes generation-specific client code, state, components, server modules, ' +
      'and the four public generation/reporting API routes. General-purpose server infrastructure ' +
      'and the admin token surface remain in their own domains.',
    rules: AI_SUBDOMAIN_RULES,
  },
};

export function subdomainOf(domain, webSrcPath) {
  const subdivision = DOMAIN_SUBDIVISIONS[domain];
  if (!subdivision) return null;
  const subject = subjectOf(webSrcPath);
  return subdivision.rules.find(([, pattern]) => pattern.test(subject))[0];
}

export const SPLIT_THRESHOLD_LOC = 3000;
