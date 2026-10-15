import { Linking } from 'react-native';
import { GITHUB_REPO_URL } from '../../../../web/src/lib/githubRepo';

export const HOSTED_PAGES = {
  github: GITHUB_REPO_URL,
  // Settings › AI Art's how-to sends a parent here to make a key (OpenAiKeyHowTo.svelte).
  openAiKeys: 'https://platform.openai.com/api-keys',
} as const;

export type HostedPage = keyof typeof HOSTED_PAGES;
export type SettingsLink = HostedPage | 'privacy' | 'changelog';

// Every hosted page leaves the app, so a caller reaches this only through the external-links
// check the Settings route wires in front of it.
export function openHostedPage(page: HostedPage) {
  Linking.openURL(HOSTED_PAGES[page]).catch((error: unknown) => {
    console.error('A hosted page failed to open:', error);
  });
}
