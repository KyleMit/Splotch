// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { buildMetadata, deriveWebVersion } from './buildVersion';

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
      commitSha: null,
    });
    expect(runGit).toHaveBeenCalledWith('describe --tags --long --match "v*"');
  });

  it('uses the exact package version and full HEAD SHA for tagless native builds', () => {
    const runGit = vi.fn().mockReturnValue('0123456789abcdef0123456789abcdef01234567');

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
      commitSha: '0123456789abcdef0123456789abcdef01234567',
    });
    expect(runGit).toHaveBeenCalledOnce();
    expect(runGit).toHaveBeenCalledWith('rev-parse HEAD');
  });

  it('refuses a native build when the full commit SHA is unavailable', () => {
    expect(() =>
      buildMetadata({
        isCapacitor: true,
        packageVersion: '1.2.7',
        buildTime: '2026-07-27 14:30',
        runGit: () => undefined,
      })
    ).toThrow(/full Git commit SHA/);
  });
});
