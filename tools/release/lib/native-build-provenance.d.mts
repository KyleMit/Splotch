export const NATIVE_BUILD_PROVENANCE_FILENAME: 'build-provenance.json';

export interface NativeBuildProvenance {
  commitSha: string;
  buildTime: string;
}

export function isFullGitSha(value: unknown): value is string;
export function serializeNativeBuildProvenance(provenance: NativeBuildProvenance): string;
export function parseNativeBuildProvenance(source: string): NativeBuildProvenance;
