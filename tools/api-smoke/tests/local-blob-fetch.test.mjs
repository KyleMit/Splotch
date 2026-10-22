import { expect, it, vi } from 'vitest';
import { localBlobFetch } from '../lib/local-blob-fetch.mjs';

it('restores the emulator write ETag on reads with the SDK lowercase methods', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { headers: { ETag: 'write-version' } }))
    .mockResolvedValueOnce(new Response('{"value":1}'));
  const local = localBlobFetch(fetch, 'http://127.0.0.1:5301');
  await local('http://127.0.0.1:5301/site/store/key', { method: 'put' });
  const response = await local('http://127.0.0.1:5301/site/store/key', { method: 'get' });
  expect(response.headers.get('etag')).toBe('write-version');
  expect(await response.json()).toEqual({ value: 1 });
  expect(fetch).toHaveBeenLastCalledWith('http://127.0.0.1:5301/site/store/key', {
    method: 'get',
    redirect: 'error',
  });
});

it('blocks outside services before making any request', async () => {
  const fetch = vi.fn();
  const local = localBlobFetch(fetch, 'http://127.0.0.1:5301');
  await expect(local('https://api.openai.com/v1/responses')).rejects.toThrow('outside service');
  await expect(local('https://api.github.com/repos/test/issues')).rejects.toThrow(
    'outside service'
  );
  expect(fetch).not.toHaveBeenCalled();
});
