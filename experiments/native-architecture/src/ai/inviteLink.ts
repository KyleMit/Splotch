import { AI_ACCESS_TOKEN_PARAM } from '../../../../web/src/lib/inviteLink';
import { AI_ORIGIN } from './contract';
import { validCredential, type AiVault } from './credentials';

// buildInvites in web/src/lib/server/admin.ts issues every invite under this exact prefix; a link
// the OS hands the native app with any other origin or path is not an invite Splotch issued.
const NATIVE_INVITE_PREFIX = `${AI_ORIGIN}/?`;

// The shipping page's console warning (web/src/routes/+page.svelte), drift-guarded by
// tools/migration/tests/inviteLinks.web.test.mjs; a failed capture shows the parent nothing there.
export const INVITE_SAVE_FAILED_WARNING = 'Access-code invitation could not be saved';

export function inviteAccessCode(query: URLSearchParams): string | null {
  const code = query.get(AI_ACCESS_TOKEN_PARAM);
  return code !== null && validCredential(code) ? code : null;
}

export function nativeInviteAccessCode(link: string): string | null {
  if (!link.startsWith(NATIVE_INVITE_PREFIX)) return null;
  const [query = ''] = link.slice(NATIVE_INVITE_PREFIX.length).split('#');
  try {
    return inviteAccessCode(new URLSearchParams(query));
  } catch {
    return null;
  }
}

export function withoutInviteParam(href: string): string {
  const url = new URL(href);
  if (!url.searchParams.has(AI_ACCESS_TOKEN_PARAM)) return href;
  url.searchParams.delete(AI_ACCESS_TOKEN_PARAM);
  return url.href;
}

// The slot a typed access code reaches after verification; an invite is saved unverified, as the
// shipping captureAiAccessTokenFromUrl saves it, and the server checks it on first use.
export function saveInviteAccessCode(vault: Pick<AiVault, 'write'>, code: string) {
  return vault.write('managed', code);
}
