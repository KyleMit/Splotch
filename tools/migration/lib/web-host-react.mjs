import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import {
  WEB_HOST_ENV,
  WEB_HOST_NEUTRAL_COPY_ROLE,
  WEB_HOST_REACT_RENDERER,
  WEB_HOST_REACT_RENDERER_GRAPH,
  WEB_HOST_REACT_CHROME,
  webHostRequest,
} from '../../../migration/probes/web-host/host/contract.ts';
import {
  chromeDigest,
  makeRenderRequest,
  readRenderRequest,
  writeRenderRequest,
  readRenderedChrome,
} from '../../../migration/probes/web-host/host/chromeHtml.ts';
import { assertReactGraph } from '../../../migration/probes/web-host/host/reactGraph.ts';
import {
  assertCopyInputs,
  freezeReactRendererInputs,
  freezeReactSourceInputs,
} from './web-host-inputs.mjs';
import { assertOwnedArtifact, ownedPath } from './web-host-ownership.mjs';
import { runCopiedChild } from './web-host-build.mjs';

export async function prepareReactChrome({ owned, bindings, copyRoot, env }) {
  assertOwnedArtifact(owned);
  if (
    realpathSync(copyRoot) !== join(owned.root, WEB_HOST_NEUTRAL_COPY_ROLE) ||
    env[WEB_HOST_ENV.copyRoot] !== copyRoot ||
    env[WEB_HOST_ENV.artifactRoot] !== owned.root ||
    env[WEB_HOST_ENV.token] !== owned.token
  )
    throw new Error('React preparation requires its owned neutral copy');
  const request = webHostRequest({
    variant: env[WEB_HOST_ENV.variant],
    artifact: env[WEB_HOST_ENV.artifact],
    fixture: env[WEB_HOST_ENV.fixture],
    capacitor: env.CAPACITOR,
    perfMarks: env.PERF_MARKS,
    harness: env.PUBLIC_ENABLE_DEV_HARNESS,
  });
  if (request.variant !== 'neutral-embedded')
    throw new Error('React preparation requires the neutral variant');
  const productionEnv = { ...env, NODE_ENV: 'production' };
  let current = freezeReactSourceInputs(owned, bindings);
  const children = [];
  try {
    const compile = await runCopiedChild({
      owned,
      copyRoot,
      env: productionEnv,
      label: 'neutral-react-compile',
      command: process.execPath,
      args: ['--experimental-strip-types', 'migration/probes/web-host/host/compileChrome.ts'],
    });
    children.push(compile);
    current = freezeReactRendererInputs(owned, current);
    const graph = assertReactGraph(
      copyRoot,
      JSON.parse(readFileSync(join(copyRoot, WEB_HOST_REACT_RENDERER_GRAPH), 'utf8')),
      'ssr-renderer'
    );
    const renderRequest = makeRenderRequest(copyRoot, request, graph.context);
    const requestSha256 = writeRenderRequest(owned, renderRequest);
    const renderEnv = { ...productionEnv, [WEB_HOST_ENV.renderRequestSha256]: requestSha256 };
    assertCopyInputs(owned, current, WEB_HOST_NEUTRAL_COPY_ROLE);
    readRenderRequest(owned, copyRoot, requestSha256);
    const render = await runCopiedChild({
      owned,
      copyRoot,
      env: renderEnv,
      label: 'neutral-react-render',
      command: process.execPath,
      args: [WEB_HOST_REACT_RENDERER],
    });
    children.push(render);
    assertCopyInputs(owned, current, WEB_HOST_NEUTRAL_COPY_ROLE);
    readRenderRequest(owned, copyRoot, requestSha256);
    const chromeSha256 = chromeDigest(readFileSync(ownedPath(owned, WEB_HOST_REACT_CHROME)));
    const chrome = readRenderedChrome(owned, copyRoot, chromeSha256, requestSha256);
    return {
      bindings: current,
      children,
      graph,
      renderRequest,
      requestSha256,
      chromeSha256,
      chrome,
      env: { ...renderEnv, [WEB_HOST_ENV.chromeSha256]: chromeSha256 },
    };
  } catch (error) {
    error.webHostReactPreparation = { bindings: current, children };
    throw error;
  }
}
