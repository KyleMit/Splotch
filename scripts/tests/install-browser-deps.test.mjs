import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_BROWSERS } from '../install-browser-deps.mjs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// install-browser-deps.mjs installs Chromium's dependencies through Playwright
// and WebKit's through an explicit package list, so it only satisfies the
// browsers it names. The Tests job picks the browsers independently via
// PW_BROWSERS; a third one added there would install its binary and then fail
// to launch for want of system libraries, which reads as a browser bug rather
// than a missing apt package. Fail here instead, at the point of divergence.
describe('Playwright browser set single source', () => {
  it('the Tests job installs exactly the browsers the deps script satisfies', () => {
    const workflow = read('.github/workflows/test.yml');
    const declared = /PW_BROWSERS:\s*(.+)/.exec(workflow);
    expect(declared, 'PW_BROWSERS not found in .github/workflows/test.yml').not.toBeNull();

    expect(declared[1].trim().split(/\s+/).sort()).toEqual([...SUPPORTED_BROWSERS].sort());
  });

  it('the Tests job installs the system deps through this script', () => {
    expect(read('.github/workflows/test.yml')).toContain('npm run test:e2e:deps');
  });
});
