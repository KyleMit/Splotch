import { check, json } from '../../lib/smoke.mjs';

async function checkGenerationResult(base) {
  // The collect half of the async flow (ADR-0115). Both cases are reachable
  // without a worker or a model call: the job id is the whole request, so a
  // malformed one and an unknown one are the two shapes a client can actually
  // land on when a picture goes missing.
  const malformed = await fetch(`${base}/api/generation-result?job=not-a-job-id`);
  const malformedBody = await json(malformed);
  check(
    'generation-result malformed job id → 400 {ok:false, error}',
    malformed.status === 400 &&
      malformedBody?.ok === false &&
      typeof malformedBody?.error === 'string',
    `got ${malformed.status} ${JSON.stringify(malformedBody)}`
  );

  // 404 where the job store is reachable and the job simply is not there; 503
  // with GENERATION_UNAVAILABLE where it is not reachable at all, which is this
  // server, since a throwaway vite dev has no Netlify Blobs. The code is the
  // point: it is what tells the client to keep waiting rather than abandon a
  // picture that may be sitting there finished. Neither is the 500 an unguarded
  // store read produced.
  const unknown = await fetch(`${base}/api/generation-result?job=${'b'.repeat(64)}`);
  const unknownBody = await json(unknown);
  check(
    'generation-result unknown job → 404, or 503 GENERATION_UNAVAILABLE, never a 500 crash',
    ((unknown.status === 404 && unknownBody?.code === undefined) ||
      (unknown.status === 503 && unknownBody?.code === 'GENERATION_UNAVAILABLE')) &&
      unknownBody?.ok === false &&
      typeof unknownBody?.error === 'string',
    `got ${unknown.status} ${JSON.stringify(unknownBody)}`
  );
}

// Node's strip-types runner cannot resolve the shared contract's extensionless imports.
// generationAttemptPolicy.test.ts pins these literal wire values.
export async function checkGenerationRecoveryContract(base) {
  await checkGenerationResult(base);
  for (const method of ['GET', 'POST']) {
    const response = await fetch(`${base}/api/generation-attempt/v1`, {
      method,
      headers: { 'X-AI-Recovery-Version': 'splotch-ai-recovery-v1' },
    });
    const body = await json(response);
    check(
      `recovery v1 ${method} stays closed before qualification`,
      response.status === 503 &&
        body?.ok === false &&
        body?.code === 'RECOVERY_UNAVAILABLE' &&
        typeof body?.error === 'string',
      `got ${response.status}`
    );
  }
}
