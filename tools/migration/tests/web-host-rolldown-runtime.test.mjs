import { expect, it, onTestFinished } from 'vitest';
import { rolldownVersion } from 'vite';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT } from '../../lib/proc.mjs';
import { createOwnedArtifact } from '../lib/web-host-ownership.mjs';

const CONTROL_TIMEOUT_MS = 20_000;
const GRAPH_OWNER = 'migration/probes/web-host/host/reactGraph.ts';
const RUNTIME_OWNER = 'migration/probes/web-host/host/rolldownRuntime.ts';
const ENTRY_FIXTURE_SPECIFIER = './value.cjs';
const DRIVER = String.raw`
import assert from 'node:assert/strict';
import { chmodSync, linkSync, lstatSync, mkdtempSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [copyRoot, ownedRoot, token, platform, graphOwner, runtimeOwner, evidenceOwner, htmlOwner, pageOwner, fileOwner, contractOwner] = process.argv.slice(2);
const { build, VERSION, RUNTIME_MODULE_ID } = await import(pathToFileURL(join(copyRoot, 'node_modules/rolldown/dist/index.mjs')));
const { captureReactGraph, assertReactGraph } = await import(pathToFileURL(graphOwner));
const { createRolldownRuntimeCapture, assertRolldownRuntimeSource } = await import(pathToFileURL(runtimeOwner));
const { assertNeutralEvidence } = await import(pathToFileURL(evidenceOwner));
const { chromeDigest, REACT_PRODUCTION_CONTEXT } = await import(pathToFileURL(htmlOwner));
const { overlayPageSource } = await import(pathToFileURL(pageOwner));
const { bindReactFile } = await import(pathToFileURL(fileOwner));
const { WEB_HOST_NEUTRAL_PASSES, WEB_HOST_REACT_RENDER_REQUEST } = await import(pathToFileURL(contractOwner));
const MISSING_REEXPORT_SPECIFIER = './other.mjs';
const stage = platform === 'browser' ? 'kit-client' : 'ssr-renderer';
const overlay = platform === 'browser' ? overlayPageSource(readFileSync(join(copyRoot, 'web/src/routes/+page.svelte'), 'utf8')).binding : null;
const runtime = createRolldownRuntimeCapture(copyRoot, VERSION);
let checks = 0;
const oppositePlatform = platform === 'browser' ? 'node' : 'browser';
const oppositeStage = oppositePlatform === 'browser' ? 'kit-client' : 'ssr-renderer';
const oppositeRuntime = createRolldownRuntimeCapture(copyRoot, VERSION);
let oppositeSource;
await build({ cwd: copyRoot, input: join(copyRoot, 'source/entry.js'), platform: oppositePlatform,
  output: { dir: join(copyRoot, 'opposite-output'), format: 'es', minify: true },
  plugins: [oppositeRuntime.plugin, { name: 'capture-opposite-real-runtime', writeBundle(_options, bundle) {
    const actual = Object.values(bundle).filter(chunk => chunk.type === 'chunk')
      .flatMap(chunk => Object.entries(chunk.modules)).find(([id]) => id === RUNTIME_MODULE_ID);
    assert.ok(actual);
    oppositeSource = oppositeRuntime.source(actual[0], actual[1].code, oppositeStage);
    assert.deepEqual(assertRolldownRuntimeSource(copyRoot, actual[0], oppositeSource, actual[1].renderedLength, oppositeStage), oppositeSource);
    checks++;
  } }],
});
assert.ok(oppositeSource);
await assert.rejects(build({ cwd: copyRoot, input: join(copyRoot, 'source/entry.js'), platform: 'browser',
  output: { dir: join(copyRoot, 'unsupported-output'), format: 'cjs', minify: true },
  plugins: [createRolldownRuntimeCapture(copyRoot, VERSION).plugin],
}), /actual ESM browser or Node output target/); checks++;
let graph;
await build({ cwd: copyRoot, input: join(copyRoot, 'source/entry.js'), platform,
  output: { dir: join(copyRoot, 'output'), format: 'es', minify: true },
  plugins: [runtime.plugin, { name: 'real-runtime-graph-controls', async writeBundle(_options, bundle) {
    const request = { copyRoot, outputDirectory: join(copyRoot, 'output'), stage, overlay,
      context: REACT_PRODUCTION_CONTEXT, kitConfig: null, bundle, plugin: this, runtime };
    graph = await captureReactGraph(request);
    assert.deepEqual(assertReactGraph(copyRoot, graph, stage), graph); checks++;
    const module = graph.chunks.flatMap(chunk => chunk.modules).find(row => row.source.kind === 'rolldown-runtime');
    assert.ok(module && module.renderedLength > 0 && module.source.renderedCode); checks++;
    const rawApiRow = Object.values(bundle).filter(chunk => chunk.type === 'chunk')
      .flatMap(chunk => Object.entries(chunk.modules)).find(([id]) => id === module.id);
    assert.equal(rawApiRow[1].code, module.source.renderedCode); checks++;
    assert.equal(this.getModuleInfo(module.id), null); checks++;
    const inherited = { ...runtime, source() { return null; } };
    await assert.rejects(captureReactGraph({ ...request, runtime: inherited }), /no canonical source binding/); checks++;
    const missing = createRolldownRuntimeCapture(copyRoot, VERSION);
    await assert.rejects(captureReactGraph({ ...request, runtime: missing }), /observed generating transform source/); checks++;
    const renamed = Object.fromEntries(Object.entries(bundle).map(([name, chunk]) => [name,
      chunk.type === 'chunk' ? { ...chunk, modules: Object.fromEntries(Object.entries(chunk.modules)
        .map(([id, row]) => [id === module.id ? '\0unrelated-unbound-runtime' : id, row])) } : chunk]));
    await assert.rejects(captureReactGraph({ ...request, bundle: renamed }), /no canonical source binding/); checks++;
    const source = module.source;
    const validate = value => assertRolldownRuntimeSource(copyRoot, module.id, value, module.renderedLength, stage);
    assert.deepEqual(validate(source), source); checks++;
    assert.throws(() => validate({ ...source, rawCode: oppositeSource.rawCode, rawSha256: chromeDigest(oppositeSource.rawCode) }), /variant disagrees/); checks++;
    const actualWrongStage = stage === 'kit-client' ? 'ssr-renderer' : 'kit-client';
    await assert.rejects(captureReactGraph({ ...request, stage: actualWrongStage }), /output target disagrees/); checks++;
    for (const rawCode of [readFileSync(join(copyRoot, source.producer.base.path), 'utf8') + '\n',
      source.rawCode + '\n', '\n' + source.rawCode, source.rawCode.replace('export var', 'export let')]) {
      assert.throws(() => validate({ ...source, rawCode, rawSha256: chromeDigest(rawCode) }), /canonical|exact base/); checks++;
    }
    const alias = structuredClone(source);
    alias.producer.native = alias.producer.base;
    assert.throws(() => validate(alias)); checks++;
    const noNative = structuredClone(source);
    delete noNative.producer.native;
    assert.throws(() => validate(noNative), /runtime binding/); checks++;
    assert.throws(() => assertRolldownRuntimeSource(copyRoot, '\0unrelated-runtime', source, module.renderedLength, stage), /actual producer/); checks++;
    const wrongStage = stage === 'kit-client' ? 'ssr-renderer' : 'kit-client';
    assert.throws(() => assertRolldownRuntimeSource(copyRoot, module.id, source, module.renderedLength, wrongStage), /fixed graph stage/); checks++;
    const wrongTarget = { ...source, target: { platform: platform === 'browser' ? 'node' : 'browser', format: 'es' } };
    assert.throws(() => validate(wrongTarget), /fixed graph stage/); checks++;
    const virtual = structuredClone(graph);
    const virtualRow = virtual.chunks.flatMap(chunk => chunk.modules).find(row => row.id === module.id);
    virtualRow.source = { kind: 'virtual', code: source.rawCode, sha256: chromeDigest(source.rawCode) };
    assert.throws(() => assertReactGraph(copyRoot, virtual, stage), /virtual contributor/); checks++;
    const rendered = { ...source, renderedCode: source.renderedCode.replace(/\S/, 'x') };
    assert.throws(() => validate(rendered), /rendered binding/); checks++;
    const apiPath = join(copyRoot, source.producer.api.path);
    const apiBytes = readFileSync(apiPath);
    const apiCode = apiBytes.toString();
    assert.ok(apiCode.includes('export { RUNTIME_MODULE_ID, '));
    const mutations = [
      apiCode.replace('export { RUNTIME_MODULE_ID, ', 'export { OTHER as RUNTIME_MODULE_ID, '),
      apiCode.replace('export { RUNTIME_MODULE_ID, ', 'export { ') + '\nexport { RUNTIME_MODULE_ID } from ' + JSON.stringify(MISSING_REEXPORT_SPECIFIER) + ';\n',
      apiCode.replace('export { RUNTIME_MODULE_ID, ', 'export { type RUNTIME_MODULE_ID, '),
      apiCode.replace('const RUNTIME_MODULE_ID =', 'let RUNTIME_MODULE_ID ='),
    ];
    for (const apiMutation of mutations) {
      assert.notEqual(apiMutation, apiCode);
      try {
        writeFileSync(apiPath, apiMutation);
        const changed = structuredClone(source);
        changed.producer.api = bindReactFile(copyRoot, source.producer.api.path);
        assert.throws(() => validate(changed), /literal exported runtime identity/); checks++;
      } finally { writeFileSync(apiPath, apiBytes); }
    }
    const nativePath = join(copyRoot, source.producer.native.path);
    const nativeBytes = readFileSync(nativePath), nativeStat = lstatSync(nativePath);
    assert.ok(nativeStat.isFile() && nativeStat.nlink === 1);
    const originalIdentity = [nativeStat.dev, nativeStat.ino, nativeStat.mode, nativeStat.nlink];
    const nativeBase = readFileSync(join(copyRoot, source.producer.base.path));
    const nativeIndex = nativeBytes.indexOf(nativeBase);
    assert.ok(nativeIndex >= 0);
    const heldNativePath = join(mkdtempSync(join(dirname(nativePath), 'loaded-native-')), 'original.node');
    const replacementPath = join(dirname(heldNativePath), 'replacement.node');
    const alteredNative = Buffer.from(nativeBytes); alteredNative[nativeIndex] ^= 1;
    const nativeControlErrors = [];
    let originalHeld = false, replacementInstalled = false, replacementIdentity;
    const nativeIdentity = path => {
      const actual = lstatSync(path);
      return [actual.dev, actual.ino, actual.mode, actual.nlink];
    };
    try {
      writeFileSync(replacementPath, alteredNative, { flag: 'wx', mode: nativeStat.mode & 0o777 });
      chmodSync(replacementPath, nativeStat.mode & 0o777);
      replacementIdentity = nativeIdentity(replacementPath);
      assert.notDeepEqual(replacementIdentity, originalIdentity);
      assert.throws(() => linkSync(replacementPath, nativePath), { code: 'EEXIST' }); checks++;
      assert.deepEqual(nativeIdentity(nativePath), originalIdentity);
      assert.deepEqual(readFileSync(nativePath), nativeBytes);
      renameSync(nativePath, heldNativePath); originalHeld = true;
      linkSync(replacementPath, nativePath); replacementInstalled = true;
      unlinkSync(replacementPath);
      const changed = structuredClone(source);
      changed.producer.native = bindReactFile(copyRoot, source.producer.native.path);
      assert.throws(() => validate(changed), /selected native producer/); checks++;
    } catch (error) { nativeControlErrors.push(error); } finally {
      if (originalHeld) {
        try {
          assert.deepEqual(nativeIdentity(heldNativePath), originalIdentity);
          assert.deepEqual(readFileSync(heldNativePath), nativeBytes);
          if (replacementInstalled) assert.deepEqual(nativeIdentity(nativePath), replacementIdentity, 'Occupied native control path');
          else assert.throws(() => lstatSync(nativePath), { code: 'ENOENT' });
          renameSync(heldNativePath, nativePath); originalHeld = false;
          assert.deepEqual(nativeIdentity(nativePath), originalIdentity);
          assert.deepEqual(readFileSync(nativePath), nativeBytes);
          assert.deepEqual(validate(source), source); checks++;
        } catch (error) { nativeControlErrors.push(error); }
      }
    }
    if (nativeControlErrors.length) throw nativeControlErrors.length === 1 ? nativeControlErrors[0] : new AggregateError(nativeControlErrors, 'Native producer control and exact restoration failed');
    const nativeManifestPath = join(copyRoot, source.producer.nativeManifest.path);
    const nativeManifestBytes = readFileSync(nativeManifestPath);
    try {
      const manifest = JSON.parse(nativeManifestBytes); manifest.version = '1.2.12';
      writeFileSync(nativeManifestPath, JSON.stringify(manifest));
      const changed = structuredClone(source);
      changed.producer.nativeManifest = bindReactFile(copyRoot, source.producer.nativeManifest.path);
      assert.throws(() => validate(changed), /package\/version disagree/); checks++;
    } finally { writeFileSync(nativeManifestPath, nativeManifestBytes); }
    const basePath = join(copyRoot, source.producer.base.path);
    const baseBytes = readFileSync(basePath);
    try {
      writeFileSync(basePath, Buffer.concat([baseBytes, Buffer.from('\n')]));
      const changed = structuredClone(source);
      changed.producer.base = bindReactFile(copyRoot, source.producer.base.path);
      changed.rawCode = changed.rawCode.replace(baseBytes.toString(), baseBytes.toString() + '\n');
      changed.rawSha256 = chromeDigest(changed.rawCode);
      assert.throws(() => validate(changed), /canonical|exact base/); checks++;
    } finally { writeFileSync(basePath, baseBytes); }
    const manifestPath = join(copyRoot, source.producer.manifest.path);
    const manifestBytes = readFileSync(manifestPath);
    try {
      const manifest = JSON.parse(manifestBytes); manifest.version = '1.2.12';
      writeFileSync(manifestPath, JSON.stringify(manifest));
      const changed = structuredClone(source);
      changed.producer.manifest = bindReactFile(copyRoot, source.producer.manifest.path);
      assert.throws(() => validate(changed), /package\/version disagree/); checks++;
    } finally { writeFileSync(manifestPath, manifestBytes); }
    try {
      const manifest = JSON.parse(manifestBytes);
      const nativeManifest = JSON.parse(nativeManifestBytes);
      manifest.optionalDependencies[nativeManifest.name] = '1.2.12';
      writeFileSync(manifestPath, JSON.stringify(manifest));
      const changed = structuredClone(source);
      changed.producer.manifest = bindReactFile(copyRoot, source.producer.manifest.path);
      assert.throws(() => validate(changed), /package\/version disagree/); checks++;
    } finally { writeFileSync(manifestPath, manifestBytes); }
    const outputPath = join(copyRoot, graph.chunks[0].file.path);
    const outputBytes = readFileSync(outputPath);
    try {
      writeFileSync(outputPath, Buffer.concat([outputBytes, Buffer.from('\n')]));
      assert.throws(() => assertReactGraph(copyRoot, graph, stage), /changed|digest|bytes/i); checks++;
    } finally { writeFileSync(outputPath, outputBytes); }
    const owned = { root: ownedRoot, token };
    const passPath = join(ownedRoot, WEB_HOST_NEUTRAL_PASSES);
    const passBytes = Buffer.from(JSON.stringify([graph]));
    writeFileSync(passPath, passBytes, { flag: 'wx' });
    const published = chromeDigest(passBytes);
    const evidence = { owned, copyRoot, requestSha256: '0'.repeat(64), chromeSha256: '0'.repeat(64), passesSha256: published };
    const reachesRenderRequest = () => assert.throws(() => assertNeutralEvidence(evidence),
      error => error.code === 'ENOENT' && error.path === join(ownedRoot, WEB_HOST_REACT_RENDER_REQUEST));
    reachesRenderRequest(); checks++;
    const changed = structuredClone(graph);
    const changedRow = changed.chunks.flatMap(chunk => chunk.modules).find(row => row.id === module.id);
    changedRow.source.renderedCode = changedRow.source.renderedCode.replace(/\S/, 'x');
    changedRow.source.renderedSha256 = chromeDigest(changedRow.source.renderedCode);
    writeFileSync(passPath, JSON.stringify([changed]));
    assert.throws(() => assertNeutralEvidence(evidence), /Published neutral pass inventory changed/); checks++;
    writeFileSync(passPath, passBytes);
    reachesRenderRequest(); checks++;
    assert.deepEqual(assertReactGraph(copyRoot, graph, stage), graph); checks++;
  } }],
});
assert.ok(graph);
if (platform === 'node') {
  const { pathToFileURL } = await import('node:url');
  const envOwner = join(graphOwner, '..', 'kitEnvSource.ts');
  const { captureKitEnvConfig, bindKitEnvSource, assertKitEnvSource, assertActualKitEnvGenerator } = await import(pathToFileURL(envOwner));
  const envModule = await import(pathToFileURL(join(copyRoot, 'node_modules/@sveltejs/kit/src/core/env.js')));
  const { process_config } = await import(pathToFileURL(join(copyRoot, 'node_modules/@sveltejs/kit/src/core/config/index.js')));
  const actualOptions = process_config({ kit: {} }, { cwd: join(copyRoot, 'web') });
  const kitConfig = captureKitEnvConfig(copyRoot, { plugins: [{ name: 'vite-plugin-sveltekit-setup', api: { options: actualOptions } }] });
  for (const changedOptions of [
    { ...actualOptions, kit: { ...actualOptions.kit, files: { ...actualOptions.kit.files, src: join(copyRoot, 'alternate') } } },
    { ...actualOptions, kit: { ...actualOptions.kit, experimental: { ...actualOptions.kit.experimental, explicitEnvironmentVariables: true } } },
  ]) {
    assert.throws(() => captureKitEnvConfig(copyRoot, { plugins: [{ name: 'vite-plugin-sveltekit-setup', api: { options: changedOptions } }] }), /fixed normalized config/); checks++;
  }
  assert.throws(() => captureKitEnvConfig(copyRoot, { plugins: [] }), /actual setup plugin/); checks++;
  const envCode = envModule.create_sveltekit_env(null, {}, null);
  await assertActualKitEnvGenerator(copyRoot, envCode); checks++;
  await assert.rejects(assertActualKitEnvGenerator(copyRoot, envCode + '\n'), /actual generator disagrees/); checks++;
  const envId = '\0virtual:__sveltekit/env';
  const boundEnv = bindKitEnvSource(copyRoot, envId, envCode, kitConfig);
  assert.ok(boundEnv); assert.deepEqual(assertKitEnvSource(copyRoot, envId, boundEnv), boundEnv); checks++;
  for (const mutation of [envCode + '\n', envCode.replace('const variables = {};', 'const variables = { injected: true };')]) {
    const changed = { ...boundEnv, code: mutation, sha256: chromeDigest(mutation) };
    assert.throws(() => assertKitEnvSource(copyRoot, envId, changed), /bound generator/); checks++;
  }
  assert.throws(() => assertKitEnvSource(copyRoot, '\0unrelated-env', boundEnv), /binding/); checks++;
  for (const key of ['sourceDirectory', 'explicitEnvironmentVariables', 'entry']) {
    const changed = structuredClone(boundEnv); changed.config[key] = 'altered';
    assert.throws(() => assertKitEnvSource(copyRoot, envId, changed), /fixed normalized config/); checks++;
  }
  for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    const member = boundEnv.producer[index]; const path = join(copyRoot, member.path); const bytes = readFileSync(path);
    try {
      writeFileSync(path, Buffer.concat([bytes, Buffer.from('\n')]));
      const changed = structuredClone(boundEnv); changed.producer[index] = bindReactFile(copyRoot, member.path);
      assert.throws(() => assertKitEnvSource(copyRoot, envId, changed), /exact installed producer/); checks++;
    } finally { writeFileSync(path, bytes); }
  }
  for (const index of [9, 10]) {
    const member = boundEnv.producer[index]; const path = join(copyRoot, member.path); const bytes = readFileSync(path); const code = bytes.toString();
    const mutations = index === 9 ? [
      code.replace('kit: {', 'kit: { files: { src: "alternate" },'),
      code.replace('const config =', 'let config ='),
      code + '\nconfig.kit.files = { src: "alternate" };\n',
      code + '\nconst alias = config; alias.kit.experimental = { explicitEnvironmentVariables: true };\n',
      code.replace('kit: {', 'kit: { __proto__: { files: { src: "alternate" } },'),
      code.replace('kit: {', 'kit: { __proto__: { experimental: { explicitEnvironmentVariables: true } },'),
      code + '\nObject.prototype.files = { src: "alternate" };\n',
    ] : [code.replace('sveltekit()', 'sveltekit({})'), code + '\nconst alias = sveltekit;\n'];
    for (const mutation of mutations) {
      assert.notEqual(mutation, code);
      try {
        writeFileSync(path, mutation);
        const changed = structuredClone(boundEnv); changed.producer[index] = bindReactFile(copyRoot, member.path);
        assert.throws(() => assertKitEnvSource(copyRoot, envId, changed), /exact installed producer/); checks++;
      } finally { writeFileSync(path, bytes); }
      assert.deepEqual(assertKitEnvSource(copyRoot, envId, boundEnv), boundEnv); checks++;
    }
  }
  const explicitPath = join(copyRoot, 'web/src/env.ts');
  try { writeFileSync(explicitPath, 'export const variables = {};');
    assert.throws(() => assertKitEnvSource(copyRoot, envId, boundEnv), /actual explicit entry absence/); checks++;
  } finally { (await import('node:fs')).unlinkSync(explicitPath); }
  const reversedProducer = structuredClone(boundEnv); reversedProducer.producer.reverse();
  assert.deepEqual(assertKitEnvSource(copyRoot, envId, reversedProducer), boundEnv); checks++;
  const unrelatedProducer = structuredClone(boundEnv); unrelatedProducer.producer[1] = bindReactFile(copyRoot, 'source/entry.js');
  assert.throws(() => assertKitEnvSource(copyRoot, envId, unrelatedProducer), /producer/); checks++;
  const omittedProducer = structuredClone(boundEnv); omittedProducer.producer.pop();
  assert.throws(() => assertKitEnvSource(copyRoot, envId, omittedProducer), /producer/); checks++;
  const aliasedProducer = structuredClone(boundEnv); aliasedProducer.producer[1] = aliasedProducer.producer[0];
  assert.throws(() => assertKitEnvSource(copyRoot, envId, aliasedProducer),
    error => error instanceof Error && error.message === 'Duplicate React input binding: ' + boundEnv.producer[0].path); checks++;
  assert.deepEqual(assertKitEnvSource(copyRoot, envId, boundEnv), boundEnv); checks++;
  const fixtures = [
    ['first.js', 'export const first = 1;'], ['second.js', 'export const second = 2;'],
    ['third.js', 'export const third = 3;'], ['fourth.js', 'export const fourth = 4;'],
  ];
  for (const [name, code] of fixtures) writeFileSync(join(copyRoot, 'source', name), code);
  const facadeInputs = Object.fromEntries(fixtures.map(([name]) => [name.slice(0, -3), join(copyRoot, 'source', name)]));
  const bridgeRuntime = createRolldownRuntimeCapture(copyRoot, VERSION);
  let bridgeGraph;
  await build({ cwd: copyRoot, input: facadeInputs, platform: 'node', preserveEntrySignatures: 'strict',
    output: { dir: join(copyRoot, 'bridge-output'), format: 'es', codeSplitting: { groups: [{ name: 'shared', test: /source\/.*\.js$/ }] } },
    plugins: [bridgeRuntime.plugin, { name: 'actual-facade-capture', async writeBundle(_options, bundle) {
      bridgeGraph = await captureReactGraph({ copyRoot, outputDirectory: join(copyRoot, 'bridge-output'), stage: 'ssr-renderer',
        kitConfig: null, overlay: null, context: REACT_PRODUCTION_CONTEXT, bundle, plugin: this, runtime: bridgeRuntime });
      assert.deepEqual(assertReactGraph(copyRoot, bridgeGraph, 'ssr-renderer'), bridgeGraph); checks++;
      const actualFacades = Object.values(bundle).filter(chunk => chunk.type === 'chunk' && !Object.keys(chunk.modules).length);
      const actualFacade = actualFacades[0]; const originalFacadeId = actualFacade.facadeModuleId;
      try {
        actualFacade.facadeModuleId = actualFacades.find(chunk => chunk.facadeModuleId !== originalFacadeId).facadeModuleId;
        await assert.rejects(captureReactGraph({ copyRoot, outputDirectory: join(copyRoot, 'bridge-output'), stage: 'ssr-renderer',
          kitConfig: null, overlay: null, context: REACT_PRODUCTION_CONTEXT, bundle, plugin: this, runtime: bridgeRuntime }), /actual compiler source exports/); checks++;
      } finally { actualFacade.facadeModuleId = originalFacadeId; }
      assert.deepEqual(await captureReactGraph({ copyRoot, outputDirectory: join(copyRoot, 'bridge-output'), stage: 'ssr-renderer',
        kitConfig: null, overlay: null, context: REACT_PRODUCTION_CONTEXT, bundle, plugin: this, runtime: bridgeRuntime }), bridgeGraph); checks++;
      const facades = bridgeGraph.chunks.filter(chunk => !chunk.modules.length);
      assert.equal(facades.length, 4); checks++;
      for (const facade of facades) {
        const targets = bridgeGraph.chunks.filter(target => facade.imports.includes(target.fileName));
        assert.ok(targets.some(target => target.modules.some(module => module.id === facade.facade && module.renderedLength > 0))); checks++;
      }
    } }],
  });
  assert.ok(bridgeGraph);
  const virtualRuntime = createRolldownRuntimeCapture(copyRoot, VERSION);
  let virtualGraph;
  await build({ cwd: copyRoot, input: { env: envId, first: facadeInputs.first }, platform: 'node', preserveEntrySignatures: 'strict',
    output: { dir: join(copyRoot, 'env-output'), format: 'es', codeSplitting: { groups: [{ name: 'env-owner', test: id => id === envId || id === facadeInputs.first }] } },
    plugins: [virtualRuntime.plugin, { name: 'actual-env-source', resolveId(id) { return id === envId ? id : null; }, load(id) { return id === envId ? envCode : null; } },
      { name: 'actual-env-facade-capture', async writeBundle(_options, bundle) {
        assert.ok(Object.values(bundle).some(chunk => chunk.type === 'chunk' && !Object.keys(chunk.modules).length && chunk.facadeModuleId === envId)); checks++;
        virtualGraph = await captureReactGraph({ copyRoot, outputDirectory: join(copyRoot, 'env-output'), stage: 'ssr-renderer',
          kitConfig, overlay: null, context: REACT_PRODUCTION_CONTEXT, bundle, plugin: this, runtime: virtualRuntime });
        assert.deepEqual(assertReactGraph(copyRoot, virtualGraph, 'ssr-renderer'), virtualGraph); checks++;
        assert.ok(virtualGraph.chunks.some(chunk => !chunk.modules.length && chunk.facade === envId)); checks++;
      } }],
  });
  const unknownId = '\0unrelated-env'; const unknownRuntime = createRolldownRuntimeCapture(copyRoot, VERSION);
  await assert.rejects(build({ cwd: copyRoot, input: { env: unknownId, first: facadeInputs.first }, platform: 'node', preserveEntrySignatures: 'strict',
    output: { dir: join(copyRoot, 'unknown-env-output'), format: 'es', codeSplitting: { groups: [{ name: 'unknown-owner', test: id => id === unknownId || id === facadeInputs.first }] } },
    plugins: [unknownRuntime.plugin, { name: 'unrelated-virtual-source', resolveId(id) { return id === unknownId ? id : null; }, load(id) { return id === unknownId ? envCode : null; } },
      { name: 'unrelated-virtual-facade-capture', async writeBundle(_options, bundle) {
        assert.ok(Object.values(bundle).some(chunk => chunk.type === 'chunk' && !Object.keys(chunk.modules).length && chunk.facadeModuleId === unknownId)); checks++;
        await captureReactGraph({ copyRoot, outputDirectory: join(copyRoot, 'unknown-env-output'), stage: 'ssr-renderer', kitConfig: null,
          overlay: null, context: REACT_PRODUCTION_CONTEXT, bundle, plugin: this, runtime: unknownRuntime });
      } }],
  }), /qualified positive direct source/); checks++;
  assert.ok(virtualGraph);
  const changed = structuredClone(virtualGraph);
  const owner = changed.chunks.flatMap(chunk => chunk.modules).find(module => module.id === envId);
  owner.source = { kind: 'virtual', code: envCode, sha256: chromeDigest(envCode) };
  assert.throws(() => assertReactGraph(copyRoot, changed, 'ssr-renderer'), /qualified positive direct source/); checks++;
  assert.deepEqual(assertReactGraph(copyRoot, virtualGraph, 'ssr-renderer'), virtualGraph); checks++;
}
console.log(JSON.stringify({ scope: 'Actual owned tiny Rolldown runtime capture/reader and published-pass guards; no complete neutral host or release acceptance', platform, checks, runtime: graph.chunks.flatMap(chunk => chunk.modules).filter(row => row.source.kind === 'rolldown-runtime').map(row => ({ id: row.id, target: row.source.target, rawBytes: Buffer.byteLength(row.source.rawCode), renderedLength: row.renderedLength, producer: row.source.producer })) }));
`;

function fixture() {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-rolldown-runtime-')));
  onTestFinished(({ task }) => {
    if (task.result?.state === 'pass') rmSync(parent, { recursive: true, force: true });
  });
  const owned = createOwnedArtifact(parent);
  const copyRoot = join(owned.root, 'neutral');
  mkdirSync(join(copyRoot, 'node_modules'), { recursive: true });
  const optional = JSON.parse(
    readFileSync(join(ROOT, 'node_modules/rolldown/package.json'))
  ).optionalDependencies;
  const selected = Object.entries(createRequire(join(ROOT, 'package.json')).cache)
    .filter(
      ([path, module]) =>
        module?.loaded === true &&
        path.endsWith('.node') &&
        path.startsWith(join(ROOT, 'node_modules/@rolldown/binding-'))
    )
    .map(([path]) => ({
      path,
      package: JSON.parse(readFileSync(join(dirname(path), 'package.json'))),
    }))
    .filter((row) => optional[row.package.name] === rolldownVersion);
  expect(selected).toHaveLength(1);
  for (const name of [
    'vite',
    'picomatch',
    'tinyglobby',
    'fdir',
    'rolldown',
    '@rolldown/pluginutils',
    selected[0].package.name,
    '@sveltejs/kit',
    'svelte',
    '@jridgewell/gen-mapping',
    '@jridgewell/remapping',
    '@jridgewell/resolve-uri',
    '@jridgewell/sourcemap-codec',
    '@jridgewell/trace-mapping',
    '@sveltejs/acorn-typescript',
    'acorn',
    'aria-query',
    'axobject-query',
    'esrap',
    'is-reference',
    'locate-character',
    'magic-string',
    'zimmerframe',
    'devalue',
    'esm-env',
    'set-cookie-parser',
    'kleur',
  ]) {
    const target = join(copyRoot, 'node_modules', name);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(ROOT, 'node_modules', name), target, { recursive: true });
  }
  writeFileSync(join(copyRoot, 'package.json'), '{"type":"module"}');
  mkdirSync(join(copyRoot, 'source'));
  writeFileSync(
    join(copyRoot, 'source/entry.js'),
    'import value from ' +
      JSON.stringify(ENTRY_FIXTURE_SPECIFIER) +
      '; export const answer = value.answer;'
  );
  writeFileSync(join(copyRoot, 'source/value.cjs'), 'module.exports = { answer: 42 };');
  mkdirSync(join(copyRoot, 'web/src/routes'), { recursive: true });
  writeFileSync(
    join(copyRoot, 'web/src/routes/+page.svelte'),
    readFileSync(join(ROOT, 'web/src/routes/+page.svelte'))
  );
  for (const name of ['svelte.config.js', 'vite.config.ts'])
    cpSync(join(ROOT, 'web', name), join(copyRoot, 'web', name));
  const driver = join(parent, 'driver.mjs');
  writeFileSync(driver, DRIVER);
  return { owned, copyRoot, driver };
}

it.each(['browser', 'node'])(
  'binds the real %s runtime and rejects altered or unbound contributors and receipts',
  (platform) => {
    const { owned, copyRoot, driver } = fixture();
    const outcome = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--disable-warning=ExperimentalWarning',
        driver,
        copyRoot,
        owned.root,
        owned.token,
        platform,
        ...[
          GRAPH_OWNER,
          RUNTIME_OWNER,
          'migration/probes/web-host/host/neutralEvidence.ts',
          'migration/probes/web-host/host/chromeHtml.ts',
          'migration/probes/web-host/host/pageOverlay.ts',
          'migration/probes/web-host/host/reactProduction.ts',
          'migration/probes/web-host/host/contract.ts',
        ].map((path) => join(ROOT, path)),
      ],
      {
        cwd: copyRoot,
        encoding: 'utf8',
        timeout: CONTROL_TIMEOUT_MS,
        env: {
          PATH: dirname(process.execPath) + ':/usr/bin:/bin',
          NODE_ENV: 'production',
          NODE_DISABLE_COMPILE_CACHE: '1',
          CI: 'true',
        },
      }
    );
    expect({
      status: outcome.status,
      signal: outcome.signal,
      error: outcome.error?.message,
      stderr: outcome.stderr,
    }).toEqual({ status: 0, signal: null, error: undefined, stderr: '' });
    const result = JSON.parse(outcome.stdout);
    expect(result.platform).toBe(platform);
    expect(result.checks).toBeGreaterThanOrEqual(35);
    expect(result.runtime).toHaveLength(1);
  },
  CONTROL_TIMEOUT_MS
);
