import { expect, it, onTestFinished } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { buildControlCopies } from '../lib/web-host-build.mjs';
import { createOwnedArtifact } from '../lib/web-host-ownership.mjs';
import { captureInputBindings, assertCopyInputs } from '../lib/web-host-inputs.mjs';
import { fileInventory } from '../lib/web-host-files.mjs';
import {
  WEB_HOST_REACT_SOURCE_PATHS,
  WEB_HOST_REACT_RENDERER,
  WEB_HOST_REACT_RENDERER_GRAPH,
  WEB_HOST_REACT_OUTPUT_PATHS,
} from '../../../migration/probes/web-host/host/contract.ts';

const EVIDENCE_TEST_TIMEOUT_MS = 15_000;
const COMPILER_SOURCE = 'migration/probes/web-host/host/compileChrome.ts';
const LIFECYCLE_SOURCE = 'tools/run-web-tool.mjs';

function fixtureCompiler() {
  const production = JSON.stringify(
    join(ROOT, 'migration/probes/web-host/host/reactProduction.ts')
  );
  const chrome = JSON.stringify(join(ROOT, 'migration/probes/web-host/host/chromeHtml.ts'));
  return `import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { bindReactFile } from ${production};
import { REACT_PRODUCTION_CONTEXT } from ${chrome};
const root = process.cwd();
const renderer = ${JSON.stringify(WEB_HOST_REACT_RENDERER)};
mkdirSync(dirname(join(root, renderer)), { recursive: true });
writeFileSync(join(root, renderer), 'throw new Error("seeded renderer failure");\\n');
const source = 'migration/probes/web-host/host/renderChrome.ts';
const graph = { schemaVersion: 1, stage: 'ssr-renderer', outputDirectory: dirname(renderer), context: REACT_PRODUCTION_CONTEXT, overlay: null, packages: [], chunks: [{ fileName: 'renderer.mjs', file: bindReactFile(root, renderer), facade: source, modules: [{ id: source, renderedLength: 1, source: { kind: 'file', file: bindReactFile(root, source) } }], imports: [], dynamicImports: [], externals: [] }] };
writeFileSync(join(root, ${JSON.stringify(WEB_HOST_REACT_RENDERER_GRAPH)}), JSON.stringify(graph) + '\\n');
`;
}

function evidenceFixture() {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-react-error-evidence-')));
  onTestFinished(() => rmSync(parent, { recursive: true, force: true }));
  const owned = createOwnedArtifact(parent);
  const copies = {};
  const sources = new Map(
    WEB_HOST_REACT_SOURCE_PATHS.map((path) => [path, readFileSync(join(ROOT, path))])
  );
  sources.set(COMPILER_SOURCE, Buffer.from(fixtureCompiler()));
  sources.set(LIFECYCLE_SOURCE, Buffer.from('console.log("Fixture lifecycle only");\n'));
  sources.set(
    'package.json',
    Buffer.from(
      JSON.stringify({
        scripts: {
          prebuild: 'node tools/run-web-tool.mjs fixture prebuild',
          build: 'node tools/run-web-tool.mjs vite build',
          postbuild: 'node tools/run-web-tool.mjs fixture postbuild',
        },
      })
    )
  );
  for (const role of ['reference', 'control', 'neutral']) {
    const root = join(owned.root, role);
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    for (const [path, bytes] of sources) {
      const output = join(root, path);
      mkdirSync(join(output, '..'), { recursive: true });
      writeFileSync(output, bytes);
    }
    copies[role] = root;
  }
  const snapshot = {
    entries: fileInventory(copies.reference).map((row) => ({
      path: row.path,
      sha256: row.sha256,
      link: row.link,
      executable: !!(row.mode & 0o111),
    })),
  };
  const bindings = captureInputBindings(owned, snapshot, 'neutral-embedded');
  return { owned, copies, bindings };
}

it(
  'retains the real successful fixture compiler receipt and frozen outputs after renderer failure',
  async () => {
    const fixture = evidenceFixture();
    let failure;
    try {
      await buildControlCopies({
        ...fixture,
        artifact: 'release',
        pinnedMetadata: { NPM_CONFIG_UPDATE_NOTIFIER: 'false' },
        request: { variant: 'neutral-embedded', artifact: 'release', fixture: 'matching' },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure?.childRecord?.label).toBe('neutral-react-render');
    expect(failure.childRecord.code).toBe(1);
    const state = failure.webHostBuild;
    const compile = state.children.find((child) => child.label === 'neutral-react-compile');
    expect(compile?.code).toBe(0);
    expect(compile.logPath).toContain(fixture.owned.root);
    expect(state.failedChild).toBe(failure.childRecord);
    expect(state.bindings.roles.neutral.react.outputs.map((row) => row.path).sort()).toEqual(
      [...WEB_HOST_REACT_OUTPUT_PATHS].sort()
    );
    expect(() => assertCopyInputs(fixture.owned, state.bindings, 'neutral')).not.toThrow();
    const renderer = join(fixture.copies.neutral, WEB_HOST_REACT_RENDERER);
    const bytes = readFileSync(renderer);
    writeFileSync(renderer, 'throw new Error("changed renderer bytes");\n');
    expect(() => assertCopyInputs(fixture.owned, state.bindings, 'neutral')).toThrow(
      /Bound React renderer changed/
    );
    writeFileSync(renderer, bytes);
    expect(() => assertCopyInputs(fixture.owned, state.bindings, 'neutral')).not.toThrow();
  },
  EVIDENCE_TEST_TIMEOUT_MS
);
