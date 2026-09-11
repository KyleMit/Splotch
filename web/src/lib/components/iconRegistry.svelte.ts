import type { CommonIconName } from './iconTypes';

// Icons that no startup-path module renders live in web/src/lib/icons/deferred/
// and reach <Icon> through this registry instead of Icon.svelte's eager glob
// (ADR-0164). deferredIcons.ts fills it as a side effect of being evaluated, so
// a chunk that statically imports that module has its icons registered before
// any of its components render — during SSR as well as on the client. A
// consumer that skipped the import still resolves: Icon.svelte triggers the
// load and re-renders when the registry fills.
let deferredIcons = $state.raw<Partial<Record<CommonIconName, string>>>({});
let deferredIconsLoad: Promise<void> | undefined;

export function registerDeferredIcons(icons: Partial<Record<CommonIconName, string>>): void {
  deferredIcons = icons;
}

export function deferredIconMarkup(name: CommonIconName): string | undefined {
  return deferredIcons[name];
}

// Logs rather than rejects: the only caller is Icon.svelte's effect, which
// tracks the registry and the name, not this promise — so an icon already on
// screen when the load fails stays blank for the session. The reset is for
// the next <Icon> that mounts with an unregistered name: it retries the chunk
// instead of inheriting the rejection.
export function ensureDeferredIcons(): Promise<void> {
  deferredIconsLoad ??= import('./deferredIcons')
    .then(() => undefined)
    .catch((error: unknown) => {
      deferredIconsLoad = undefined;
      console.error('Deferred icon chunk failed to load:', error);
    });
  return deferredIconsLoad;
}
