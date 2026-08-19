export const NATIVE_BUILD_PROVENANCE_FILENAME = 'build-provenance.json';

const FULL_GIT_SHA = /^[0-9a-f]{40}$/;

export function isFullGitSha(value) {
  return typeof value === 'string' && FULL_GIT_SHA.test(value);
}

export function serializeNativeBuildProvenance({ commitSha, buildTime }) {
  if (!isFullGitSha(commitSha)) {
    throw new Error(`invalid native build commit SHA: ${commitSha ?? 'missing'}`);
  }
  if (typeof buildTime !== 'string' || !buildTime) {
    throw new Error('native build time is missing');
  }
  return `${JSON.stringify({ commitSha, buildTime })}\n`;
}

export function parseNativeBuildProvenance(source) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch (error) {
    throw new Error(`${NATIVE_BUILD_PROVENANCE_FILENAME} is not valid JSON`, { cause: error });
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`${NATIVE_BUILD_PROVENANCE_FILENAME} is not a JSON object`);
  }
  const { commitSha, buildTime } = manifest;
  if (!isFullGitSha(commitSha)) {
    throw new Error(`${NATIVE_BUILD_PROVENANCE_FILENAME} has no valid full commit SHA`);
  }
  if (typeof buildTime !== 'string' || !buildTime) {
    throw new Error(`${NATIVE_BUILD_PROVENANCE_FILENAME} has no build time`);
  }
  return { commitSha, buildTime };
}
