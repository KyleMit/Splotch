/**
 * Typed stand-in for `Promise.withResolvers()` (issue #893): the same
 * `{ promise, resolve, reject }` shape without mutating `Promise` or
 * `globalThis`. The `docs/COMPATIBILITY.md` risk-register row owns the
 * native-support baseline and the floor increase that permits swapping call
 * sites to the native API and deleting this module.
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
