// Writes the admin console's document, admin.html, which a static host serves at /admin by pretty
// URL. It is unlinked (ADR-0101): no page names it, its head asks search engines to leave it out,
// and the worker never precaches it or its chunks and leaves every load of it to the network
// (build-native-web.mjs). Its markup is the console before the stored session is read, rendered in
// Node once per theme from the admin entry's render module, with the console's own compiled rules
// inlined in place of the export's strict.css, which leaves them out. The boot script keeps the
// variant for the visitor's theme, marks a stored session so the loading line shows instead of
// the sign-in form, and loads the admin entry (src/pageDocument/admin/adminApp.tsx), React DOM
// and the console alone, after the page has painted.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { UNLINKED_DOCUMENT_PATHS } from '../../experiments/native-architecture/src/information/unlinkedDocuments.ts';
import {
  ADMIN_RESTORING_ATTRIBUTE,
  ADMIN_SESSION_ATTRIBUTE,
  ADMIN_SESSION_KEY,
  ADMIN_THEMES,
  ADMIN_VARIANT_ATTRIBUTE,
} from '../../experiments/native-architecture/src/pageDocument/admin/adminContract.ts';
import { BOOT_THEME_ATTRIBUTE } from '../../experiments/native-architecture/src/platform/bootTheme.ts';
import { ADMIN_STYLE_INCLUDE } from '../../experiments/native-architecture/scripts/admin-document-styles.mjs';
import { ROOT } from '../lib/proc.mjs';
import {
  EXPO_SCRIPT,
  EXPO_STYLESHEET,
  STARTUP_SCRIPTS_ELEMENT_ID,
  bundleForNode,
  evaluateRenderer,
  startupScriptsAfterPaint,
} from './prerender-native-web.mjs';
import {
  bundlePageEntry,
  missingExportAssets,
  pageEntryScripts,
  withoutScriptCss,
  writeChunks,
  writtenPageDocuments,
} from './prerender-native-web-pages.mjs';

const NATIVE_APP_DIR = join(ROOT, 'experiments/native-architecture');
const nativeRequire = createRequire(join(NATIVE_APP_DIR, 'package.json'));
export const ADMIN_DOCUMENT_FILE = writtenPageDocuments().find(
  ({ path }) => path === UNLINKED_DOCUMENT_PATHS.admin
).file;
export const ADMIN_ENTRY = 'src/pageDocument/admin/adminApp.tsx';
export const ADMIN_RENDER_ENTRY = 'src/pageDocument/admin/prerender.tsx';
// The export's style sheet source: the RSD directive the console's rules expand into, and the
// app's global rules (the focus ring, form controls in the app's font) beside it.
const STRICT_CSS_SOURCE = join(NATIVE_APP_DIR, 'src/strict.css');
export const ADMIN_ROBOTS_META = '<meta name="robots" content="noindex, nofollow">';
const EMPTY_ROOT = '<div id="root"></div>';
const EXPO_NOSCRIPT = /\s*<!--[^>]*-->\s*<noscript>[^<]*<\/noscript>/;
const TITLE = /<title>[^<]*<\/title>/;

// The console's compiled rules, with the tokens they read and the app's global rules: the same
// plugin and source as the export's strict.css (postcss.config.mjs), over the console's sources
// alone. The plugin reads the app's Babel config from the working directory, as `expo export` runs
// it.
export async function adminStyleSheet() {
  const postcss = nativeRequire('postcss');
  const reactStrictPlugin = nativeRequire('react-strict-dom/postcss-plugin');
  const cwd = process.cwd();
  process.chdir(NATIVE_APP_DIR);
  try {
    const result = await postcss([
      reactStrictPlugin({ cwd: NATIVE_APP_DIR, include: ADMIN_STYLE_INCLUDE }),
    ]).process(readFileSync(STRICT_CSS_SOURCE, 'utf8'), { from: STRICT_CSS_SOURCE });
    return result.css;
  } finally {
    process.chdir(cwd);
  }
}

const variant = (theme) => `[${ADMIN_VARIANT_ATTRIBUTE}=${theme}]`;
const restoring = (part) => `[${ADMIN_RESTORING_ATTRIBUTE}=${part}]`;
const savedTheme = (theme) => `:root[${BOOT_THEME_ATTRIBUTE}=${theme}]`;

// Without a script, the variant for the saved theme shows, else the system's; the boot script
// keeps the one it picks as #root, which then shows whatever the system does next. A stored
// session hides the sign-in form behind the loading line until the entry reads it. Expo's
// document holds the body and root to the viewport for the drawing screen; this page scrolls.
export function adminDocumentCss() {
  return [
    'body{margin:0;overflow:visible;height:auto}',
    `${variant('light')},${variant('dark')}{display:none}`,
    `:root:not([${BOOT_THEME_ATTRIBUTE}=dark]) ${variant('light')}{display:block}`,
    `${savedTheme('dark')} ${variant('dark')}{display:block}`,
    `@media (prefers-color-scheme:dark){:root:not([${BOOT_THEME_ATTRIBUTE}]) ${variant('light')}{display:none}:root:not([${BOOT_THEME_ATTRIBUTE}]) ${variant('dark')}{display:block}}`,
    `#root[${ADMIN_VARIANT_ATTRIBUTE}]{display:block;height:auto}`,
    `:root[${ADMIN_SESSION_ATTRIBUTE}] ${restoring('sign-in')}{display:none}`,
    `:root[${ADMIN_SESSION_ATTRIBUTE}] ${restoring('loading')}{display:block}`,
  ].join('');
}

export function adminBootScript() {
  return [
    '(function(){var painted=false;try{',
    `var t=document.documentElement.getAttribute(${JSON.stringify(BOOT_THEME_ATTRIBUTE)});`,
    "if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';",
    `try{if(localStorage.getItem(${JSON.stringify(ADMIN_SESSION_KEY)}))document.documentElement.setAttribute(${JSON.stringify(ADMIN_SESSION_ATTRIBUTE)},'')}catch(e){}`,
    `var v=document.querySelectorAll('[${ADMIN_VARIANT_ATTRIBUTE}]'),f=null,i;`,
    `for(i=0;i<v.length;i++)if(v[i].getAttribute(${JSON.stringify(ADMIN_VARIANT_ATTRIBUTE)})===t)f=v[i];`,
    'if(f){',
    'for(i=0;i<v.length;i++)if(v[i]!==f)v[i].remove();',
    "f.id='root';",
    "painted=document.visibilityState==='visible';",
    '}}catch(e){}',
    ...startupScriptsAfterPaint(),
    '})();',
  ].join('');
}

export function adminDocumentHtml(
  template,
  { title, fontFaceRules, styleSheet, variants, scripts }
) {
  for (const [pattern, part] of [
    [TITLE, '<title>'],
    [EXPO_NOSCRIPT, "Expo's <noscript>"],
  ])
    if (!pattern.test(template)) throw new Error(`The export's document has no ${part}.`);
  if (!template.includes(EMPTY_ROOT)) throw new Error("The export's document has no empty root.");
  if (template.search(EXPO_STYLESHEET) < 0)
    throw new Error("The export's document links no style sheet to replace.");
  const style = `<style>${fontFaceRules}${styleSheet}${adminDocumentCss()}</style>\n<noscript><style>${withoutScriptCss()}</style></noscript>`;
  return template
    .replace(TITLE, `<title>${title}</title>`)
    .replace(EXPO_STYLESHEET, '')
    .replace('</head>', `${ADMIN_ROBOTS_META}\n${style}\n</head>`)
    .replace(EXPO_SCRIPT, '')
    .replace(EXPO_NOSCRIPT, '')
    .replace(
      EMPTY_ROOT,
      [
        ...variants.map(
          ({ theme, html }) => `<div ${ADMIN_VARIANT_ATTRIBUTE}="${theme}">${html}</div>`
        ),
        `<script type="application/json" id="${STARTUP_SCRIPTS_ELEMENT_ID}">${JSON.stringify(scripts)}</script>`,
        `<script>${adminBootScript()}</script>`,
      ].join('\n')
    );
}

export async function prerenderNativeWebAdmin(exportDir, template) {
  const render = evaluateRenderer(await bundleForNode(ADMIN_RENDER_ENTRY));
  const variants = ADMIN_THEMES.map((theme) => ({ theme, html: render.renderAdminVariant(theme) }));
  const chunks = await bundlePageEntry(ADMIN_ENTRY);
  writeChunks(exportDir, chunks);
  const scripts = pageEntryScripts(chunks);
  const html = adminDocumentHtml(template, {
    ...render.adminDocumentHead(),
    styleSheet: await adminStyleSheet(),
    variants,
    scripts,
  });
  const missing = missingExportAssets([html, ...chunks.map(({ source }) => source)], exportDir);
  if (missing.length)
    throw new Error(
      `${ADMIN_DOCUMENT_FILE} names assets the export did not write: ${missing.join(', ')}`
    );
  writeFileSync(join(exportDir, ADMIN_DOCUMENT_FILE), html);
  return { file: ADMIN_DOCUMENT_FILE, scripts };
}
