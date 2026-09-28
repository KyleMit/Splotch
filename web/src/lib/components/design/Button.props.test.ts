import type { ComponentProps, Snippet } from 'svelte';
import { describe, expectTypeOf, it } from 'vitest';
import type Button from './Button.svelte';

type ButtonProps = ComponentProps<typeof Button>;

describe('Button props', () => {
  it('accepts a link with its target and rel', () => {
    expectTypeOf<{
      href: string;
      target: '_blank';
      rel: string;
      children: Snippet;
    }>().toExtend<ButtonProps>();
  });

  it('accepts a disabled, busy button with a click handler', () => {
    expectTypeOf<{
      disabled: boolean;
      busy: boolean;
      type: 'submit';
      onclick: () => void;
      children: Snippet;
    }>().toExtend<ButtonProps>();
  });

  // toExtend is structural, the relation a spread of props gets: these hold
  // without the excess-property check that only written-out attributes get.
  it('rejects a link that asks to be disabled or busy, which the anchor cannot render', () => {
    expectTypeOf<{ href: string; disabled: true; children: Snippet }>().not.toExtend<ButtonProps>();
    expectTypeOf<{ href: string; busy: true; children: Snippet }>().not.toExtend<ButtonProps>();
  });

  it('rejects link-only attributes on a button', () => {
    expectTypeOf<{ target: '_blank'; children: Snippet }>().not.toExtend<ButtonProps>();
    expectTypeOf<{ rel: string; children: Snippet }>().not.toExtend<ButtonProps>();
  });
});
