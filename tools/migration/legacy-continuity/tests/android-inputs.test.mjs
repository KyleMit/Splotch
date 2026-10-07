import { describe, expect, it } from 'vitest';
import { installedAPKPath, coloringRootInventory } from '../android-runtime-inputs.mjs';

const MODERN =
  'package:/data/app/~~hBRoX6_Fz5Zn8T5vYfgjA==/art.splotch.app-6HqXo1eK2nP9w_aBcDeFgQ==/base.apk\n';
const LEGACY = 'package:/data/app/art.splotch.app-1/base.apk\n';

describe('legacy Android runtime inputs', () => {
  it('accepts old and actual randomized APK layouts while refusing split, foreign and traversal paths', () => {
    expect(installedAPKPath(Buffer.from(LEGACY))).toBe(LEGACY.slice('package:'.length).trim());
    expect(installedAPKPath(Buffer.from(MODERN))).toBe(MODERN.slice('package:'.length).trim());
    expect(() => installedAPKPath(Buffer.from(LEGACY + LEGACY))).toThrow(
      /L0_SPLIT_APK_UNQUALIFIED/
    );
    expect(() => installedAPKPath(Buffer.from(LEGACY.replace('/data/app/', '/foreign/')))).toThrow(
      /L0_INSTALLED_APK_PATH_INVALID/
    );
    expect(() =>
      installedAPKPath(Buffer.from(LEGACY.replace('/data/app/', '/data/app/../')))
    ).toThrow(/L0_INSTALLED_APK_PATH_INVALID/);
    expect(() =>
      installedAPKPath(Buffer.from(LEGACY.replace('art.splotch.app', 'foreign.app')))
    ).toThrow(/L0_INSTALLED_APK_PACKAGE_INVALID/);
    expect(installedAPKPath(Buffer.from(MODERN))).toBe(MODERN.slice('package:'.length).trim());
  });

  it('distinguishes absent and present empty roots without hiding child bytes', () => {
    expect(coloringRootInventory(Buffer.from('L0_COLORING_ROOT_ABSENT\n'))).toEqual({
      stage: 'post-attach',
      root: 'absent',
    });
    expect(coloringRootInventory(Buffer.from('L0_COLORING_ROOT_PRESENT\n'))).toEqual({
      stage: 'post-attach',
      root: 'present-empty',
    });
    expect(() =>
      coloringRootInventory(Buffer.from('L0_COLORING_ROOT_PRESENT\nno_backup/coloring/job.json\n'))
    ).toThrow(/L0A_PACK_OR_JOB_PRESENT/);
    expect(() => coloringRootInventory(Buffer.from('L0_COLORING_ROOT_PRESENT\n \n'))).toThrow(
      /L0A_PACK_OR_JOB_PRESENT/
    );
    expect(() => coloringRootInventory(Buffer.from(''))).toThrow(/L0_COLORING_ROOT_MARKER_INVALID/);
    expect(coloringRootInventory(Buffer.from('L0_COLORING_ROOT_PRESENT\n'))).toEqual({
      stage: 'post-attach',
      root: 'present-empty',
    });
  });
});
