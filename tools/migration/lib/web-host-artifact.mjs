import { fileInventory } from './web-host-files.mjs';
import { assertPinnedBuildMetadata } from './web-host-metadata.mjs';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import {
  WEB_HOST_NEUTRAL_COPY_ROLES,
  WEB_HOST_NEUTRAL_COPY_ROLE,
  WEB_HOST_ENV,
  WEB_HOST_VARIANT,
  webHostCopyRoles,
  webHostRequest,
  WEB_HOST_INPUTS,
  WEB_HOST_MARKER,
  WEB_HOST_RESULT,
  WEB_HOST_OUTPUT_PATHS,
  webHostArtifact,
} from '../../../migration/probes/web-host/host/contract.ts';
import { assertOwnedArtifact, ownedPath, pathInside } from './web-host-ownership.mjs';
import { assertFinalInputBindings } from './web-host-inputs.mjs';
import { sha256 } from './web-host-source.mjs';
import { appShellPrecacheUrl } from '../../../web/src/lib/pwa/appShellRoute.ts';
import {
  APP_SHELL_PRECACHE_URL_PATTERN,
  precacheUrlsFromSource,
} from '../../lib/pwa-precache-source.mjs';
import { assertNeutralEvidence } from '../../../migration/probes/web-host/host/neutralEvidence.ts';

export function readWebHostArtifact(requestedRoot) {
  if (typeof requestedRoot !== 'string' || !requestedRoot)
    throw new Error('An actual --artifact-root is required');
  const root = realpathSync(requestedRoot);
  const marker = JSON.parse(readFileSync(join(root, WEB_HOST_MARKER), 'utf8'));
  if (typeof marker.token !== 'string' || !marker.token)
    throw new Error('Artifact marker has no ownership token');
  const owned = { root, token: marker.token };
  assertOwnedArtifact(owned);
  const inputBytes = readFileSync(ownedPath(owned, WEB_HOST_INPUTS));
  const inputs = JSON.parse(inputBytes.toString('utf8'));
  const result = JSON.parse(readFileSync(ownedPath(owned, WEB_HOST_RESULT), 'utf8'));
  const artifact = webHostArtifact(inputs.artifact);
  const request = webHostRequest({
    variant: inputs.variant,
    artifact,
    fixture: inputs.fixture,
    capacitor: 'false',
    perfMarks: 'false',
    harness: artifact === 'mechanism' ? 'true' : 'false',
  });
  if (
    inputs.bindings?.variant !== request.variant ||
    Object.keys(inputs.copies ?? {})
      .sort()
      .join() !== [...webHostCopyRoles(request.variant)].sort().join()
  )
    throw new Error('Artifact copy roles or input binding disagree with its requested variant');
  assertPinnedBuildMetadata(inputs.pinned);
  if (
    result.inputsSha256 !== sha256(inputBytes) ||
    result.status !== 'structural-build-only' ||
    result.artifact !== artifact ||
    (result.variant ?? WEB_HOST_VARIANT) !== request.variant ||
    result.sourceSha !== inputs.snapshot.sha ||
    result.topologySha !== inputs.snapshot.topologySha ||
    result.evidence?.control?.version?.version !== inputs.pinned.metadata.appVersion
  ) {
    throw new Error(
      'Only a completed, source-bound structural build artifact can be checked/served'
    );
  }
  assertFinalInputBindings(owned, inputs.bindings);
  for (const role of webHostCopyRoles(request.variant)) {
    const copyRoot = realpathSync(inputs.copies[role]);
    if (
      copyRoot !== join(root, role) ||
      !pathInside(root, copyRoot) ||
      lstatSync(inputs.copies[role]).isSymbolicLink()
    )
      throw new Error(`${role} copy is outside its owned artifact`);
    if (sha256(readFileSync(join(copyRoot, 'pnpm-lock.yaml'))) !== inputs.snapshot.lockSha256)
      throw new Error(`${role} lock changed after its build`);
    assertOwnedOutputIntegrity(owned, copyRoot, result.evidence[role]?.outputs, role);
    const expectedUrl =
      role === WEB_HOST_NEUTRAL_COPY_ROLE
        ? result.evidence[role].appShellUrl
        : appShellPrecacheUrl(inputs.pinned.appShellNonce);
    const actualUrls = precacheUrlsFromSource(
      readFileSync(join(copyRoot, 'web/.svelte-kit/output/client/sw.js'), 'utf8')
    ).filter((url) => APP_SHELL_PRECACHE_URL_PATTERN.test(url));
    if (
      actualUrls.length !== 1 ||
      actualUrls[0] !== expectedUrl ||
      result.evidence[role].appShellUrl !== expectedUrl
    )
      throw new Error(
        `Artifact ${role} app-shell URL disagrees with its recorded ${
          role === WEB_HOST_NEUTRAL_COPY_ROLE ? 'neutral output' : 'paired nonce'
        }`
      );
  }
  let publicationEnvironment = {};
  if (request.variant === 'neutral-embedded') {
    if (
      !inputs.neutral ||
      Object.keys(inputs.neutral).sort().join() !==
        ['chromeSha256', 'passesSha256', 'requestSha256'].join()
    )
      throw new Error('Neutral artifact omitted its exact published input hashes');
    const proof = assertNeutralEvidence({
      owned,
      copyRoot: inputs.copies.neutral,
      ...inputs.neutral,
    });
    if (
      JSON.stringify(proof.renderRequest.request) !== JSON.stringify(request) ||
      JSON.stringify(proof) !== JSON.stringify(result.evidence.neutralProof) ||
      result.evidence.neutral.version.version !== inputs.pinned.metadata.appVersion
    )
      throw new Error('Neutral artifact publication or version changed');
    publicationEnvironment = {
      [WEB_HOST_ENV.renderRequestSha256]: inputs.neutral.requestSha256,
      [WEB_HOST_ENV.chromeSha256]: inputs.neutral.chromeSha256,
    };
  }
  const copyRoot =
    request.variant === 'neutral-embedded' ? inputs.copies.neutral : inputs.copies.control;
  return { owned, inputs, result, artifact, copyRoot, request, publicationEnvironment };
}

export function assertOwnedOutputIntegrity(owned, copyRoot, expected, role) {
  if (!WEB_HOST_NEUTRAL_COPY_ROLES.includes(role) || copyRoot !== join(owned.root, role))
    throw new Error('Output inventory requires its actual owned copy role');
  if (
    !expected ||
    Object.keys(expected).sort().join() !== [...WEB_HOST_OUTPUT_PATHS].sort().join()
  ) {
    throw new Error('Artifact omitted its complete emitted output inventory');
  }
  for (const path of WEB_HOST_OUTPUT_PATHS) {
    ownedPath(owned, join(role, path));
    if (JSON.stringify(fileInventory(join(copyRoot, path))) !== JSON.stringify(expected[path])) {
      throw new Error(`Built ${role} output changed after capture: ${path}`);
    }
  }
}
