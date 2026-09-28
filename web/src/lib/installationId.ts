// On the startup path: lib/state/freeGenerations.svelte.ts imports it before
// hydration. Keep it dependency-free and keep lazy-only exports out; sharing it
// with lazy client code can split it into a chunk of its own on the prerendered
// page's modulepreload list, which web/tests/startup-bundle.spec.ts counts.

// The installation pseudonym is a hex SHA-256 digest (ADR-0105). The client
// refuses to send anything else, and the server refuses to key a grant by it.
const INSTALLATION_ID_PATTERN = /^[a-f0-9]{64}$/;

export function isInstallationId(value: string | null): value is string {
  return typeof value === 'string' && INSTALLATION_ID_PATTERN.test(value);
}
