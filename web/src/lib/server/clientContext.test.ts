// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CLIENT_PLATFORM_HEADER, CLIENT_VERSION_HEADER } from '$lib/apiHeaders';
import { describeClient, readClientContext } from './clientContext';

function request(headers: Record<string, string>): Request {
  return new Request('https://splotch.art/api/report', { headers });
}

describe('readClientContext', () => {
  it('reads a native store version and platform', () => {
    const context = readClientContext(
      request({ [CLIENT_VERSION_HEADER]: '1.6.0', [CLIENT_PLATFORM_HEADER]: 'ios' })
    );
    expect(context).toEqual({ version: '1.6.0', platform: 'ios' });
    expect(describeClient(context)).toBe('ios/1.6.0');
  });

  it('reads the per-commit web version, with and without the sha fallback', () => {
    for (const version of ['1.6.12', '1.6.0+c5707ce']) {
      expect(
        readClientContext(
          request({ [CLIENT_VERSION_HEADER]: version, [CLIENT_PLATFORM_HEADER]: 'web' })
        )
      ).toEqual({ version, platform: 'web' });
    }
  });

  it('reads a client shipped before the headers existed as unidentified', () => {
    const context = readClientContext(request({}));
    expect(context).toEqual({ version: null, platform: null });
    expect(describeClient(context)).toBe('unidentified');
  });

  it('drops a value outside the closed shape rather than passing it through', () => {
    const context = readClientContext(
      request({
        [CLIENT_VERSION_HEADER]: 'dev; DROP TABLE',
        [CLIENT_PLATFORM_HEADER]: 'windows',
      })
    );
    expect(context).toEqual({ version: null, platform: null });
  });
});
