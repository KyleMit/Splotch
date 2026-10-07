import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ownedPath,
  assertOwnedArtifact,
} from '../../../../tools/migration/lib/web-host-ownership.mjs';
import {
  WEB_HOST_REACT_CHROME,
  WEB_HOST_REACT_RENDER_REQUEST,
  WEB_HOST_REACT_RENDERER,
  WEB_HOST_REACT_RENDERER_GRAPH,
  WEB_HOST_REACT_SOURCE_PATHS,
  WEB_HOST_JSX,
  webHostRequest,
  type WebHostRequest,
} from './contract.ts';
import { PROBE_IDENTIFIER_PREFIX, PROBE_PENDING_LABEL } from '../src/probeProps.ts';
import {
  assertReactBuildContext,
  assertReactFileBindings,
  bindReactFile,
  collectLoadedReactFiles,
  type ReactFileBinding,
  type ReactBuildContext,
} from './reactProduction.ts';

const PROBE_TEXT_SEPARATOR_HTML_COMMENT = '<!-- -->';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

interface OwnedArtifact {
  root: string;
  token: string;
}
type NeutralRequest = Extract<WebHostRequest, { variant: 'neutral-embedded' }>;
export interface ReactRenderRequest {
  schemaVersion: 1;
  request: NeutralRequest;
  identifierPrefix: typeof PROBE_IDENTIFIER_PREFIX;
  pendingLabel: typeof PROBE_PENDING_LABEL;
  context: ReactBuildContext;
  sources: ReactFileBinding[];
  renderer: ReactFileBinding;
  graph: ReactFileBinding;
}
export interface RenderedChrome {
  schemaVersion: 1;
  requestSha256: string;
  html: string;
  htmlBytes: number;
  htmlSha256: string;
  loadedReactFiles: ReactFileBinding[];
}

export function chromeDigest(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function record(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== [...keys].sort().join()
  )
    throw new Error(`Malformed ${label}`);
  return value as Record<string, unknown>;
}

export function validateChromeHtml(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('SSR chrome HTML is missing');
  const html = value.replaceAll(PROBE_TEXT_SEPARATOR_HTML_COMMENT, '');
  if (html.includes('<!') || html.includes('<?'))
    throw new Error('SSR chrome contains a raw declaration, comment or processing instruction');
  return value;
}

export function makeRenderRequest(
  copyRoot: string,
  request: NeutralRequest,
  context: unknown
): ReactRenderRequest {
  return assertRenderRequest(copyRoot, {
    schemaVersion: 1,
    request,
    identifierPrefix: PROBE_IDENTIFIER_PREFIX,
    pendingLabel: PROBE_PENDING_LABEL,
    context,
    sources: WEB_HOST_REACT_SOURCE_PATHS.map((path) => bindReactFile(copyRoot, path)),
    renderer: bindReactFile(copyRoot, WEB_HOST_REACT_RENDERER),
    graph: bindReactFile(copyRoot, WEB_HOST_REACT_RENDERER_GRAPH),
  });
}

function assertRenderRequest(copyRoot: string, value: unknown): ReactRenderRequest {
  const parsed = record(
    value,
    [
      'schemaVersion',
      'request',
      'identifierPrefix',
      'pendingLabel',
      'context',
      'sources',
      'renderer',
      'graph',
    ],
    'React render request'
  );
  const flags = record(parsed.request, ['variant', 'artifact', 'fixture'], 'neutral request');
  const request = webHostRequest({
    ...flags,
    variant: flags.variant,
    artifact: flags.artifact,
    fixture: flags.fixture,
    capacitor: 'false',
    perfMarks: 'false',
    harness: flags.artifact === 'mechanism' ? 'true' : 'false',
  });
  if (
    parsed.schemaVersion !== 1 ||
    request.variant !== 'neutral-embedded' ||
    parsed.identifierPrefix !== PROBE_IDENTIFIER_PREFIX ||
    parsed.pendingLabel !== PROBE_PENDING_LABEL
  )
    throw new Error('React SSR request changed its version, props or identifier prefix');
  const sources = assertReactFileBindings(copyRoot, parsed.sources);
  if (
    sources
      .map((file) => file.path)
      .sort()
      .join() !== [...WEB_HOST_REACT_SOURCE_PATHS].sort().join()
  )
    throw new Error('React SSR request omitted its maintained source owners');
  const [renderer] = assertReactFileBindings(copyRoot, [parsed.renderer]);
  const [graph] = assertReactFileBindings(copyRoot, [parsed.graph]);
  if (renderer.path !== WEB_HOST_REACT_RENDERER || graph.path !== WEB_HOST_REACT_RENDERER_GRAPH)
    throw new Error('React SSR request changed the compiled renderer or graph owner');
  return {
    schemaVersion: 1,
    request,
    identifierPrefix: PROBE_IDENTIFIER_PREFIX,
    pendingLabel: PROBE_PENDING_LABEL,
    context: assertReactBuildContext(parsed.context),
    sources,
    renderer,
    graph,
  };
}

function readBoundJson(owned: OwnedArtifact, path: string, expectedSha256: unknown): unknown {
  assertOwnedArtifact(owned);
  if (typeof expectedSha256 !== 'string' || !SHA256_PATTERN.test(expectedSha256))
    throw new Error(`Missing published input digest: ${path}`);
  const bytes = readFileSync(ownedPath(owned, path));
  if (chromeDigest(bytes) !== expectedSha256) throw new Error(`Published input changed: ${path}`);
  return JSON.parse(bytes.toString('utf8'));
}

export function writeRenderRequest(owned: OwnedArtifact, request: ReactRenderRequest): string {
  const bytes = `${JSON.stringify(request, null, 2)}\n`;
  writeFileSync(ownedPath(owned, WEB_HOST_REACT_RENDER_REQUEST), bytes, { flag: 'wx' });
  return chromeDigest(bytes);
}

export function readRenderRequest(
  owned: OwnedArtifact,
  copyRoot: string,
  expectedSha256: unknown
): ReactRenderRequest {
  return assertRenderRequest(
    copyRoot,
    readBoundJson(owned, WEB_HOST_REACT_RENDER_REQUEST, expectedSha256)
  );
}

export function writeRenderedChrome(
  owned: OwnedArtifact,
  requestSha256: string,
  rawHtml: string,
  loadedReactFiles: ReactFileBinding[]
): string {
  if (!SHA256_PATTERN.test(requestSha256)) throw new Error('Missing rendered request digest');
  const html = validateChromeHtml(rawHtml);
  const value: RenderedChrome = {
    schemaVersion: 1,
    requestSha256,
    html,
    htmlBytes: Buffer.byteLength(html),
    htmlSha256: chromeDigest(html),
    loadedReactFiles,
  };
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(ownedPath(owned, WEB_HOST_REACT_CHROME), bytes, { flag: 'wx' });
  return chromeDigest(bytes);
}

export function readRenderedChrome(
  owned: OwnedArtifact,
  copyRoot: string,
  expectedSha256: unknown,
  requestSha256: unknown
): RenderedChrome {
  const value = record(
    readBoundJson(owned, WEB_HOST_REACT_CHROME, expectedSha256),
    ['schemaVersion', 'requestSha256', 'html', 'htmlBytes', 'htmlSha256', 'loadedReactFiles'],
    'rendered chrome'
  );
  const html = validateChromeHtml(value.html);
  if (
    value.schemaVersion !== 1 ||
    value.requestSha256 !== requestSha256 ||
    html !== value.html ||
    value.htmlBytes !== Buffer.byteLength(html) ||
    value.htmlSha256 !== chromeDigest(html)
  )
    throw new Error('Rendered chrome disagrees with its published request or HTML bytes');
  const loadedReactFiles = assertReactFileBindings(copyRoot, value.loadedReactFiles);
  const classified = collectLoadedReactFiles(
    copyRoot,
    loadedReactFiles.map((file) => join(copyRoot, file.path))
  );
  if (JSON.stringify(classified) !== JSON.stringify(loadedReactFiles))
    throw new Error(
      'Rendered React loaded-file record changed its canonical package/source inventory'
    );
  return {
    schemaVersion: 1,
    requestSha256: String(requestSha256),
    html,
    htmlBytes: Buffer.byteLength(html),
    htmlSha256: chromeDigest(html),
    loadedReactFiles,
  };
}

export const REACT_PRODUCTION_CONTEXT = Object.freeze({
  mode: 'production',
  nodeEnv: 'production',
  isProduction: true,
  perfMarks: 'false',
  jsx: WEB_HOST_JSX,
} as const);
