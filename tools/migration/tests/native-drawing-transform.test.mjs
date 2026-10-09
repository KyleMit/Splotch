import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';

const root = join(import.meta.dirname, '../../..');
const candidate = join(root, CANDIDATE_DIRECTORY);
const fixtures = [];
const TRANSFORM_TIMEOUT_MS = 10000;

function fixture() {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-drawing-transform-')));
  fixtures.push(path);
  cpSync(candidate, path, { recursive: true, filter: (path) => !path.includes('/node_modules') });
  symlinkSync(join(root, 'node_modules'), join(path, 'node_modules'));
  return path;
}

function run(path) {
  return spawnSync(process.execPath, [join(path, 'scripts/check-transform.cjs')], {
    cwd: path,
    encoding: 'utf8',
    timeout: TRANSFORM_TIMEOUT_MS,
  });
}

afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

describe('the real drawing-screen Babel consumer', () => {
  it('transforms the mounted screen and retains its native import', () => {
    const path = fixture();
    const result = run(path);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      filename: join(path, 'src/DrawingScreen.tsx'),
      transformed: true,
    });
  });

  it('rejects a transformed screen whose native import was removed', () => {
    const path = fixture();
    const screen = join(path, 'src/DrawingScreen.tsx');
    const source = readFileSync(screen, 'utf8');
    expect(source).toContain("from 'react-native'");
    writeFileSync(screen, source.replace("from 'react-native'", "from 'foreign-native'"));
    const result = run(path);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Babel removed the native import');
  });

  it('rejects a preset that leaves the actual screen JSX untransformed', () => {
    const path = fixture();
    writeFileSync(
      join(path, 'babel.config.cjs'),
      "module.exports={plugins:[['@babel/plugin-transform-typescript',{isTSX:true}]]};"
    );
    const result = run(path);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Babel left an untransformed JSX');
  });
});
