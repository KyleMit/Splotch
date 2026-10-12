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

describe('excludeNativeRoutes', () => {
  it.each(NATIVE_EXCLUDED_ROUTES)(
    'blanks the %s route component in the native build',
    (excluded) => {
      expect(loadHook(true)(`/repo/web/src/routes/${excluded}/+page.svelte`)).toBe('');
    }
  );

  it.each(NATIVE_EXCLUDED_ROUTES)(
    'replaces the %s route module with a non-prerendered stub',
    (excluded) => {
      expect(loadHook(true)(`/repo/web/src/routes/${excluded}/+page.ts`)).toContain(
        'prerender = false'
      );
    }
  );

  it('matches through a Vite query suffix', () => {
    expect(loadHook(true)('/repo/web/src/routes/ios-beta/+page.svelte?import')).toBe('');
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
