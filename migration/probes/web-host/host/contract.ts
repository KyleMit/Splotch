import { isProbeFixture, type ProbeFixture } from '../src/probeProps.ts';

export const WEB_HOST_VARIANT = 'retained-control';
const WEB_HOST_VARIANTS = [WEB_HOST_VARIANT, 'neutral-embedded'] as const;
export type WebHostVariant = (typeof WEB_HOST_VARIANTS)[number];
export const WEB_HOST_JSX = Object.freeze({
  runtime: 'automatic',
  development: false,
  importSource: 'react',
} as const);
const WEB_HOST_ARTIFACTS = ['release', 'mechanism'] as const;
export type WebHostArtifact = (typeof WEB_HOST_ARTIFACTS)[number];
export const WEB_HOST_ENV = {
  artifactRoot: 'SPLOTCH_WEB_HOST_ARTIFACT_ROOT',
  artifact: 'SPLOTCH_WEB_HOST_ARTIFACT',
  variant: 'SPLOTCH_MIGRATION_WEB_HOST',
  copyRoot: 'SPLOTCH_WEB_HOST_COPY_ROOT',
  token: 'SPLOTCH_WEB_HOST_TOKEN',
  port: 'SPLOTCH_WEB_HOST_PORT',
  browserRun: 'SPLOTCH_WEB_HOST_BROWSER_RUN',
  fixture: 'SPLOTCH_WEB_HOST_FIXTURE',
  chromeSha256: 'SPLOTCH_WEB_HOST_CHROME_SHA256',
  renderRequestSha256: 'SPLOTCH_WEB_HOST_RENDER_REQUEST_SHA256',
} as const;
export const WEB_HOST_MARKER = '.splotch-web-host.json';
export const WEB_HOST_INPUTS = 'inputs.json';
export const WEB_HOST_RESULT = 'result.json';
export const WEB_HOST_WRAPPER = 'migration/probes/web-host/host/vite.config.ts';
export const WEB_HOST_PASSES = 'control-passes.json';
export const WEB_HOST_OUTPUT_PATHS = [
  'web/.svelte-kit/output',
  'web/build',
  'web/.netlify',
] as const;

export function webHostArtifact(value: unknown): WebHostArtifact {
  const matched = WEB_HOST_ARTIFACTS.find((candidate) => candidate === value);
  if (matched === undefined) {
    throw new Error(`Web-host artifact must be release or mechanism; received ${String(value)}`);
  }
  return matched;
}

export function assertWebHostVariant(value: unknown): void {
  if (value !== WEB_HOST_VARIANT) {
    throw new Error(`Only ${WEB_HOST_VARIANT} is implemented; received ${String(value)}`);
  }
}

function assertRequestVariant(value: unknown): asserts value is WebHostVariant {
  if (!WEB_HOST_VARIANTS.some((variant) => variant === value)) {
    throw new Error(`Unsupported web-host variant: ${String(value)}`);
  }
}

export type WebHostRequest =
  | { variant: 'retained-control'; artifact: WebHostArtifact; fixture: 'matching' }
  | { variant: 'neutral-embedded'; artifact: 'release'; fixture: 'matching' }
  | { variant: 'neutral-embedded'; artifact: 'mechanism'; fixture: ProbeFixture };

export function webHostRequest(value: {
  variant: unknown;
  artifact: unknown;
  fixture: unknown;
  capacitor: unknown;
  perfMarks: unknown;
  harness: unknown;
}): WebHostRequest {
  assertRequestVariant(value.variant);
  const artifact = webHostArtifact(value.artifact);
  if (value.capacitor !== 'false' || value.perfMarks !== 'false')
    throw new Error('Web-host requires the web target without performance instrumentation');
  if (value.harness !== (artifact === 'mechanism' ? 'true' : 'false'))
    throw new Error('Web-host artifact and private harness flags disagree');
  const fixture =
    value.variant === 'retained-control' && value.fixture === undefined
      ? 'matching'
      : value.fixture;
  if (!isProbeFixture(fixture)) throw new Error('Unsupported web-host fixture');
  if (value.variant === 'retained-control') {
    if (fixture !== 'matching') throw new Error('Retained control has no mismatch fixture');
    return { variant: value.variant, artifact, fixture };
  }
  if (artifact === 'release') {
    if (fixture !== 'matching') throw new Error('Release refuses the text-mismatch fixture');
    return { variant: value.variant, artifact, fixture };
  }
  return { variant: value.variant, artifact, fixture };
}

export const WEB_HOST_REACT_RENDERER_DIRECTORY = 'migration/probes/web-host/generated-chrome';
export const WEB_HOST_REACT_RENDERER = `${WEB_HOST_REACT_RENDERER_DIRECTORY}/renderer.mjs`;
export const WEB_HOST_REACT_RENDERER_GRAPH = `${WEB_HOST_REACT_RENDERER_DIRECTORY}/renderer-graph.json`;
export const WEB_HOST_REACT_RENDER_REQUEST = 'react-render-request.json';
export const WEB_HOST_REACT_CHROME = 'react-chrome.json';
export const WEB_HOST_NEUTRAL_PASSES = 'neutral-passes.json';
export const WEB_HOST_CHROME_VIRTUAL_ID = 'virtual:splotch-web-host-chrome';

export const WEB_HOST_COPY_ROLES = ['reference', 'control'] as const;
export const WEB_HOST_UI_PACKAGES = [
  'react',
  'react-dom',
  'react-native',
  'react-native-web',
  'react-strict-dom',
] as const;
export const WEB_HOST_UI_SCOPES = ['@react-native'] as const;

export const WEB_HOST_REACT_SOURCE_PATHS = [
  'migration/probes/web-host/host/contract.ts',
  'migration/probes/web-host/host/serverStore.ts',
  'migration/probes/web-host/host/renderChrome.ts',
  'migration/probes/web-host/host/chromeHtml.ts',
  'migration/probes/web-host/host/reactProduction.ts',
  'migration/probes/web-host/src/probeProps.ts',
  'migration/probes/web-host/src/ProbeChrome.tsx',
  'web/src/lib/palette.ts',
] as const;

export const WEB_HOST_NEUTRAL_COPY_ROLE = 'neutral';
export const WEB_HOST_NEUTRAL_COPY_ROLES = [
  ...WEB_HOST_COPY_ROLES,
  WEB_HOST_NEUTRAL_COPY_ROLE,
] as const;
export type WebHostCopyRole = (typeof WEB_HOST_NEUTRAL_COPY_ROLES)[number];
export const WEB_HOST_REACT_OUTPUT_PATHS = [
  WEB_HOST_REACT_RENDERER,
  WEB_HOST_REACT_RENDERER_GRAPH,
] as const;

export function webHostCopyRoles(variant: unknown) {
  assertRequestVariant(variant);
  return variant === 'neutral-embedded' ? WEB_HOST_NEUTRAL_COPY_ROLES : WEB_HOST_COPY_ROLES;
}

export function webHostCopyRequest(request: WebHostRequest, role: WebHostCopyRole): WebHostRequest {
  if (!webHostCopyRoles(request.variant).some((candidate) => candidate === role))
    throw new Error(`Copy role is outside its requested variant: ${role}`);
  return role === WEB_HOST_NEUTRAL_COPY_ROLE
    ? request
    : { variant: WEB_HOST_VARIANT, artifact: request.artifact, fixture: 'matching' };
}

export const WEB_HOST_REACT_EXTERNALS = ['react', 'react/jsx-runtime', 'react-dom/server'] as const;
