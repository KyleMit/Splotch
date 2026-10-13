import { createHash } from 'node:crypto';

export function verifyArtifactIntegrity(bytes, integrity) {
  const algorithms = new Set(['sha512', 'sha384', 'sha256', 'sha1']);
  if (typeof integrity !== 'string') throw new Error('Artifact integrity is absent');
  const checks = integrity.split(/\s+/).map((part) => {
    const separator = part.indexOf('-');
    const algorithm = part.slice(0, separator);
    if (!algorithms.has(algorithm)) throw new Error(`Unsupported integrity: ${part}`);
    return createHash(algorithm).update(bytes).digest('base64') === part.slice(separator + 1);
  });
  if (!checks.length || checks.some((match) => !match))
    throw new Error('Archive integrity mismatch');
}
