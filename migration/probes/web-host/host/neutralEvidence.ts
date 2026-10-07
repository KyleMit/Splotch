import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ownedPath } from '../../../../tools/migration/lib/web-host-ownership.mjs';
import {
  WEB_HOST_REACT_RENDERER_GRAPH,
  WEB_HOST_NEUTRAL_PASSES,
  WEB_HOST_CHROME_VIRTUAL_ID,
} from './contract.ts';
import { assertReactGraph, type ReactGraph } from './reactGraph.ts';
import { readRenderRequest, readRenderedChrome, chromeDigest } from './chromeHtml.ts';

interface NeutralEvidenceInputs {
  owned: { root: string; token: string };
  copyRoot: string;
  requestSha256: string;
  chromeSha256: string;
  passesSha256: string;
}

export function assertNeutralEvidence(input: NeutralEvidenceInputs) {
  const values = readNeutralPassInventory(input.owned, input.passesSha256);
  const renderRequest = readRenderRequest(input.owned, input.copyRoot, input.requestSha256);
  const chrome = readRenderedChrome(
    input.owned,
    input.copyRoot,
    input.chromeSha256,
    input.requestSha256
  );
  const rendererGraph = assertReactGraph(
    input.copyRoot,
    JSON.parse(readFileSync(join(input.copyRoot, WEB_HOST_REACT_RENDERER_GRAPH), 'utf8')),
    'ssr-renderer'
  );
  const passes: ReactGraph[] = values.map((value) => {
    if (
      !value ||
      typeof value !== 'object' ||
      !('stage' in value) ||
      (value.stage !== 'kit-client' && value.stage !== 'kit-server')
    )
      throw new Error('Invalid neutral Kit pass stage');
    return assertReactGraph(input.copyRoot, value, value.stage);
  });
  if (
    !passes.some((pass) => pass.stage === 'kit-client') ||
    !passes.some((pass) => pass.stage === 'kit-server')
  )
    throw new Error('Neutral wrapper omitted one of the actual Kit passes');
  if (passes.some((pass) => JSON.stringify(pass.overlay) !== JSON.stringify(passes[0].overlay)))
    throw new Error('Neutral Kit passes disagree about the actual overlaid source');
  assertRequiredNeutralContributions(passes);
  return { renderRequest, chrome, rendererGraph, passes };
}

function readNeutralPassInventory(
  owned: { root: string; token: string },
  passesSha256: string
): unknown[] {
  const bytes = readFileSync(ownedPath(owned, WEB_HOST_NEUTRAL_PASSES));
  if (!/^[a-f0-9]{64}$/.test(passesSha256) || chromeDigest(bytes) !== passesSha256)
    throw new Error('Published neutral pass inventory changed');
  const values: unknown = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(values) || !values.length)
    throw new Error('Neutral Kit pass inventory is missing');
  return values;
}

export function assertRequiredNeutralContributions(passes: ReactGraph[]): void {
  for (const pass of passes) {
    const modules = pass.chunks.flatMap((chunk) =>
      chunk.modules
        .filter((module) => module.renderedLength > 0)
        .map((module) => module.id.replace(/^\0/, '').split('?')[0])
    );
    if (
      !modules.includes(WEB_HOST_CHROME_VIRTUAL_ID) ||
      !modules.includes('migration/probes/web-host/src/ProbeIsland.svelte')
    )
      throw new Error(
        'Neutral Kit graph omitted the immutable HTML virtual module or island caller'
      );
    if (pass.stage === 'kit-client') {
      for (const source of [
        'migration/probes/web-host/src/ProbeClient.tsx',
        'migration/probes/web-host/src/ProbeChrome.tsx',
      ])
        if (!modules.includes(source))
          throw new Error(`Neutral client omitted its actual caller: ${source}`);
      for (const owner of [
        'react/cjs/react.production.js',
        'react-dom/cjs/react-dom-client.production.js',
      ]) {
        if (!modules.some((id) => id.endsWith(`node_modules/${owner}`)))
          throw new Error(`Neutral client omitted its production React owner: ${owner}`);
      }
    }
  }
}
