import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertApiBundle, bundleApiMode } from '../bundle.mjs';
import { prepareApiMode } from '../selection.mjs';
import {
  CONFIGURATION_PATH,
  EDGE_DIRECTORY,
  SELECTION_PATH,
  configurationSource,
  readApiMode,
  selectionSource,
} from '../../lib/api-mode.mjs';
import noindex from '../../lib/noindex-response.ts';
import { ROOT } from '../../lib/proc.mjs';

const BUNDLE_TIMEOUT_MS = 60_000;
const fixtures = [];
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'splotch-api-mode-'));
  fixtures.push(root);
  return root;
};
afterEach(() =>
  fixtures.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
);

function assertProductionSelection(effects, configuration) {
  assert.equal(effects, selectionSource('production'));
  assert.equal(configuration, configurationSource('production'));
}

describe('build-time API selection', () => {
  it('defaults to production and rejects unknown or production-context test modes before writing', () => {
    const root = fixture();
    expect(readApiMode({})).toBe('production');
    expect(readApiMode({ SPLOTCH_API_MODE: 'production', CONTEXT: 'production' })).toBe(
      'production'
    );
    expect(() => readApiMode({ SPLOTCH_API_MODE: 'typo' })).toThrow('production or test');
    expect(() => prepareApiMode({ SPLOTCH_API_MODE: 'test', CONTEXT: 'production' }, root)).toThrow(
      'forbidden'
    );
    expect(readdirSync(root)).toEqual([]);
  });

  it('keeps the committed selection production, independently of build environment', () => {
    const effects = readFileSync(join(ROOT, SELECTION_PATH), 'utf8');
    const configuration = readFileSync(join(ROOT, CONFIGURATION_PATH), 'utf8');
    expect(() => assertProductionSelection(effects, configuration)).not.toThrow();
    expect(() => assertProductionSelection(selectionSource('test'), configuration)).toThrow();
    expect(() => assertProductionSelection(effects, configurationSource('test'))).toThrow();
  });

  it('emits a static test selection and universal noindex edge function, then removes both on a production rebuild', () => {
    const root = fixture();
    expect(prepareApiMode({ SPLOTCH_API_MODE: 'test', CONTEXT: 'branch-deploy' }, root)).toBe(
      'test'
    );
    expect(readFileSync(join(root, SELECTION_PATH), 'utf8')).toMatch(/fakeAiProvider/);
    expect(readFileSync(join(root, SELECTION_PATH), 'utf8')).not.toMatch(/openai|process\.env/);
    expect(readFileSync(join(root, EDGE_DIRECTORY, 'noindex.ts'), 'utf8')).toContain("path: '/*'");
    expect(prepareApiMode({}, root)).toBe('production');
    expect(readFileSync(join(root, SELECTION_PATH), 'utf8')).not.toMatch(/fake|Test/);
    expect(readdirSync(join(root, EDGE_DIRECTORY))).toEqual([]);
  });
});

describe('physical function bundles', () => {
  let production;
  let test;
  beforeAll(async () => {
    production = await bundleApiMode('production');
    test = await bundleApiMode('test');
  }, BUNDLE_TIMEOUT_MS);

  it('contains only the selected model and outside-effects implementations', () => {
    expect(() => assertApiBundle('production', production)).not.toThrow();
    expect(() => assertApiBundle('test', test)).not.toThrow();
    expect(test.code).toContain('sk-test-success');
    expect(production.code).toContain('api.openai.com');
  });

  it('rejects real wrong-selection bundles as negative controls for both guards', () => {
    expect(() => assertApiBundle('production', test)).toThrow();
    expect(() => assertApiBundle('test', production)).toThrow();
  });
});

it.each([200, 204, 301, 404, 500])(
  'adds noindex without changing a downstream %s response',
  async (status) => {
    const body = status === 204 ? null : 'page or API response';
    const response = await noindex(new Request('https://test.splotch.art/any/path'), {
      next: async () =>
        new Response(body, {
          status,
          headers: {
            'Content-Type': 'text/html',
            Location: '/target',
            'Cache-Control': 'no-store',
          },
        }),
    });
    expect(response.status).toBe(status);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(response.headers.get('Location')).toBe('/target');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe(body ?? '');
  }
);
