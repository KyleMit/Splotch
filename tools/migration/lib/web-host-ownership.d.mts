export interface WebHostOwnership {
  root: string;
  token: string;
}
export function pathInside(root: string, target: string): boolean;
export function canonicalDirectory(path: string): string;
export function outputParent(sourceRoot: string, requestedParent: string): string;
export function createOwnedArtifact(parent: string): WebHostOwnership;
export function assertOwnedArtifact(owned: WebHostOwnership): void;
export function ownedPath(owned: WebHostOwnership, path: string): string;
export function writeOwnedJson(owned: WebHostOwnership, path: string, value: unknown): void;
