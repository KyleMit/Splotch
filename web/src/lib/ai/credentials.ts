import { ACCESS_TOKEN_HEADER, API_KEY_HEADER, INSTALLATION_ID_HEADER } from '$lib/apiHeaders';
import { installationId } from '$lib/state/freeGenerations.svelte';
import { settings } from '$lib/state/settings.svelte';

// The one place that decides which AI credential a request carries. Generation
// and reporting must make the same choice: when they disagreed, every picture
// made on the free tier was unreportable, because the report sent an empty
// access token the server answered 403 to (issue #960).
//
// The free tier is the absence of both explicit credentials, so the installation
// id is minted only then — asking for it otherwise would create one for callers
// that never send it.
export async function aiCredentialHeaders(): Promise<Record<string, string>> {
  if (settings.aiUserApiKey) return { [API_KEY_HEADER]: settings.aiUserApiKey };
  if (settings.aiAccessToken) return { [ACCESS_TOKEN_HEADER]: settings.aiAccessToken };
  return { [INSTALLATION_ID_HEADER]: await installationId() };
}
