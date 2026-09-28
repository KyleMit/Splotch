// @vitest-environment node
import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The server-only package ban is a second web/src no-restricted-imports block, and flat config
// REPLACES the rule's earlier entry wherever a later block configures it. This control seeds each
// server-only package into client and server file shapes, and each pre-existing web/src
// restriction into a client path, so a block that drops an entry fails here instead of shipping
// an unenforced invariant.
const repoRoot = join(import.meta.dirname, '..', '..');
// The type-aware no-floating-promises block runs a TS project service over web/src/**/*.ts, which
// fatals on a virtual path instead of running any rules. It is orthogonal to what this control
// pins, so the override switches that one layer off for the probe paths.
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfig: [
    {
      files: ['web/src/**/*.ts'],
      languageOptions: { parserOptions: { projectService: false } },
      rules: { '@typescript-eslint/no-floating-promises': 'off' },
    },
  ],
});

const SERVER_ONLY_MESSAGE = 'Server-only package';

// None of these paths exist on disk — ESLint reads a file path only to pick the config blocks
// that match it.
const restrictedImports = async (fixture, source) => {
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, fixture) });
  return result.messages.filter((message) => message.ruleId === 'no-restricted-imports');
};

const serverOnlyViolations = async (fixture, source) =>
  (await restrictedImports(fixture, source)).filter((message) =>
    message.message.includes(SERVER_ONLY_MESSAGE)
  );

const CLIENT_FILES = [
  'web/src/lib/ai/probe.ts',
  'web/src/lib/state/probe.svelte.ts',
  'web/src/routes/probe/+page.ts',
];

const SERVER_FILES = [
  'web/src/lib/server/ai/probe.ts',
  'web/src/routes/api/probe/+server.ts',
  'web/src/routes/probe/+page.server.ts',
  'web/src/hooks.server.ts',
  'web/src/lib/ai/probe.test.ts',
];

const SERVER_ONLY_IMPORTS = [
  "import sharp from 'sharp';",
  "import OpenAI from 'openai';",
  "import type { Response } from 'openai/resources/responses/responses';",
  "import { getStore } from '@netlify/blobs';",
  "export * from '@netlify/blobs';",
];

describe('server-only packages stay behind the web/src server boundary', () => {
  describe.each(CLIENT_FILES)('outside the server paths (%s)', (fixture) => {
    it.each(SERVER_ONLY_IMPORTS)('rejects %s', async (source) => {
      expect(await serverOnlyViolations(fixture, source)).toHaveLength(1);
    });
  });

  it('rejects a server-only import in a Svelte component', async () => {
    expect(
      await serverOnlyViolations(
        'web/src/lib/components/Probe.svelte',
        '<script lang="ts">import sharp from \'sharp\';</script>'
      )
    ).toHaveLength(1);
  });

  describe.each(SERVER_FILES)('inside the server paths or a test (%s)', (fixture) => {
    it.each(SERVER_ONLY_IMPORTS)('allows %s', async (source) => {
      expect(await serverOnlyViolations(fixture, source)).toHaveLength(0);
    });
  });

  it('leaves a local module path that contains a package name alone', async () => {
    expect(
      await serverOnlyViolations(
        'web/src/lib/ai/probe.ts',
        "import { x } from '$lib/openai/models';"
      )
    ).toHaveLength(0);
  });
});

const EXISTING_WEB_SRC_RESTRICTIONS = [
  "import { writable } from 'svelte/store';",
  "import { onDestroy } from 'svelte';",
  "import { chromium } from 'playwright';",
  "import { readFileSync } from 'fs';",
];

describe('the web/src import restrictions still fire beside the server-only ban', () => {
  describe.each([...CLIENT_FILES, 'web/src/lib/server/probe.ts'])('in %s', (fixture) => {
    it.each(EXISTING_WEB_SRC_RESTRICTIONS)('rejects %s', async (source) => {
      expect(await restrictedImports(fixture, source)).toHaveLength(1);
    });
  });
});
