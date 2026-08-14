import { describe, expect, expectTypeOf, it } from 'vitest';
import { promiseWithResolvers } from './promiseWithResolvers';

describe('promiseWithResolvers', () => {
  it('resolves the promise with the value passed to resolve', async () => {
    const { promise, resolve } = promiseWithResolvers<number>();
    resolve(7);
    await expect(promise).resolves.toBe(7);
  });

  it('rejects the promise with the reason passed to reject', async () => {
    const { promise, reject } = promiseWithResolvers<number>();
    const reason = new Error('worker failed');
    reject(reason);
    await expect(promise).rejects.toBe(reason);
  });

  it('ignores settlement attempts after the first, like a plain promise', async () => {
    const { promise, resolve, reject } = promiseWithResolvers<string>();
    resolve('first');
    resolve('second');
    reject(new Error('late reject'));
    await expect(promise).resolves.toBe('first');
  });

  it('keeps the first rejection when resolve arrives later', async () => {
    const { promise, resolve, reject } = promiseWithResolvers<string>();
    const reason = new Error('first');
    reject(reason);
    resolve('too late');
    await expect(promise).rejects.toBe(reason);
  });

  it('assimilates a fulfilled thenable passed to resolve', async () => {
    const { promise, resolve } = promiseWithResolvers<string>();
    resolve(Promise.resolve('assimilated'));
    await expect(promise).resolves.toBe('assimilated');
  });

  it('adopts the rejection of a rejected thenable passed to resolve', async () => {
    const { promise, resolve } = promiseWithResolvers<string>();
    const reason = new Error('inner rejection');
    resolve(Promise.reject(reason));
    await expect(promise).rejects.toBe(reason);
  });

  it('infers the generic across promise, resolve, and reject', () => {
    const deferred = promiseWithResolvers<ImageBitmap>();
    expectTypeOf(deferred).toEqualTypeOf<PromiseWithResolvers<ImageBitmap>>();
    expectTypeOf(deferred.promise).toEqualTypeOf<Promise<ImageBitmap>>();
    expectTypeOf(deferred.resolve)
      .parameter(0)
      .toEqualTypeOf<ImageBitmap | PromiseLike<ImageBitmap>>();
  });

  it('matches the native Promise.withResolvers surface for mechanical replacement', () => {
    const helper = promiseWithResolvers<void>();
    const native = Promise.withResolvers<void>();
    expect(Object.keys(helper).sort()).toEqual(Object.keys(native).sort());
    expect(helper.promise).toBeInstanceOf(Promise);
    expect(typeof helper.resolve).toBe('function');
    expect(typeof helper.reject).toBe('function');
  });
});
