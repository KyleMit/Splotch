import {
  INVITE_SAVE_FAILED_WARNING,
  inviteAccessCode,
  saveInviteAccessCode,
  withoutInviteParam,
} from '../ai/inviteLink';
import type { AiVault } from '../ai/credentials';

// The parameter stays when the save fails or is superseded, so reopening the link retries it.
export async function startInviteLinks(vault: Pick<AiVault, 'write'>) {
  const code = inviteAccessCode(new URL(location.href).searchParams);
  if (!code) return;
  try {
    await saveInviteAccessCode(vault, code);
  } catch (error) {
    console.warn(INVITE_SAVE_FAILED_WARNING, error);
    return;
  }
  history.replaceState(history.state, '', withoutInviteParam(location.href));
}
