// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { VERSION_JSON_PATH } from './versionEndpoint';

const netlifyToml = readFileSync(resolve(process.cwd(), '..', 'netlify.toml'), 'utf8');

it('applies the Netlify no-cache policy at VERSION_JSON_PATH', () => {
  const headerBlock = netlifyToml
    .split('[[headers]]')
    .slice(1)
    .find((block) => block.match(/^\s*for\s*=\s*"([^"]+)"/m)?.[1] === VERSION_JSON_PATH);

  expect(headerBlock).toEqual(
    expect.stringContaining('Cache-Control = "no-cache, no-store, must-revalidate"')
  );
});
