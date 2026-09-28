// @vitest-environment node
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

const answered = vi.hoisted(() => {
  const state: { lastGrantRemaining: number | null } = { lastGrantRemaining: null };
  return state;
});

vi.mock('$lib/state/freeGenerations.svelte', () => ({ freeGenerationsState: answered }));

import AiValueProp from './AiValueProp.svelte';

function allowanceClaim(lastGrantRemaining: number | null): string | undefined {
  answered.lastGrantRemaining = lastGrantRemaining;
  const firstClaim = /<ul class="ai-value-prop-claims[^>]*>([\s\S]*?)<\/li>/.exec(
    render(AiValueProp).body
  )?.[1];
  return firstClaim
    ?.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The value prop shows only while AI is off, when no grant is followed, so it
// can only report what a grant last answered this session. The copy for each
// count is pinned word for word.
describe('AiValueProp free-allowance claim', () => {
  it.each([
    [null, 'The first 10 pictures are free — nothing to set up, no card.'],
    [10, 'The first 10 pictures are free — nothing to set up, no card.'],
    [7, 'You have 7 free pictures left — nothing to set up, no card.'],
    [1, 'You have 1 free pictures left — nothing to set up, no card.'],
    [0, 'Your 10 free pictures are used up.'],
  ])('with a last answered count of %s reads "%s"', (lastGrantRemaining, claim) => {
    expect(allowanceClaim(lastGrantRemaining)).toBe(claim);
  });
});
