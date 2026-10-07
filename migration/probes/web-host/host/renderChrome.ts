import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ProbeChrome } from '../src/ProbeChrome.tsx';
import { serverStore } from './serverStore.ts';
import {
  WEB_HOST_ENV,
  WEB_HOST_NEUTRAL_COPY_ROLE,
  WEB_HOST_JSX,
  webHostRequest,
} from './contract.ts';
import { readRenderRequest, writeRenderedChrome } from './chromeHtml.ts';
import { collectLoadedReactFiles, assertReactBuildContext } from './reactProduction.ts';

const copyRoot = realpathSync(process.env[WEB_HOST_ENV.copyRoot] ?? '');
const root = realpathSync(process.env[WEB_HOST_ENV.artifactRoot] ?? '');
const token = process.env[WEB_HOST_ENV.token];
if (
  typeof token !== 'string' ||
  !token ||
  copyRoot !== join(root, WEB_HOST_NEUTRAL_COPY_ROLE) ||
  realpathSync(process.cwd()) !== copyRoot ||
  resolve(import.meta.dirname, '../../../..') !== copyRoot
)
  throw new Error('SSR renderer is not running in its owned neutral copy');
const request = readRenderRequest(
  { root, token },
  copyRoot,
  process.env[WEB_HOST_ENV.renderRequestSha256]
);
const flags = webHostRequest({
  variant: process.env[WEB_HOST_ENV.variant],
  artifact: process.env[WEB_HOST_ENV.artifact],
  fixture: process.env[WEB_HOST_ENV.fixture],
  capacitor: process.env.CAPACITOR,
  perfMarks: process.env.PERF_MARKS,
  harness: process.env.PUBLIC_ENABLE_DEV_HARNESS,
});
if (JSON.stringify(flags) !== JSON.stringify(request.request))
  throw new Error('Renderer invocation disagrees with its published request');
const html = renderToString(
  createElement(ProbeChrome, {
    store: serverStore,
    initialPendingLabel: request.pendingLabel,
    onAdopted: () => {},
  }),
  { identifierPrefix: request.identifierPrefix }
);
const loadedReactFiles = collectLoadedReactFiles(
  copyRoot,
  Object.keys(createRequire(import.meta.url).cache)
);
assertReactBuildContext({
  mode: 'production',
  nodeEnv: process.env.NODE_ENV,
  isProduction: process.env.NODE_ENV === 'production',
  perfMarks: process.env.PERF_MARKS,
  jsx: WEB_HOST_JSX,
});
writeRenderedChrome(
  { root, token },
  String(process.env[WEB_HOST_ENV.renderRequestSha256]),
  html,
  loadedReactFiles
);
