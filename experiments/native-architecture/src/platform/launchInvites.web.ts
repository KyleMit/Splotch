import { startInviteLinks } from './inviteLinks.web';

// Started before the first render. The vault comes from the AI owners' chunk
// (productChunk.web.ts), which this request reaches first, so the invite is saved ahead of any AI
// credential read.
export function startLaunchInvites() {
  return startInviteLinks(() =>
    import('../product/productChunk.web').then((module) => module.aiVault)
  );
}
