import { Linking } from 'react-native';
import { SITE_ORIGIN } from '../../../../web/src/lib/siteUrl';
import { GITHUB_REPO_URL } from '../../../../web/src/lib/githubRepo';

// The pages Settings links out to. The shipping app serves Privacy and the release history as its
// own routes; this app has no page shell of its own, so it opens the hosted copies, as shipping
// opens GitHub: a new tab on the web, the system browser on Android and iOS.
export const HOSTED_PAGES = {
  privacy: `${SITE_ORIGIN}/privacy`,
  changelog: `${SITE_ORIGIN}/changelog`,
  github: GITHUB_REPO_URL,
  // Settings › AI Art's how-to sends a parent here to make a key (OpenAiKeyHowTo.svelte).
  openAiKeys: 'https://platform.openai.com/api-keys',
} as const;

export type HostedPage = keyof typeof HOSTED_PAGES;

// Every hosted page leaves the app, so a caller reaches this only through the external-links
// check the Settings route wires in front of it.
export function openHostedPage(page: HostedPage) {
  Linking.openURL(HOSTED_PAGES[page]).catch((error: unknown) => {
    console.error('A hosted page failed to open:', error);
  });
}
