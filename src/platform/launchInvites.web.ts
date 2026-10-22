import { createInviteCapture } from './inviteLinks.web';

// The vault comes from the AI owners' chunk (productChunk.web.ts). The capture starts before the
// first render, and the owners' loader settles it again before it hands out the AI owner
// (productOwnersLoader.web.ts), so an invite is saved ahead of any AI credential read even when
// its first chunk request failed.
export const launchInvite = createInviteCapture(() =>
  import('../product/productChunk.web').then((module) => module.aiVault)
);

export function startLaunchInvites() {
  return launchInvite.settle();
}
