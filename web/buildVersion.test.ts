// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  buildMetadata,
  buildMetadataOncePerProcess,
  deriveWebVersion,
  PINNED_BUILD_METADATA_ENV,
} from './buildVersion';

describe('deriveWebVersion', () => {
  it('uses the commit count without asking for the short SHA', () => {
    const runGit = vi.fn().mockReturnValue('v1.2.0-45-gabc1234');

    expect(
      deriveWebVersion({
        packageVersion: '1.2.0',
        runGit,
      })
    ).toBe('1.2.45');
    expect(runGit).toHaveBeenCalledOnce();
    expect(runGit).toHaveBeenCalledWith('describe --tags --long --match "v*"');
  });

  it.each([undefined, 'v1.2.0'])(
    'uses the short SHA when describe metadata is missing or unusable',
    (gitDescribe) => {
      const runGit = vi.fn().mockReturnValueOnce(gitDescribe).mockReturnValueOnce('abc1234');

      expect(
        deriveWebVersion({
          packageVersion: '1.2.0',
          runGit,
        })
      ).toBe('1.2.0+abc1234');
      expect(runGit).toHaveBeenNthCalledWith(1, 'describe --tags --long --match "v*"');
      expect(runGit).toHaveBeenNthCalledWith(2, 'rev-parse --short HEAD');
    }
  );

  it('uses the package version when git is unavailable', () => {
    const runGit = vi.fn().mockReturnValue(undefined);

    expect(
      deriveWebVersion({
        packageVersion: '1.2.7',
        runGit,
      })
    ).toBe('1.2.7');
    expect(runGit).toHaveBeenNthCalledWith(1, 'describe --tags --long --match "v*"');
    expect(runGit).toHaveBeenNthCalledWith(2, 'rev-parse --short HEAD');
  });
});

describe('buildMetadata', () => {
  it('uses the git-derived version for web builds', () => {
    const runGit = vi.fn().mockReturnValue('v1.2.0-45-gabc1234');

    expect(
      buildMetadata({
        isCapacitor: false,
        packageVersion: '1.2.0',
        buildTime: '2026-07-27 14:30',
        runGit,
      })
    ).toEqual({
      appVersion: '1.2.45',
      buildTime: '2026-07-27 14:30',
    });
    expect(runGit).toHaveBeenCalledWith('describe --tags --long --match "v*"');
  });

  it('uses the exact package version for native builds without calling git', () => {
    const runGit = vi.fn();

    expect(
      buildMetadata({
        isCapacitor: true,
        packageVersion: '1.2.7',
        buildTime: '2026-07-27 14:30',
        runGit,
      })
    ).toEqual({
      appVersion: '1.2.7',
      buildTime: '2026-07-27 14:30',
    });
    expect(runGit).not.toHaveBeenCalled();
  });
});

describe('buildMetadataOncePerProcess', () => {
  const WEB_METADATA = { appVersion: '1.6.895', buildTime: '2026-09-21 13:45' };

  it('derives once and hands every later evaluation the pinned result', () => {
    const env: Record<string, string | undefined> = {};
    const derive = vi
      .fn()
      .mockReturnValueOnce(WEB_METADATA)
      .mockReturnValueOnce({ appVersion: '1.6.896', buildTime: '2026-09-21 13:46' });

    expect(buildMetadataOncePerProcess({ isCapacitor: false, env, derive })).toEqual(WEB_METADATA);
    expect(buildMetadataOncePerProcess({ isCapacitor: false, env, derive })).toEqual(WEB_METADATA);
    expect(derive).toHaveBeenCalledOnce();
  });

  it('re-derives for the other platform instead of reusing a web version natively', () => {
    const env: Record<string, string | undefined> = {};
    const nativeMetadata = { appVersion: '1.6.0', buildTime: '2026-09-21 13:45' };
    buildMetadataOncePerProcess({ isCapacitor: false, env, derive: () => WEB_METADATA });

    expect(
      buildMetadataOncePerProcess({ isCapacitor: true, env, derive: () => nativeMetadata })
    ).toEqual(nativeMetadata);
  });

  it.each(['not json', '{"appVersion":1}', 'null'])(
    'ignores an unusable pinned value %s',
    (pinned) => {
      const env = { [PINNED_BUILD_METADATA_ENV]: pinned };

      expect(
        buildMetadataOncePerProcess({ isCapacitor: false, env, derive: () => WEB_METADATA })
      ).toEqual(WEB_METADATA);
    }
  );
});
