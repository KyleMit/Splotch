// @vitest-environment node
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

const answered = vi.hoisted(() => {
  const state: { lastGrantRemaining: number | null } = { lastGrantRemaining: null };
  return state;
});

vi.mock('$lib/state/freeGenerations.svelte', () => ({ freeGenerationsState: answered }));

import { settingsState } from '$lib/state/settings.svelte';
import AiValueProp from './AiValueProp.svelte';

function claims(): string[] {
  const list = /<ul class="ai-value-prop-claims[^>]*>([\s\S]*?)<\/ul>/.exec(
    render(AiValueProp).body
  )?.[1];
  return (list ?? '')
    .split('</li>')
    .slice(0, -1)
    .map((claim) =>
      claim
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
}

function allowanceClaim(lastGrantRemaining: number | null): string | undefined {
  answered.lastGrantRemaining = lastGrantRemaining;
  return claims()[0];
}

// The value prop shows only while AI is off, when no grant is followed, so it
// can only report what a grant last answered this session. The copy for each
// count is pinned word for word.
describe('AiValueProp free-allowance claim', () => {
  it.each([
    [null, 'The first 10 pictures are free — nothing to set up, no card.'],
    [10, 'The first 10 pictures are free — nothing to set up, no card.'],
    [7, 'You have 7 free pictures left — nothing to set up, no card.'],
    [1, 'You have 1 free picture left — nothing to set up, no card.'],
    [0, 'Your 10 free pictures are used up.'],
  ])('with a last answered count of %s reads "%s"', (lastGrantRemaining, claim) => {
    expect(allowanceClaim(lastGrantRemaining)).toBe(claim);
  });
});

// Shown on every platform, and true on each: the saved key stays on this
// device (docs/MOBILE/compliance.md, Apple 5.1.1).
describe('AiValueProp key-storage claim', () => {
  it('reads "After that, use your own OpenAI key — saved on this device only." with no credential', () => {
    expect(claims()[1]).toBe('After that, use your own OpenAI key — saved on this device only.');
  });

  it('reads "Your key stays saved on this device only." once a key is saved', () => {
    settingsState.mirrorAiUserApiKey('sk-test');
    try {
      expect(claims()[1]).toBe('Your key stays saved on this device only.');
    } finally {
      settingsState.mirrorAiUserApiKey('');
    }
  });
});
