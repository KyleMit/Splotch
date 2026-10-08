import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  webHostRequest,
  WEB_HOST_REACT_SOURCE_PATHS,
  WEB_HOST_REACT_RENDERER,
  WEB_HOST_REACT_RENDERER_GRAPH,
  WEB_HOST_REACT_RENDER_REQUEST,
  WEB_HOST_REACT_CHROME,
} from '../../../migration/probes/web-host/host/contract.ts';
import {
  overlayPageSource,
  pageOverlayPlugin,
} from '../../../migration/probes/web-host/host/pageOverlay.ts';
import { serverStore } from '../../../migration/probes/web-host/host/serverStore.ts';
import { PROBE_SERVER_SNAPSHOT } from '../../../migration/probes/web-host/src/probeProps.ts';
import {
  chromeDigest,
  validateChromeHtml,
  makeRenderRequest,
  writeRenderRequest,
  readRenderRequest,
  writeRenderedChrome,
  readRenderedChrome,
  REACT_PRODUCTION_CONTEXT,
} from '../../../migration/probes/web-host/host/chromeHtml.ts';
import { createOwnedArtifact } from '../lib/web-host-ownership.mjs';
import { collectLoadedReactFiles } from '../../../migration/probes/web-host/host/reactProduction.ts';

const fixtures = [];
function temporary() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-react-boundary-')));
  fixtures.push(root);
  return root;
}
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true });
});
function write(root, path, value) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), value);
}
function flags(overrides = {}) {
  return {
    variant: 'neutral-embedded',
    artifact: 'mechanism',
    fixture: 'matching',
    capacitor: 'false',
    perfMarks: 'false',
    harness: 'true',
    ...overrides,
  };
}
function sourceFixture() {
  const owned = createOwnedArtifact(temporary());
  const copyRoot = join(owned.root, 'neutral');
  for (const path of [
    ...WEB_HOST_REACT_SOURCE_PATHS,
    WEB_HOST_REACT_RENDERER,
    WEB_HOST_REACT_RENDERER_GRAPH,
  ])
    write(copyRoot, path, 'export const source = true;\n');
  for (const name of ['react', 'react-dom'])
    write(
      copyRoot,
      `node_modules/${name}/package.json`,
      JSON.stringify({ name, version: '19.2.3' })
    );
  const loaded = [
    'node_modules/react/cjs/react.production.js',
    'node_modules/react-dom/cjs/react-dom-server-legacy.node.production.js',
  ];
  for (const path of loaded) write(copyRoot, path, 'module.exports = {};\n');
  return {
    owned,
    copyRoot,
    loaded: collectLoadedReactFiles(
      copyRoot,
      loaded.map((path) => join(copyRoot, path))
    ),
  };
}

it('keeps closed fixtures, release refusal and actual instrumentation flags', () => {
  expect(webHostRequest(flags())).toEqual({
    variant: 'neutral-embedded',
    artifact: 'mechanism',
    fixture: 'matching',
  });
  expect(webHostRequest(flags({ fixture: 'text-mismatch' })).fixture).toBe('text-mismatch');
  expect(webHostRequest(flags({ variant: 'retained-control', fixture: undefined })).fixture).toBe(
    'matching'
  );
  expect(() =>
    webHostRequest(flags({ artifact: 'release', harness: 'false', fixture: 'text-mismatch' }))
  ).toThrow(/Release refuses/);
  for (const change of [
    { perfMarks: 'true' },
    { capacitor: 'true' },
    { harness: 'false' },
    { fixture: 'unknown' },
    { variant: 'react-web' },
  ])
    expect(() => webHostRequest(flags(change))).toThrow();
});

it('preserves page bytes outside its two exact ordered insertions', () => {
  const source = `<script lang="ts">\n  import '$lib/drawing/earlyBoot';\n</script>\n<Canvas />\n<div class="bottom-dock">\n<SettingsButton />\n</div>\n`;
  const transformed = overlayPageSource(source);
  expect(transformed.code).toBe(
    source
      .replace(
        "  import '$lib/drawing/earlyBoot';",
        "  import '$lib/drawing/earlyBoot';\n  import ProbeIsland from '../../../migration/probes/web-host/src/ProbeIsland.svelte';"
      )
      .replace('<div class="bottom-dock">', '<ProbeIsland />\n<div class="bottom-dock">')
  );
  expect(transformed.binding.sourceSha256).toBe(chromeDigest(source));
  expect(transformed.binding.transformedSha256).toBe(chromeDigest(transformed.code));
  expect(() => overlayPageSource(source.replace('earlyBoot', 'otherBoot'))).toThrow(
    /one exact anchor/
  );
  expect(() => overlayPageSource(source + '<div class="bottom-dock">')).toThrow(/one exact anchor/);
  expect(() => overlayPageSource(transformed.code)).toThrow(/already contains/);
});

it('loads only the exact canonical root page and leaves query submodules untouched', () => {
  const copyRoot = temporary();
  const page = join(copyRoot, 'web/src/routes/+page.svelte');
  write(
    copyRoot,
    'web/src/routes/+page.svelte',
    '  import \'$lib/drawing/earlyBoot\';\n<div class="bottom-dock">'
  );
  const rows = [];
  const plugin = pageOverlayPlugin(copyRoot, (row) => rows.push(row));
  expect(plugin.load(`${page}?svelte&type=style`)).toBeNull();
  expect(plugin.load(join(copyRoot, 'web/src/routes/admin/+page.svelte'))).toBeNull();
  expect(plugin.load(page).code).toContain('<ProbeIsland />');
  expect(rows).toHaveLength(1);
});

it('uses one immutable pending server snapshot and refuses server actions', () => {
  expect(serverStore.getServerSnapshot()).toBe(PROBE_SERVER_SNAPSHOT);
  expect(serverStore.getSnapshot()).toBe(PROBE_SERVER_SNAPSHOT);
  expect(Object.isFrozen(PROBE_SERVER_SNAPSHOT)).toBe(true);
  expect(
    serverStore.subscribe(() => {
      throw new Error('Server subscription invoked');
    })()
  ).toBeUndefined();
  expect(() => serverStore.toggleTheme()).toThrow(/SSR pending/);
  expect(() => serverStore.openDialog({})).toThrow(/SSR pending/);
});

it('preserves the named React separator bytes and rejects other raw declaration/comment forms', () => {
  expect(validateChromeHtml('<p>one<!-- -->two &lt;!-- escaped</p>')).toBe(
    '<p>one<!-- -->two &lt;!-- escaped</p>'
  );
  for (const html of [
    '<p><!-->bad</p>',
    '<p><!----></p>',
    '<p><!--->bad</p>',
    '<p><!----!></p>',
    '<!>',
    '<!DOCTYPE html>',
    '<?pi?>',
    '<!-- text -->',
  ])
    expect(() => validateChromeHtml(html)).toThrow(/raw declaration/);
});

it('binds request props, prefix, maintained source, compiled renderer and publication bytes', () => {
  const { owned, copyRoot } = sourceFixture();
  const request = makeRenderRequest(copyRoot, webHostRequest(flags()), REACT_PRODUCTION_CONTEXT);
  const sha = writeRenderRequest(owned, request);
  expect(readRenderRequest(owned, copyRoot, sha)).toEqual(request);
  const path = join(owned.root, WEB_HOST_REACT_RENDER_REQUEST);
  const changed = { ...request, identifierPrefix: 'changed-' };
  writeFileSync(path, `${JSON.stringify(changed)}\n`);
  expect(() => readRenderRequest(owned, copyRoot, sha)).toThrow(/Published input changed/);
  expect(() => readRenderRequest(owned, copyRoot, chromeDigest(readFileSync(path)))).toThrow(
    /identifier prefix/
  );
});

it('rejects changed renderer bytes before accepting the otherwise unchanged request', () => {
  const { owned, copyRoot } = sourceFixture();
  const request = makeRenderRequest(copyRoot, webHostRequest(flags()), REACT_PRODUCTION_CONTEXT);
  const sha = writeRenderRequest(owned, request);
  writeFileSync(join(copyRoot, WEB_HOST_REACT_RENDERER), 'throw new Error("unreviewed renderer");');
  expect(() => readRenderRequest(owned, copyRoot, sha)).toThrow(/changed|digest|bytes/i);
});

it('rejects changed HTML even when its internal digest is recomputed', () => {
  const { owned, copyRoot, loaded } = sourceFixture();
  const request = makeRenderRequest(copyRoot, webHostRequest(flags()), REACT_PRODUCTION_CONTEXT);
  const requestSha = writeRenderRequest(owned, request);
  const htmlSha = writeRenderedChrome(
    owned,
    requestSha,
    '<p>Drawing<!-- --> state pending</p>',
    loaded
  );
  expect(readRenderedChrome(owned, copyRoot, htmlSha, requestSha).html).toBe(
    '<p>Drawing<!-- --> state pending</p>'
  );
  const path = join(owned.root, WEB_HOST_REACT_CHROME);
  const changed = JSON.parse(readFileSync(path, 'utf8'));
  changed.html = '<p>Changed state</p>';
  changed.htmlBytes = Buffer.byteLength(changed.html);
  changed.htmlSha256 = chromeDigest(changed.html);
  writeFileSync(path, `${JSON.stringify(changed)}\n`);
  expect(() => readRenderedChrome(owned, copyRoot, htmlSha, requestSha)).toThrow(
    /Published input changed/
  );
});

it.each(['<!---->', '<!-->', '<!--->', '<!----!>', '<!>', '<!DOCTYPE html>', '<?pi?>'])(
  'refuses writer/readback contamination %s despite recomputed HTML receipt fields',
  (contamination) => {
    const { owned, copyRoot, loaded } = sourceFixture();
    const request = makeRenderRequest(copyRoot, webHostRequest(flags()), REACT_PRODUCTION_CONTEXT);
    const requestSha = writeRenderRequest(owned, request);
    expect(() => writeRenderedChrome(owned, requestSha, `<p>${contamination}</p>`, loaded)).toThrow(
      /raw declaration/
    );
    const publication = writeRenderedChrome(
      owned,
      requestSha,
      '<p>Pending<!-- --> chrome</p>',
      loaded
    );
    expect(readRenderedChrome(owned, copyRoot, publication, requestSha).html).toBe(
      '<p>Pending<!-- --> chrome</p>'
    );
    const path = join(owned.root, WEB_HOST_REACT_CHROME);
    const changed = JSON.parse(readFileSync(path, 'utf8'));
    changed.html = `<p>${contamination}</p>`;
    changed.htmlBytes = Buffer.byteLength(changed.html);
    changed.htmlSha256 = chromeDigest(changed.html);
    writeFileSync(path, `${JSON.stringify(changed)}\n`);
    expect(() =>
      readRenderedChrome(owned, copyRoot, chromeDigest(readFileSync(path)), requestSha)
    ).toThrow(/raw declaration/);
  }
);
