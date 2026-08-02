// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { excludeNativeRoutes, NATIVE_EXCLUDED_ROUTES } from '../nativeExcludedRoutes';

// `load` is declared as an object property on the plugin, so reach it through a
// narrow accessor rather than threading Vite's full hook-with-context type.
function loadHook(isCapacitor: boolean) {
  const plugin = excludeNativeRoutes(isCapacitor);
  const hook = plugin.load;
  if (typeof hook !== 'function') throw new Error('excludeNativeRoutes must declare a load hook');
  return (id: string) => hook.call(null as never, id, undefined);
}

const EXCLUDED = NATIVE_EXCLUDED_ROUTES[0];

describe('excludeNativeRoutes', () => {
  it('blanks an excluded route component in the native build', () => {
    expect(loadHook(true)(`/repo/web/src/routes/${EXCLUDED}/+page.svelte`)).toBe('');
  });

  it('replaces an excluded route module with a non-prerendered stub', () => {
    expect(loadHook(true)(`/repo/web/src/routes/${EXCLUDED}/+page.ts`)).toContain(
      'prerender = false'
    );
  });

  it('matches through a Vite query suffix', () => {
    expect(loadHook(true)(`/repo/web/src/routes/${EXCLUDED}/+page.svelte?import`)).toBe('');
  });

  it('leaves every other route alone', () => {
    expect(loadHook(true)('/repo/web/src/routes/privacy/+page.svelte')).toBeNull();
    expect(loadHook(true)('/repo/web/src/lib/components/Icon.svelte')).toBeNull();
  });

  it('is inert on the web build', () => {
    const plugin = excludeNativeRoutes(false);
    const apply = plugin.apply;
    if (typeof apply !== 'function') throw new Error('excludeNativeRoutes must gate with apply()');
    expect(apply({}, { command: 'build', mode: 'production' })).toBe(false);
    expect(excludeNativeRoutes(true).apply).toBeTypeOf('function');
  });
});
