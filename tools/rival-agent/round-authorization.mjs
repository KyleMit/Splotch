import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { MAX_ROUNDS } from './ledger.mjs';

const MAX_AUTHORIZATION_BYTES = 256 * 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTHORIZATION_FIELDS = [
  'schemaVersion',
  'repoRoot',
  'pullRequest',
  'rival',
  'rivalSessionId',
  'ledgerSha256',
  'priorRounds',
  'authorizedRound',
  'authorization',
];
const PROVENANCE_FIELDS = ['kind', 'quote', 'source', 'recordedAt'];
const RECORD_OPTIONS = { mode: 0o600 };

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hasExactFields(value, fields) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

function nonemptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoTimestamp(value) {
  return (
    nonemptyText(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function validateAuthorization(grant) {
  if (
    !hasExactFields(grant, AUTHORIZATION_FIELDS) ||
    grant.schemaVersion !== 1 ||
    typeof grant.repoRoot !== 'string' ||
    !isAbsolute(grant.repoRoot) ||
    !Number.isSafeInteger(grant.pullRequest) ||
    grant.pullRequest < 1 ||
    !['claude', 'codex'].includes(grant.rival) ||
    !SESSION_ID_PATTERN.test(grant.rivalSessionId ?? '') ||
    !SHA256_PATTERN.test(grant.ledgerSha256 ?? '') ||
    grant.priorRounds !== MAX_ROUNDS ||
    grant.authorizedRound !== MAX_ROUNDS + 1
  ) {
    throw new Error('invalid round authorization schema or round disposition');
  }
  const provenance = grant.authorization;
  if (
    !hasExactFields(provenance, PROVENANCE_FIELDS) ||
    provenance.kind !== 'direct-human-message' ||
    !nonemptyText(provenance.quote) ||
    !nonemptyText(provenance.source) ||
    !isIsoTimestamp(provenance.recordedAt)
  ) {
    throw new Error('round authorization requires the direct human quote and durable chat source');
  }
}

function readAuthorizationFile(path) {
  if (!isAbsolute(path)) throw new Error('--round-authorization-file must be absolute');
  const stats = lstatSync(path);
  if (!stats.isFile()) throw new Error('--round-authorization-file must name a regular file');
  if (stats.size > MAX_AUTHORIZATION_BYTES)
    throw new Error('round authorization file is too large');
  const bytes = readFileSync(path);
  if (bytes.length > MAX_AUTHORIZATION_BYTES)
    throw new Error('round authorization file is too large');
  const grant = JSON.parse(bytes.toString('utf8'));
  validateAuthorization(grant);
  return { grant, authorizationFileSha256: digest(bytes) };
}

export function assertAuthorizationOptions(options) {
  if (
    options.roundAuthorizationFile !== undefined &&
    (options.scope.kind !== 'pr' || options.fresh || options.endSession || options.questionFile)
  ) {
    throw new Error(
      '--round-authorization-file requires an existing PR review without fresh, end, or question'
    );
  }
}

export function planAuthorizedRound(path, { repoRoot, scope, rival, recordPath, record }) {
  const evidence = readAuthorizationFile(path);
  const { grant } = evidence;
  if (
    scope.kind !== 'pr' ||
    grant.repoRoot !== repoRoot ||
    grant.pullRequest !== scope.number ||
    grant.rival !== rival ||
    !record ||
    record.rival !== rival ||
    grant.rivalSessionId !== record.rivalSessionId ||
    record.rounds !== MAX_ROUNDS ||
    record.roundAuthorization
  ) {
    throw new Error('round authorization does not match the exhausted PR conversation');
  }
  const ledgerBytes = readFileSync(recordPath);
  if (
    digest(ledgerBytes) !== grant.ledgerSha256 ||
    JSON.stringify(JSON.parse(ledgerBytes.toString('utf8'))) !== JSON.stringify(record)
  ) {
    throw new Error('round authorization does not match the existing ledger bytes');
  }
  return {
    round: grant.authorizedRound,
    resume: record.rivalSessionId,
    previous: record,
    roundAuthorization: { ...evidence, priorLedgerRecord: record },
  };
}

function assertLedgerUnchanged(recordPath, evidence) {
  if (digest(readFileSync(recordPath)) !== evidence.grant.ledgerSha256) {
    throw new Error('authorized reviewer ledger changed since the grant was bound');
  }
}

export function claimRoundAuthorization(recordPath, evidence, session) {
  const directory = join(dirname(recordPath), 'round-authorizations');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${basename(recordPath)}.${evidence.grant.ledgerSha256}.json`);
  const receipt = { state: 'reserved', session, evidence, reservedAt: new Date().toISOString() };
  try {
    writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, { ...RECORD_OPTIONS, flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error('round authorization already claimed; replay refused', { cause: error });
    throw error;
  }
  const claim = { path, receipt, started: false };
  try {
    assertLedgerUnchanged(recordPath, evidence);
  } catch (error) {
    releaseUnstartedRoundAuthorization(claim);
    throw error;
  }
  return claim;
}

export function startRoundAuthorization(claim, recordPath) {
  assertLedgerUnchanged(recordPath, claim.receipt.evidence);
  const receipt = { ...claim.receipt, state: 'started', startedAt: new Date().toISOString() };
  // A durable receipt consumes the grant before the stream can start; a failed stream cannot replay it.
  writeFileSync(claim.path, `${JSON.stringify(receipt, null, 2)}\n`, RECORD_OPTIONS);
  claim.started = true;
}

export function assertAuthorizedResult(claim, recordPath, state) {
  const evidence = claim.receipt.evidence;
  if (state.sessionId !== evidence.grant.rivalSessionId) {
    throw new Error('authorized round returned a different reviewer conversation');
  }
  assertLedgerUnchanged(recordPath, evidence);
}

export function releaseUnstartedRoundAuthorization(claim) {
  if (!claim || claim.started) return;
  const stored = JSON.parse(readFileSync(claim.path, 'utf8'));
  if (stored.state !== 'reserved' || stored.session !== claim.receipt.session) {
    throw new Error('round authorization claim changed; refusing to remove it');
  }
  rmSync(claim.path);
}
