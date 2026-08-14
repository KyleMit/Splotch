/**
 * Typed stand-in for `Promise.withResolvers()`, which needs Chrome/Edge 119 /
 * Firefox 121 / Safari 17.4 — above the floor declared in
 * `web/browserTargets.ts` (issue #893). It returns the native shape without
 * touching `Promise` or `globalThis`, so once the floor reaches those versions
 * every call site swaps mechanically to `Promise.withResolvers<T>()` and this
 * module is deleted; the `docs/COMPATIBILITY.md` risk-register row carries
 * that gate.
 *
 * The definite assignments are safe: the `Promise` constructor invokes its
 * executor synchronously, so both locals are set before the return.
 */
export function promiseWithResolvers<T>(): PromiseWithResolvers<T> {
  let resolve!: PromiseWithResolvers<T>['resolve'];
  let reject!: PromiseWithResolvers<T>['reject'];
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
