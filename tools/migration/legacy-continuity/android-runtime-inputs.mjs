import assert from 'node:assert/strict';

export function installedAPKPath(bytes) {
  const lines = bytes
    .toString()
    .replace(/\r?\n$/, '')
    .split(/\r?\n/);
  assert.equal(lines.length, 1, 'L0_SPLIT_APK_UNQUALIFIED');
  assert.match(
    lines[0],
    /^package:\/data\/app\/[a-zA-Z0-9_./=+~-]+\/base\.apk$/,
    'L0_INSTALLED_APK_PATH_INVALID'
  );
  const path = lines[0].slice('package:'.length);
  assert.ok(
    !path.split('/').some((part, index) => index !== 0 && ['', '.', '..'].includes(part)),
    'L0_INSTALLED_APK_PATH_INVALID'
  );
  const directories = path.slice('/data/app/'.length, -'/base.apk'.length).split('/');
  assert.ok(
    directories.length === 1 || directories.length === 2,
    'L0_INSTALLED_APK_LAYOUT_UNQUALIFIED'
  );
  assert.match(
    directories.at(-1),
    /^art\.splotch\.app-[a-zA-Z0-9_=+-]+$/,
    'L0_INSTALLED_APK_PACKAGE_INVALID'
  );
  if (directories.length === 2)
    assert.match(directories[0], /^~~[a-zA-Z0-9_=+-]+$/, 'L0_INSTALLED_APK_LAYOUT_UNQUALIFIED');
  return path;
}

export function coloringRootInventory(bytes) {
  const text = bytes.toString();
  if (text === 'L0_COLORING_ROOT_ABSENT\n') return { stage: 'post-attach', root: 'absent' };
  assert.ok(text.startsWith('L0_COLORING_ROOT_PRESENT\n'), 'L0_COLORING_ROOT_MARKER_INVALID');
  assert.equal(text, 'L0_COLORING_ROOT_PRESENT\n', 'L0A_PACK_OR_JOB_PRESENT');
  return { stage: 'post-attach', root: 'present-empty' };
}
