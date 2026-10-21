// @vitest-environment happy-dom
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The boot script's latest wait for a first paint before it loads the bundle anyway.
const FIRST_PAINT_FALLBACK_MS = 2000;
import {
  APP_PAGE_DOCUMENTS,
  APP_PAGE_PATHS,
  appPageAt,
} from '../../experiments/native-architecture/src/information/appPages.ts';
import { crossDocumentNavigation } from '../../experiments/native-architecture/src/pageDocument/appDocument.ts';
import { APP_DOCUMENT_ATTRIBUTE } from '../../experiments/native-architecture/src/pageDocument/appDocumentContract.ts';
import { FIRST_FRAME_VIEWPORT_ATTRIBUTE } from '../../experiments/native-architecture/src/platform/firstFrameViewport.ts';
import { BOOT_THEME_ATTRIBUTE } from '../../experiments/native-architecture/src/platform/bootTheme.ts';
import {
  DESIGN_DOCUMENT_DIR,
  DOCUMENT_ENTRIES,
  FLUID_LAYOUTS,
  PAGE_DOCUMENT_DIR,
  PAGE_VARIANT_ATTRIBUTE,
  PAGE_VARIANT_VIEWPORTS,
  documentPages,
  missingExportAssets,
  pageDocumentHtml,
  pageEntryModules,
  pageEntryScripts,
  pageOnlyChunks,
  pageVariantClass,
  pageVariantCss,
  documentEntry,
  withVariantFragments,
} from '../migration/prerender-native-web-pages.mjs';
import {
  STARTUP_SCRIPTS_ELEMENT_ID,
  startupScriptList,
} from '../migration/prerender-native-web.mjs';
import {
  MAX_NATIVE_WEB_PAGE_BYTES,
  checkNativeWebPageDocuments,
} from '../migration/check-native-web-startup.mjs';
import {
  NATIVE_APP_DOCUMENT_PATHS,
  isNativeAppNavigation,
} from '../migration/build-native-web.mjs';
import {
  DESIGN_DOCUMENT_STYLE_SOURCES,
  PAGE_DOCUMENT_EAGER_MODULES,
  PAGE_DOCUMENT_RESOLVER_OPTION,
  withPageDocumentResolution,
} from '../../experiments/native-architecture/scripts/page-document-resolution.cjs';
import { ROOT } from '../lib/proc.mjs';

const APP_DIR = join(ROOT, 'experiments/native-architecture');

const STYLESHEET = '/_expo/static/css/strict-1.css';
const EXPORTED_DOCUMENT = [
  '<!doctype html><html lang="en"><head><title>Splotch</title>',
  `<link rel="preload" href="${STYLESHEET}" as="style">\n<link rel="stylesheet" href="${STYLESHEET}">`,
  '</head><body>',
  '<!-- Use static rendering with Expo Router to support running without JavaScript. -->',
  '<noscript> You need to enable JavaScript to run this app. </noscript>',
  '<div id="root"></div>',
  '<script src="/_expo/static/js/web/index-1.js" defer></script></body></html>',
].join('\n');
const PAGE_SCRIPTS = ['/_expo/static/js/web/runtime-1.js', '/_expo/static/js/web/pageApp-1.js'];

function variants() {
  return Object.entries(PAGE_VARIANT_VIEWPORTS).flatMap(([layout, viewport]) =>
    ['light', 'dark'].map((theme) => ({
      key: `${layout}-${theme}`,
      viewport,
      html: `<main class="css-used"><h1>Privacy policy</h1><p>${layout} ${theme}</p><a href="#counting">Counting</a><section id="counting" aria-labelledby="«r0»"></section><p id="«r0»"></p></main>`,
    }))
  );
}

function privacyDocument() {
  return pageDocumentHtml(
    EXPORTED_DOCUMENT,
    {
      page: 'privacy',
      title: 'Privacy Policy · Splotch',
      fontFaceRules: '@font-face{font-family:"Quicksand Variable"}',
      variants: variants(),
      sheet: {
        id: 'react-native-stylesheet',
        textContent: '.css-used{display:flex}\n.css-unused{}',
      },
      scripts: PAGE_SCRIPTS,
    },
    () => Buffer.from('.x1{display:flex}')
  );
}

const DESIGN_SCRIPTS = ['/_expo/static/js/web/runtime-1.js', '/_expo/static/js/web/designApp-1.js'];

function designDocument() {
  return pageDocumentHtml(
    EXPORTED_DOCUMENT,
    {
      page: 'design',
      title: 'Splotch design system',
      fontFaceRules: '',
      variants: ['light', 'dark'].map((theme) => ({
        key: `fluid-${theme}`,
        viewport: FLUID_LAYOUTS.viewports.fluid,
        html: `<main><h1>Splotch design system</h1><p>${theme}</p></main>`,
      })),
      sheet: { id: 'react-native-stylesheet', textContent: '' },
      scripts: DESIGN_SCRIPTS,
      layouts: FLUID_LAYOUTS,
      documentCss: '.design-only{display:grid}',
    },
    () => Buffer.from('.x1{display:flex}')
  );
}

let dir;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
  vi.unstubAllGlobals();
});

function exportFixture(files) {
  dir = mkdtempSync(join(tmpdir(), 'native-web-pages-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

describe('the route table', () => {
  it('writes a document for each page whose document is its own, and routes every page', () => {
    expect(documentPages()).toEqual([
      { page: 'privacy', path: '/privacy', file: 'privacy.html' },
      { page: 'design', path: '/design', file: 'design.html' },
    ]);
    for (const [page, path] of Object.entries(APP_PAGE_PATHS)) expect(appPageAt(path)).toBe(page);
    expect(Object.keys(APP_PAGE_DOCUMENTS)).toEqual(Object.keys(APP_PAGE_PATHS));
    for (const { page } of documentPages(APP_PAGE_DOCUMENTS, {}))
      expect(APP_PAGE_DOCUMENTS[page].render).toBe('ssg');
  });

  it("answers every route table page from the worker's app navigation", () => {
    for (const path of Object.values(APP_PAGE_PATHS)) {
      expect(NATIVE_APP_DOCUMENT_PATHS).toContain(path);
      const url = new URL(path, 'https://splotch.art');
      expect(isNativeAppNavigation({ request: { mode: 'navigate' }, url })).toBe(true);
    }
  });

  it('writes only the pages a test names into a document', () => {
    expect(
      documentPages(
        {
          drawing: { render: 'ssg', document: 'drawing' },
          changelog: { render: 'ssg', document: 'page' },
        },
        {}
      )
    ).toEqual([{ page: 'changelog', path: '/changelog', file: 'changelog.html' }]);
  });

  it('writes each web-only document after the route table pages, and routes none in the app', () => {
    expect(documentPages({}, { design: '/design' })).toEqual([
      { page: 'design', path: '/design', file: 'design.html' },
    ]);
    expect(appPageAt('/design')).toBe('notFound');
    expect(NATIVE_APP_DOCUMENT_PATHS).not.toContain('/design');
  });
});

describe('the styleguide document', () => {
  it('loads its own entry and carries its own styles, which no information page shares', () => {
    expect(documentEntry('design')).toBe('design');
    expect(documentEntry('privacy')).toBe('information');
    expect(DOCUMENT_ENTRIES.design.app).not.toBe(DOCUMENT_ENTRIES.information.app);
    expect(DOCUMENT_ENTRIES.design.app.startsWith(`${DESIGN_DOCUMENT_DIR}/`)).toBe(true);
    expect(DOCUMENT_ENTRIES.design.styleSources).toBe(DESIGN_DOCUMENT_STYLE_SOURCES);
    expect(DOCUMENT_ENTRIES.information.styleSources).toBeNull();
    const html = designDocument();
    expect(html).toContain('.design-only{display:grid}');
    expect(privacyDocument()).not.toContain('.design-only');
  });

  it('lays out with media queries, so one variant per theme fits every window', () => {
    for (const viewport of Object.values(PAGE_VARIANT_VIEWPORTS))
      expect(FLUID_LAYOUTS.classOf(viewport)).toBe('fluid');
    expect(pageVariantCss(FLUID_LAYOUTS)).toContain(
      `@media all{[${PAGE_VARIANT_ATTRIBUTE}=fluid-light]{display:flex}}`
    );
  });

  it('keeps the variant for the theme at any window, ready to hydrate', () => {
    for (const [width, height] of [
      [412, 915],
      [1280, 800],
    ]) {
      vi.stubGlobal('innerWidth', width);
      vi.stubGlobal('innerHeight', height);
      vi.stubGlobal('matchMedia', (query) => ({
        matches: query === '(prefers-color-scheme: dark)',
      }));
      document.documentElement.removeAttribute(BOOT_THEME_ATTRIBUTE);
      document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(designDocument())[1];
      new Function(
        /<script>(\(function\(\)\{var painted[\s\S]*?)<\/script>/.exec(designDocument())[1]
      )();
      const root = document.getElementById('root');
      expect(root.getAttribute(PAGE_VARIANT_ATTRIBUTE)).toBe('fluid-dark');
      expect(document.querySelectorAll(`[${PAGE_VARIANT_ATTRIBUTE}]`)).toHaveLength(1);
    }
  });
});

describe("a page document's navigation", () => {
  it('opens its own fragments in place and loads every other page by its document', () => {
    const openInPlace = vi.fn();
    const assign = vi.fn();
    const open = crossDocumentNavigation('privacy', openInPlace, { assign });
    open('privacy', 'counting');
    expect(openInPlace).toHaveBeenCalledWith('privacy', 'counting');
    open('drawing');
    open('changelog', '1.6.0');
    expect(assign.mock.calls).toEqual([['/'], ['/changelog#1.6.0']]);
  });
});

describe('the layout variants', () => {
  it('names each variant viewport by the layout it renders', () => {
    for (const [layout, viewport] of Object.entries(PAGE_VARIANT_VIEWPORTS))
      expect(pageVariantClass(viewport)).toBe(layout);
  });

  it('switches layout at the page sheet thresholds', () => {
    expect(pageVariantClass({ width: 540, height: 400 })).toBe('phone');
    expect(pageVariantClass({ width: 541, height: 500 })).toBe('short');
    expect(pageVariantClass({ width: 920, height: 501 })).toBe('framed');
    expect(pageVariantClass({ width: 921, height: 501 })).toBe('desktop');
  });
});

describe('the page document', () => {
  it('carries its page and every variant in place of the drawing screen and its bundle', () => {
    const html = privacyDocument();
    expect(html).toContain(`<html ${APP_DOCUMENT_ATTRIBUTE}="privacy" lang="en">`);
    expect(html).toContain('<title>Privacy Policy · Splotch</title>');
    expect(html).toContain('<style>.x1{display:flex}</style>');
    expect(html).toContain('.css-used{display:flex}');
    expect(html).not.toContain('.css-unused');
    expect(html).not.toContain('index-1.js');
    expect(html).not.toContain('You need to enable JavaScript');
    expect(html).not.toContain('<div id="root">');
    expect(startupScriptList(html)).toEqual(PAGE_SCRIPTS);
    for (const { key } of variants()) expect(html).toContain(`${PAGE_VARIANT_ATTRIBUTE}="${key}"`);
    expect(html).toContain('<noscript><style>');
  });

  it('refuses an exported document it cannot fill', () => {
    expect(() =>
      pageDocumentHtml(EXPORTED_DOCUMENT.replace('<div id="root"></div>', ''), {}, () => '')
    ).toThrow("The export's document has no empty root.");
  });
});

describe("each variant's fragments", () => {
  it('keys only the ids an in-page link targets, and those links', () => {
    expect(
      withVariantFragments(
        '<a href="#counting">x</a><a href="#gone">y</a><section id="counting"></section><p id="«r0»"></p>',
        'phone-light'
      )
    ).toBe(
      '<a href="#counting~phone-light">x</a><a href="#gone">y</a><section id="counting~phone-light"></section><p id="«r0»"></p>'
    );
  });
});

describe("the page document's boot script", () => {
  function boot({ width, height, theme, scheme = 'light' }) {
    window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
    document.documentElement.removeAttribute(BOOT_THEME_ATTRIBUTE);
    if (theme) document.documentElement.setAttribute(BOOT_THEME_ATTRIBUTE, theme);
    globalThis.__EXPO_ROUTER_HYDRATE__ = undefined;
    vi.stubGlobal('innerWidth', width);
    vi.stubGlobal('innerHeight', height);
    vi.stubGlobal('matchMedia', (query) => ({
      matches: query === '(prefers-color-scheme: dark)' && scheme === 'dark',
    }));
    document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(privacyDocument())[1];
    new Function(
      /<script>(\(function\(\)\{var painted[\s\S]*?)<\/script>/.exec(privacyDocument())[1]
    )();
    return document.getElementById('root');
  }

  it('keeps the variant for the window and system theme as the root, ready to hydrate', () => {
    const root = boot({ width: 412, height: 915, scheme: 'dark' });
    expect(root.getAttribute(PAGE_VARIANT_ATTRIBUTE)).toBe('phone-dark');
    expect(root.getAttribute(FIRST_FRAME_VIEWPORT_ATTRIBUTE)).toBe('412x915@2.625');
    expect(document.querySelectorAll(`[${PAGE_VARIANT_ATTRIBUTE}]`)).toHaveLength(1);
    expect(globalThis.__EXPO_ROUTER_HYDRATE__).toBe(true);
  });

  it("gives the kept variant back the page's own fragment targets and links", () => {
    const root = boot({ width: 412, height: 915 });
    expect(root.querySelector('section').id).toBe('counting');
    expect(root.querySelector('a').getAttribute('href')).toBe('#counting');
  });

  it('reads a section URL copied without JavaScript as the page’s own fragment', () => {
    window.happyDOM.setURL('http://localhost/privacy?x=1#counting~desktop-light');
    boot({ width: 412, height: 915 });
    expect(location.pathname + location.search + location.hash).toBe('/privacy?x=1#counting');
    window.happyDOM.setURL('http://localhost/privacy#counting~elsewhere');
    boot({ width: 412, height: 915 });
    expect(location.hash).toBe('#counting~elsewhere');
    window.happyDOM.setURL('http://localhost/privacy');
  });

  it('follows a saved theme over the system one', () => {
    expect(
      boot({ width: 1280, height: 800, theme: 'light', scheme: 'dark' }).getAttribute(
        PAGE_VARIANT_ATTRIBUTE
      )
    ).toBe('desktop-light');
    expect(
      boot({ width: 900, height: 420, theme: 'dark' }).getAttribute(PAGE_VARIANT_ATTRIBUTE)
    ).toBe('short-dark');
  });

  it('loads the page entry, in order, once the page has painted', () => {
    vi.useFakeTimers();
    boot({ width: 820, height: 1180 });
    vi.advanceTimersByTime(FIRST_PAINT_FALLBACK_MS);
    vi.useRealTimers();
    const loaded = [...document.querySelectorAll('script[src]')].map((script) =>
      script.getAttribute('src')
    );
    expect(loaded).toEqual(PAGE_SCRIPTS);
  });
});

describe('the page entry bundle', () => {
  const chunk = (filename, requires = [], isAsync = false) => ({
    filename,
    source: '',
    metadata: { requires, isAsync },
  });

  it('loads each synchronous chunk after the chunks it requires, and never a lazy one', () => {
    expect(
      pageEntryScripts([
        chunk('_expo/static/js/web/pageApp-1.js', ['_expo/static/js/web/runtime-1.js']),
        chunk('_expo/static/js/web/runtime-1.js'),
        chunk('_expo/static/js/web/RsdParentGateSheet-1.js', [], true),
      ])
    ).toEqual(['/_expo/static/js/web/runtime-1.js', '/_expo/static/js/web/pageApp-1.js']);
  });

  it('refuses a chunk that requires one the bundle did not write', () => {
    expect(() =>
      pageEntryScripts([chunk('_expo/static/js/web/pageApp-1.js', ['_expo/static/js/web/gone.js'])])
    ).toThrow('The page entry requires a chunk it did not write: _expo/static/js/web/gone.js');
  });

  it('keeps chunks only a page document loads apart from the drawing screen’s', () => {
    const list = (scripts) =>
      `<script type="application/json" id="${STARTUP_SCRIPTS_ELEMENT_ID}">${JSON.stringify(scripts)}</script>`;
    const exportDir = exportFixture({
      'index.html': list(['/_expo/static/js/web/runtime-1.js', '/_expo/static/js/web/index-1.js']),
      'privacy.html': list(PAGE_SCRIPTS),
      '_expo/static/js/web/runtime-1.js': '',
      '_expo/static/js/web/index-1.js': '"/_expo/static/js/web/Settings-1.js"',
      '_expo/static/js/web/Settings-1.js': '',
      '_expo/static/js/web/pageApp-1.js':
        '"/_expo/static/js/web/Settings-1.js","/_expo/static/js/web/Gate-2.js"',
      '_expo/static/js/web/Gate-2.js': '',
    });
    expect(pageOnlyChunks(exportDir, 'index.html')).toEqual([
      '_expo/static/js/web/Gate-2.js',
      '_expo/static/js/web/pageApp-1.js',
    ]);
  });

  it('finds assets the export did not write', () => {
    const exportDir = exportFixture({ 'assets/font.1.woff2': '' });
    expect(
      missingExportAssets(['url(/assets/font.1.woff2)', '"/assets/gone.2.webp"'], exportDir)
    ).toEqual(['/assets/gone.2.webp']);
  });
});

// The drift guard over the drawing screen's entry (checkDrawingEntryBoundary): its positive control.
describe("the drawing screen's boundary", () => {
  it('names every page entry module a graph reaches, and nothing outside', () => {
    const pageModule = join(APP_DIR, PAGE_DOCUMENT_DIR, 'PageDocument.tsx');
    expect(
      pageEntryModules([
        join(APP_DIR, 'src/index.ts'),
        join(APP_DIR, 'src/rsdDrawing/RsdInformationPage.tsx'),
        pageModule,
        join(APP_DIR, 'src/pageDocumentNotes.ts'),
      ])
    ).toEqual(['src/pageDocument/PageDocument.tsx']);
    expect(pageEntryModules([join(APP_DIR, DESIGN_DOCUMENT_DIR, 'DesignDocument.tsx')])).toEqual([
      `${DESIGN_DOCUMENT_DIR}/DesignDocument.tsx`,
    ]);
    expect(pageEntryModules([join(APP_DIR, 'src/index.ts')])).toEqual([]);
  });
});

describe('the page documents’ module resolution', () => {
  const resolved = (filePath) => ({ type: 'sourceFile', filePath });
  const context = (options, filePath) => ({
    customResolverOptions: options,
    resolveRequest: () => resolved(filePath),
  });

  it('resolves each lazy facade to the module it wraps for a page document only', () => {
    for (const [facade, eager] of PAGE_DOCUMENT_EAGER_MODULES) {
      expect(
        withPageDocumentResolution(
          context({ [PAGE_DOCUMENT_RESOLVER_OPTION]: true }, facade),
          'x',
          'web'
        )
      ).toEqual(resolved(eager));
      expect(withPageDocumentResolution(context({}, facade), 'x', 'web')).toEqual(resolved(facade));
    }
  });

  it('gives each facade and its module the same value exports', () => {
    const exportsOf = (path) =>
      [
        ...readFileSync(path, 'utf8').matchAll(
          /^export (?:const|function) (\w+)|^export \{ (\w+)/gm
        ),
      ]
        .map((match) => match[1] ?? match[2])
        .sort();
    for (const [facade, eager] of PAGE_DOCUMENT_EAGER_MODULES)
      expect(exportsOf(eager)).toEqual(exportsOf(facade));
  });
});

describe("each page document's budgets", () => {
  const ENTRY = '_expo/static/js/web/pageApp-1.js';
  const entrySource = 'y'.repeat(300);
  const fixture = (inlineCss) =>
    exportFixture({
      'privacy.html': `<html><head><style>${inlineCss}</style></head><body><script type="application/json" id="${STARTUP_SCRIPTS_ELEMENT_ID}">["/${ENTRY}"]</script><script>var a=1;</script></body></html>`,
      [ENTRY]: entrySource,
    });
  const pages = [{ page: 'privacy', path: '/privacy', file: 'privacy.html' }];
  const css = 'x'.repeat(100);
  const firstPaint = css.length + 'var a=1;'.length;
  const pageEntry = entrySource.length;
  const check = (budget, log = () => {}) =>
    checkNativeWebPageDocuments({
      exportDir: fixture(css),
      pages,
      budgets: { privacy: budget },
      log,
    });

  it('accepts a document at both budgets', () => {
    const lines = [];
    check({ firstPaint, pageEntry }, (line) => lines.push(line));
    expect(lines).toEqual([
      expect.stringContaining(
        `privacy.html first paint ${firstPaint}/${firstPaint} bytes (8 inline JS and 100 inline CSS bytes plus 0 files); page entry ${pageEntry}/${pageEntry} bytes`
      ),
    ]);
  });

  it('rejects a first paint one byte over its budget', () => {
    expect(() => check({ firstPaint: firstPaint - 1, pageEntry })).toThrow(
      `privacy.html's first-paint JS/CSS is ${firstPaint} bytes, above its ${firstPaint - 1}-byte budget`
    );
  });

  it('rejects a page entry one byte over its budget', () => {
    expect(() => check({ firstPaint, pageEntry: pageEntry - 1 })).toThrow(
      `privacy.html's page entry is ${pageEntry} bytes, above its ${pageEntry - 1}-byte budget`
    );
  });

  it('budgets exactly the pages the route table writes', () => {
    expect(Object.keys(MAX_NATIVE_WEB_PAGE_BYTES)).toEqual(documentPages().map(({ page }) => page));
    expect(() =>
      checkNativeWebPageDocuments({ exportDir: fixture(''), pages, budgets: {}, log: () => {} })
    ).toThrow(
      'MAX_NATIVE_WEB_PAGE_BYTES budgets [] but the route table writes page documents for [privacy]'
    );
  });
});
