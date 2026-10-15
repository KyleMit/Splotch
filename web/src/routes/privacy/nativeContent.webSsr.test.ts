// @vitest-environment node
import { render } from 'svelte/server';
import { expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import privacy from '../../../../experiments/native-architecture/src/information/privacy.generated.json';
import { privacyContent } from '../../../../tools/migration/gen-native-privacy.mjs';
vi.mock('$app/state', () => ({ page: { url: new URL('https://splotch.art/privacy') } }));
it('ships the exact rendered privacy words and link destinations in React Native', () => {
  expect(privacy.web).toEqual(privacyContent(render(Page).body));
});
