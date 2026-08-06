import type { Invite } from '$lib/components/admin/AdminConsole.svelte';
import type { TokenMutationError, TokenSnapshot } from '../../api/admin/tokens/+server';

function isInvite(value: unknown): value is Invite {
  if (typeof value !== 'object' || value === null) return false;
  const invite = value as Record<string, unknown>;
  return typeof invite.token === 'string' && typeof invite.url === 'string';
}

function isSnapshot(value: unknown): value is TokenSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const snapshot = value as Record<string, unknown>;
  return (
    snapshot.ok === true &&
    Array.isArray(snapshot.tokens) &&
    snapshot.tokens.every((token) => typeof token === 'string') &&
    Array.isArray(snapshot.invites) &&
    snapshot.invites.every(isInvite) &&
    typeof snapshot.persistent === 'boolean'
  );
}

function responseError(value: unknown) {
  if (typeof value !== 'object' || value === null) return null;
  const error = (value as Record<string, unknown>).error;
  return typeof error === 'string' ? error : null;
}

export type SnapshotResult =
  | { ok: true; invites: Invite[]; persistent: boolean }
  | { ok: false; expired: true }
  | { ok: false; expired: false; error: string };

export async function parseSnapshot(response: Response): Promise<SnapshotResult> {
  if (response.status === 401) return { ok: false, expired: true };
  const data = (await response.json().catch(() => null)) as
    | TokenSnapshot
    | TokenMutationError
    | null;
  if (!response.ok || !isSnapshot(data)) {
    return {
      ok: false,
      expired: false,
      error: responseError(data) ?? 'Something went wrong. Please try again.',
    };
  }
  return { ok: true, invites: data.invites, persistent: data.persistent };
}
