import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// A spoken cue is best effort, and best effort has to survive a missing or
// failing `say`: the cue runs while a person is drawing, so a cue that ended
// the process would cost the capture they are holding the device for. Each
// case runs speak() in a child whose PATH decides what `say` is, then prints a
// line — a cue that exits the process never reaches it. The PATH holds only
// the fixture folder, so no case speaks aloud on a Mac.
const SPEAK_THEN_CARRY_ON = `
  import { speak } from ${JSON.stringify(
    new URL('../split-capture/lib/spoken-cues.mjs', import.meta.url).href
  )};
  speak('Draw now');
  console.log('carried on');
`;

let fixtureDir;

beforeEach(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), 'splotch-spoken-cues-'));
});

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

function installSay(script) {
  writeFileSync(join(fixtureDir, 'say'), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
}

function speakInChild() {
  return spawnSync(process.execPath, ['--input-type=module', '-e', SPEAK_THEN_CARRY_ON], {
    encoding: 'utf8',
    env: { ...process.env, PATH: fixtureDir, SAY_LOG: join(fixtureDir, 'say.log') },
  });
}

describe('speak', () => {
  it('says the words', () => {
    installSay('printf \'%s\\n\' "$*" >> "$SAY_LOG"');

    const result = speakInChild();

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(fixtureDir, 'say.log'), 'utf8')).toBe('Draw now\n');
  });

  it('carries on when the Mac has no say', () => {
    const result = speakInChild();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('carried on\n');
  });

  it('carries on when say fails', () => {
    installSay('exit 1');

    const result = speakInChild();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('carried on\n');
  });
});
