import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertReactGraph,
  assertReactContribution,
} from '../../../migration/probes/web-host/host/reactGraph.ts';
import { emittedModuleReferences } from '../../../migration/probes/web-host/host/reactGraphReferences.ts';
import {
  bindReactFile,
  REACT_DEVELOPMENT_FILES,
} from '../../../migration/probes/web-host/host/reactProduction.ts';
import { assertRequiredNeutralContributions } from '../../../migration/probes/web-host/host/neutralEvidence.ts';
import { WEB_HOST_CHROME_VIRTUAL_ID } from '../../../migration/probes/web-host/host/contract.ts';
import { REACT_PRODUCTION_CONTEXT } from '../../../migration/probes/web-host/host/chromeHtml.ts';

const fixtures = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true });
});
function write(root, path, value) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), value);
}
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-react-graph-')));
  fixtures.push(root);
  const source = 'node_modules/react/index.js';
  write(
    root,
    'node_modules/react/package.json',
    JSON.stringify({ name: 'react', version: '19.2.3' })
  );
  write(
    root,
    source,
    "if (process.env.NODE_ENV === 'production') require('./cjs/react.production.js'); else require('./cjs/react.development.js');"
  );
  write(root, 'output/entry.mjs', 'export const value = "production";\n');
  const graph = {
    schemaVersion: 1,
    stage: 'ssr-renderer',
    outputDirectory: 'output',
    context: REACT_PRODUCTION_CONTEXT,
    overlay: null,
    packages: [bindReactFile(root, 'node_modules/react/package.json')],
    chunks: [
      {
        fileName: 'entry.mjs',
        file: bindReactFile(root, 'output/entry.mjs'),
        facade: source,
        modules: [
          {
            id: source,
            renderedLength: 12,
            source: { kind: 'file', file: bindReactFile(root, source) },
          },
        ],
        imports: [],
        dynamicImports: [],
        externals: [],
      },
    ],
  };
  return { root, graph };
}

it('accepts actual source bindings without treating inert selector source text as a contribution', () => {
  const { root, graph } = fixture();
  expect(assertReactGraph(root, graph, 'ssr-renderer')).toEqual(graph);
});

it('extracts actual literal import/export/dynamic/require edges without scanning arbitrary strings', () => {
  expect(
    emittedModuleReferences(
      'import x from "react"; export {x} from "react-dom"; import("react/jsx-runtime"); require("react-dom/server"); const text="react/cjs/react.development.js";'
    )
  ).toEqual(['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime']);
  expect(() => emittedModuleReferences('import {')).toThrow(/could not be parsed/);
});

it('rejects every listed real development contributor and bare/CJS jsx-dev-runtime', () => {
  for (const path of REACT_DEVELOPMENT_FILES)
    expect(() => assertReactContribution(`node_modules/${path}`)).toThrow(/Development React/);
  for (const path of [
    'react/jsx-dev-runtime',
    'node_modules/react/cjs/react-jsx-dev-runtime.production.js',
  ])
    expect(() => assertReactContribution(path)).toThrow(/Development React/);
});

it('rejects a real contributing development file with otherwise valid recomputed bindings', () => {
  const { root, graph } = fixture();
  const path = 'node_modules/react/cjs/react.development.js';
  write(root, path, 'exports.version = "19.2.3";');
  graph.chunks[0].modules.push({
    id: path,
    renderedLength: 1,
    source: { kind: 'file', file: bindReactFile(root, path) },
  });
  expect(() => assertReactGraph(root, graph, 'ssr-renderer')).toThrow(/Development React/);
});

it('rejects an emitted development require after its output binding is recomputed', () => {
  const { root, graph } = fixture();
  write(root, 'output/entry.mjs', 'require("react/cjs/react.development.js");');
  graph.chunks[0].file = bindReactFile(root, 'output/entry.mjs');
  expect(() => assertReactGraph(root, graph, 'ssr-renderer')).toThrow(/Development React/);
});

it('rejects missing external coverage and malformed static/dynamic arrays', () => {
  const { root, graph } = fixture();
  graph.chunks[0].imports = ['node:fs'];
  expect(() => assertReactGraph(root, graph, 'ssr-renderer')).toThrow(/omitted a surviving/);
  graph.chunks[0].externals = [{ qualification: 'builtin', specifier: 'node:fs', resolved: null }];
  expect(assertReactGraph(root, graph, 'ssr-renderer').chunks[0].externals).toHaveLength(1);
  graph.chunks[0].dynamicImports = [42];
  expect(() => assertReactGraph(root, graph, 'ssr-renderer')).toThrow(/edge array/);
});

it('rejects missing source bindings, output drift and source-ID aliases', () => {
  const { root, graph } = fixture();
  const original = structuredClone(graph);
  graph.chunks[0].modules[0].source = null;
  expect(() => assertReactGraph(root, graph, 'ssr-renderer')).toThrow(/source/);
  graph.chunks = original.chunks;
  graph.chunks[0].modules[0].id = 'node_modules/react/other.js';
  expect(() => assertReactGraph(root, graph, 'ssr-renderer')).toThrow(/ID disagrees/);
  graph.chunks = structuredClone(original.chunks);
  write(root, 'output/entry.mjs', 'export const value = "changed";');
  expect(() => assertReactGraph(root, graph, 'ssr-renderer')).toThrow(/changed|digest|bytes/i);
});

it('rejects an emitted bare production import whose surviving graph edge was omitted', () => {
  const { root, graph } = fixture();
  write(root, 'output/entry.mjs', 'import "react/jsx-runtime"; export const value = true;');
  graph.chunks[0].file = bindReactFile(root, 'output/entry.mjs');
  expect(() => assertReactGraph(root, graph, 'ssr-renderer')).toThrow(/literal import omitted/);
});

it('accepts a real emitted internal edge and preserves an external builtin source row', () => {
  const { root, graph } = fixture();
  const entry = graph.chunks[0];
  write(
    root,
    'output/entry.mjs',
    ['import', '"./support.mjs"; import "node:fs"; export const value = true;'].join(' ')
  );
  entry.file = bindReactFile(root, 'output/entry.mjs');
  entry.imports = ['support.mjs', 'node:fs'];
  entry.externals = [{ qualification: 'builtin', specifier: 'node:fs', resolved: null }];
  write(root, 'output/support.mjs', 'export const support = true;');
  graph.chunks.push({
    ...structuredClone(entry),
    fileName: 'support.mjs',
    file: bindReactFile(root, 'output/support.mjs'),
    imports: [],
    dynamicImports: [],
    externals: [],
  });
  expect(assertReactGraph(root, graph, 'ssr-renderer').chunks).toHaveLength(2);
});

it('binds exact participating package versions independently of harmless selector source text', () => {
  const { root, graph } = fixture();
  expect(assertReactGraph(root, graph, 'ssr-renderer').packages).toHaveLength(1);
  write(
    root,
    'node_modules/react/package.json',
    JSON.stringify({ name: 'react', version: '19.2.4' })
  );
  graph.packages = [bindReactFile(root, 'node_modules/react/package.json')];
  expect(() => assertReactGraph(root, graph, 'ssr-renderer')).toThrow(
    /Loaded React package must be react@19.2.3/
  );
});

it('rejects omitted participating package identity even with intact source and output bindings', () => {
  const { root, graph } = fixture();
  graph.packages = [];
  expect(() => assertReactGraph(root, graph, 'ssr-renderer')).toThrow(
    /package identities disagree/
  );
});

it('records an ordinary non-React bare external without claiming CJS equals ESM resolution', () => {
  const { root, graph } = fixture();
  write(root, 'output/entry.mjs', 'import "openai"; export const value = true;');
  graph.chunks[0].file = bindReactFile(root, 'output/entry.mjs');
  graph.chunks[0].imports = ['openai'];
  graph.chunks[0].externals = [
    { qualification: 'recorded-only', specifier: 'openai', resolved: null },
  ];
  expect(assertReactGraph(root, graph, 'ssr-renderer').chunks[0].externals[0].qualification).toBe(
    'recorded-only'
  );
});

it('refuses to label an actual React external as an ordinary unqualified dependency', () => {
  const { root, graph } = fixture();
  write(root, 'output/entry.mjs', 'import "react"; export const value = true;');
  graph.chunks[0].file = bindReactFile(root, 'output/entry.mjs');
  graph.chunks[0].imports = ['react'];
  graph.chunks[0].externals = [
    { qualification: 'recorded-only', specifier: 'react', resolved: null },
  ];
  expect(() => assertReactGraph(root, graph, 'ssr-renderer')).toThrow(/cannot hide/);
});

function contributionPass(stage) {
  const ids = [WEB_HOST_CHROME_VIRTUAL_ID, 'migration/probes/web-host/src/ProbeIsland.svelte'];
  if (stage === 'kit-client')
    ids.push(
      'migration/probes/web-host/src/ProbeClient.tsx',
      'migration/probes/web-host/src/ProbeChrome.tsx',
      'node_modules/react/cjs/react.production.js',
      'node_modules/react-dom/cjs/react-dom-client.production.js'
    );
  const binding = (path) => ({ path, bytes: 1, sha256: 'a'.repeat(64) });
  return {
    schemaVersion: 1,
    stage,
    outputDirectory: 'output',
    context: REACT_PRODUCTION_CONTEXT,
    overlay: {
      path: 'web/src/routes/+page.svelte',
      sourceSha256: 'a'.repeat(64),
      transformedSha256: 'b'.repeat(64),
    },
    packages: [],
    chunks: [
      {
        fileName: 'entry.mjs',
        file: binding('output/entry.mjs'),
        facade: null,
        modules: ids.map((id) => ({
          id: id === WEB_HOST_CHROME_VIRTUAL_ID ? `\0${id}` : id,
          renderedLength: 1,
          source:
            id === WEB_HOST_CHROME_VIRTUAL_ID
              ? { kind: 'virtual', sha256: 'a'.repeat(64) }
              : { kind: 'file', file: binding(id) },
        })),
        imports: [],
        dynamicImports: [],
        externals: [],
      },
    ],
  };
}

it('requires positive actual contributions rather than zero-length retained module IDs', () => {
  const passes = [contributionPass('kit-server'), contributionPass('kit-client')];
  expect(() => assertRequiredNeutralContributions(passes)).not.toThrow();
  for (const [index, pass] of passes.entries()) {
    for (const module of pass.chunks[0].modules) {
      const changed = structuredClone(passes);
      const target = changed[index].chunks[0].modules.find(
        (candidate) => candidate.id === module.id
      );
      target.renderedLength = 0;
      expect(() => assertRequiredNeutralContributions(changed)).toThrow(/omitted/);
    }
  }
});
