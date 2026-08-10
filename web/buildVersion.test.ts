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
