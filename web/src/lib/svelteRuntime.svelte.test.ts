import { flushSync, untrack } from 'svelte';
import { describe, expect, it } from 'vitest';

// Rune modules compile against Svelte's client runtime here, so the helpers they
// import from 'svelte' must come from that same runtime. The package's default
// export condition is the server build, where untrack only calls its function
// and flushSync flushes nothing — a unit test would then pass or fail for
// reasons the shipped app never sees.
describe('the Svelte runtime unit tests run against', () => {
  // Settles through a macrotask rather than a Svelte flush helper, so this
  // test isolates untrack from whichever flushSync the import resolved to.
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  it('keeps a read inside untrack out of the effect', async () => {
    const source = $state({ value: 0 });
    let runs = 0;
    const stop = $effect.root(() => {
      $effect(() => {
        runs += 1;
        untrack(() => source.value);
      });
    });
    await settle();

    source.value += 1;
    await settle();

    expect(runs).toBe(1);
    stop();
  });

  it('runs a pending effect inside flushSync', () => {
    let runs = 0;
    const stop = $effect.root(() => {
      $effect(() => {
        runs += 1;
      });
    });

    flushSync();

    expect(runs).toBe(1);
    stop();
  });
});
