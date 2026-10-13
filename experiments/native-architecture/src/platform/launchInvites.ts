import { aiVault } from './ai';
import { startInviteLinks } from './inviteLinks';

// Started before the first render so a launch invite is saved ahead of any AI credential read.
export function startLaunchInvites() {
  return startInviteLinks(aiVault);
}
