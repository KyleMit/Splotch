// @vitest-environment node
import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gateAnswer, parentalGateState } from '$lib/state/parentalGate.svelte';
import ParentalGateProblem from './ParentalGateProblem.svelte';

// Math.random's extremes pick the extreme operands: 3 × 3 and 9 × 9.
const SMALLEST_PRODUCT_RANDOM = 0;
const LARGEST_PRODUCT_RANDOM = 0.999;

function openGateWithRandom(random: number) {
  vi.spyOn(Math, 'random').mockReturnValue(random);
  parentalGateState.requireParentalGate('aiImage', () => {});
}

function dabCount() {
  return render(ParentalGateProblem).body.match(/class="gate-dab[\s"]/g)?.length ?? 0;
}

afterEach(() => {
  parentalGateState.dismissGate();
  vi.restoreAllMocks();
});

// The dabs are how a grown-up knows when to stop, and the store fails the digit
// typed past the answer, so the card has to draw exactly one dab per digit.
describe('ParentalGateProblem answer dabs', () => {
  it.each([
    { product: 'one-digit', random: SMALLEST_PRODUCT_RANDOM, digits: 1 },
    { product: 'two-digit', random: LARGEST_PRODUCT_RANDOM, digits: 2 },
  ])('draws one dab per digit of a $product answer', ({ random, digits }) => {
    openGateWithRandom(random);

    expect(gateAnswer(parentalGateState)).toHaveLength(digits);
    expect(dabCount()).toBe(digits);
  });

  it('takes a digit for every dab and fails the one after the last', () => {
    openGateWithRandom(LARGEST_PRODUCT_RANDOM);
    const dabs = dabCount();

    for (let typed = 0; typed < dabs; typed += 1) parentalGateState.pressGateDigit(1);
    expect(parentalGateState.input).toHaveLength(dabs);
    expect(parentalGateState.shaking).toBe(false);

    parentalGateState.pressGateDigit(1);
    expect(parentalGateState.input).toBe('');
    expect(parentalGateState.shaking).toBe(true);
  });
});
