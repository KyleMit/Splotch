// @vitest-environment node
import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every /api method handler is exported as apiHandler(...) (eslint.config.js API_HANDLER_WRAPPED).
// The guard is a no-restricted-syntax block for the /api routes, and flat config REPLACES that
// rule's entry wherever a later block configures it, so this control seeds each unwrapped shape
// into a route path and also checks the block still carries the web/src set it recomposes.
const repoRoot = join(import.meta.dirname, '..', '..');
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

// None of these paths exist on disk: ESLint reads a file path only to pick the config blocks that
// match it.
const ROUTE = 'web/src/routes/api/probe/+server.ts';

const restrictions = async (fixture, source, messageFragment) => {
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, fixture) });
  return result.messages.filter(
    (message) =>
      message.ruleId === 'no-restricted-syntax' && message.message.includes(messageFragment)
  );
};
const unwrapped = (fixture, source) => restrictions(fixture, source, 'apiHandler(...)');

describe('the /api handler wrapping guard', () => {
  it.each([
    ['an async arrow', 'export const POST = async () => new Response();'],
    ['a typed handler reference', 'export const GET: RequestHandler = handler;'],
    ['a function declaration', 'export function DELETE() { return new Response(); }'],
    ['an async function declaration', 'export async function PUT() { return new Response(); }'],
    ['another wrapper around apiHandler', 'export const PATCH = logged(apiHandler(handler));'],
    ['a fallback handler', 'export const fallback = async () => new Response();'],
    ['a renamed export', 'const handler = apiHandler(inner);\nexport { handler as POST };'],
  ])('rejects %s', async (_shape, source) => {
    expect(await unwrapped(ROUTE, source)).toHaveLength(1);
  });

  it.each([
    [
      'a local function named apiHandler',
      'const apiHandler = (handler) => handler;\nexport const POST = apiHandler(inner);',
    ],
    [
      'an apiHandler imported from another module',
      "import { apiHandler } from '$lib/server/wrap';\nexport const POST = apiHandler(inner);",
    ],
    [
      'another export renamed to apiHandler',
      "import { fail as apiHandler } from '$lib/server/http';\nexport const POST = apiHandler(inner);",
    ],
    [
      'a destructured apiHandler',
      'const { apiHandler } = wrappers;\nexport const POST = apiHandler(inner);',
    ],
    [
      'an array-destructured apiHandler',
      'const [apiHandler] = wrappers;\nexport const POST = apiHandler(inner);',
    ],
    [
      'a defaulted destructured apiHandler',
      'const { apiHandler = fallback } = wrappers;\nexport const POST = apiHandler(inner);',
    ],
    [
      'a rest-bound apiHandler',
      'const [...apiHandler] = wrappers;\nexport const POST = apiHandler(inner);',
    ],
  ])('rejects %s, since the callee is matched by name', async (_shape, source) => {
    expect(await unwrapped(ROUTE, source)).toHaveLength(1);
  });

  it('allows a wrapped handler and the non-handler exports a route carries', async () => {
    const source = [
      "import { apiHandler } from '$lib/server/http';",
      'export const prerender = false;',
      'export type ProbeResponse = { ok: true };',
      'export const POST: RequestHandler = apiHandler(async () => new Response());',
      'export const GET = apiHandler(collect);',
    ].join('\n');
    expect(await unwrapped(ROUTE, source)).toHaveLength(0);
  });

  it('exempts csp-report, whose responses are deliberately bodyless', async () => {
    const source = 'export const POST: RequestHandler = async () => new Response(null);';
    expect(await unwrapped('web/src/routes/api/csp-report/+server.ts', source)).toHaveLength(0);
  });

  it('leaves server routes outside /api alone', async () => {
    const source = 'export const GET = async () => new Response();';
    expect(await unwrapped('web/src/routes/probe/+server.ts', source)).toHaveLength(0);
  });

  it('keeps the web/src set it recomposes', async () => {
    expect(await restrictions(ROUTE, 'export default 1;', 'named exports only')).toHaveLength(1);
  });
});
