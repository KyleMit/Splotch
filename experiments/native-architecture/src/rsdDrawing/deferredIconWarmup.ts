// The native apps carry the deferred icon module in their one local bundle, so they resolve it at
// launch, before the drawer or a sheet can mount an icon. deferredIconWarmup.web.ts names when the
// web export fetches it.
export const DEFERRED_ICON_WARMUP: Promise<void> = Promise.resolve();
