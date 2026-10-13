import {
  INVITE_SAVE_FAILED_WARNING,
  inviteAccessCode,
  saveInviteAccessCode,
  withoutInviteParam,
} from '../ai/inviteLink';
import type { AiVault } from '../ai/credentials';

type VaultLoader = () => Promise<Pick<AiVault, 'write'>>;

// Captures a launch invite once. The vault loads only for a launch that carries an invite, so an
// ordinary launch never fetches it. A vault that fails to load (its chunk, offline) leaves the
// capture pending, so the next settle() retries it; the AI owner settles it before it reads a
// credential (productOwnersLoader.web.ts). A save that fails or is superseded keeps the parameter,
// so reopening the link retries it.
export function createInviteCapture(loadVault: VaultLoader) {
  let settled = false;
  let attempt: Promise<void> | null = null;
  async function capture() {
    const code = inviteAccessCode(new URL(location.href).searchParams);
    if (!code) {
      settled = true;
      return;
    }
    let vault: Pick<AiVault, 'write'>;
    try {
      vault = await loadVault();
    } catch (error) {
      console.warn(INVITE_SAVE_FAILED_WARNING, error);
      return;
    }
    settled = true;
    try {
      await saveInviteAccessCode(vault, code);
    } catch (error) {
      console.warn(INVITE_SAVE_FAILED_WARNING, error);
      return;
    }
    history.replaceState(history.state, '', withoutInviteParam(location.href));
  }
  return {
    settle(): Promise<void> {
      if (settled) return Promise.resolve();
      attempt ??= capture().finally(() => {
        attempt = null;
      });
      return attempt;
    },
  };
}
