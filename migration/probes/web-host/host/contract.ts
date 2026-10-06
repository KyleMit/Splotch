export const WEB_HOST_VARIANT = 'retained-control';
export const WEB_HOST_ARTIFACTS = ['release', 'mechanism'] as const;
export type WebHostArtifact = (typeof WEB_HOST_ARTIFACTS)[number];
export const WEB_HOST_ENV = {
  artifactRoot: 'SPLOTCH_WEB_HOST_ARTIFACT_ROOT',
  artifact: 'SPLOTCH_WEB_HOST_ARTIFACT',
  variant: 'SPLOTCH_MIGRATION_WEB_HOST',
  copyRoot: 'SPLOTCH_WEB_HOST_COPY_ROOT',
  token: 'SPLOTCH_WEB_HOST_TOKEN',
  port: 'SPLOTCH_WEB_HOST_PORT',
  browserRun: 'SPLOTCH_WEB_HOST_BROWSER_RUN',
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

export const WEB_HOST_COPY_ROLES = ['reference', 'control'] as const;
export const WEB_HOST_UI_PACKAGES = [
  'react',
  'react-dom',
  'react-native',
  'react-native-web',
  'react-strict-dom',
] as const;
export const WEB_HOST_UI_SCOPES = ['@react-native'] as const;
