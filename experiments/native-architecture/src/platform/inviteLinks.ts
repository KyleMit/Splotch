import { Linking } from 'react-native';
import {
  INVITE_SAVE_FAILED_WARNING,
  nativeInviteAccessCode,
  saveInviteAccessCode,
} from '../ai/inviteLink';
import type { AiVault } from '../ai/credentials';

// Only links the OS routes to the app arrive here; DEVELOPMENT.md lists the store and domain
// configuration that routing needs.
export async function startInviteLinks(vault: Pick<AiVault, 'write'>) {
  const apply = async (link: string | null) => {
    const code = link === null ? null : nativeInviteAccessCode(link);
    if (!code) return;
    try {
      await saveInviteAccessCode(vault, code);
    } catch (error) {
      console.warn(INVITE_SAVE_FAILED_WARNING, error);
    }
  };
  Linking.addEventListener('url', ({ url }) => void apply(url));
  let initial: string | null;
  try {
    initial = await Linking.getInitialURL();
  } catch (error) {
    console.warn(INVITE_SAVE_FAILED_WARNING, error);
    return;
  }
  await apply(initial);
}
