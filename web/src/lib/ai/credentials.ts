import { ACCESS_TOKEN_HEADER, API_KEY_HEADER, INSTALLATION_ID_HEADER } from '$lib/apiHeaders';
import { installationId } from '$lib/state/freeGenerations.svelte';
import { settingsState } from '$lib/state/settings.svelte';
import { unreachable } from '$lib/unreachable';

// The one place that decides which AI credential a request carries. Generation
// and reporting must make the same choice: when they disagreed, every picture
// made on the free tier was unreportable, because the report sent an empty
// access token the server answered 403 to (issue #960). The choice follows
// settingsState.aiCredentialKind(), so a request always sends the credential
// Settings reports as active.
//
// The free tier is the absence of both explicit credentials, so the installation
// id is minted only then — asking for it otherwise would create one for callers
// that never send it.
export async function aiCredentialHeaders(): Promise<Record<string, string>> {
  const kind = settingsState.aiCredentialKind();
  switch (kind) {
    case 'apiKey':
      return { [API_KEY_HEADER]: settingsState.aiUserApiKey };
    case 'accessCode':
      return { [ACCESS_TOKEN_HEADER]: settingsState.aiAccessToken };
    case 'none':
      return { [INSTALLATION_ID_HEADER]: await installationId() };
    default:
      return unreachable(kind);
  }
}
