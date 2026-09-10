#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isEntryPoint } from './broker-server.mjs';
import { readSession, SESSION_FILES } from './spool.mjs';
import { parseFindings } from './validate-findings.mjs';
import { PACKET_FILES } from './worktree.mjs';

export const REPOSITORY = 'KyleMit/Splotch';
export const MARKER_PREFIX = 'splotch-rival-review';
const OID_PATTERN = /^[0-9a-f]{40}$/;
// The trusted install cannot import the perf capability. post-review.test.mjs guards these
// hardware shapes against tools/perf/lib/device-identifiers.mjs.
const SENSITIVE_PATTERNS = [
  ['iOS device identifier', /\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}\b/],
  ['Android device identifier', /\bR5C[A-Z0-9]{8}\b/],
  [
    'device identifier',
    /(?:\b(?:[\w.-]*(?:udid|serial|device[_-]?id))\b(?:["'`\s]*[:=]["'`\s]*|\s+["'`]+|\s+(?=[0-9a-f]{16}(?:[0-9a-f]{24})?\b))|\b(?:adb\s+-s|idevice\w*\s+-u)\s+["'`]?|\bplatform=iOS,id=)(?:[0-9a-f]{16}(?:[0-9a-f]{24})?\b|(?=[a-z0-9.-]*\d)[a-z0-9][a-z0-9.-]{5,})/i,
  ],
  [
    'credential',
    /\b(?:gh[pousr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|sk-[a-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|AIza[a-z0-9_-]{30,})\b/i,
  ],
  ['private key', /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/],
  [
    'credential',
    /\b[\w.-]*(?:api[_-]?key|token|password|secret)\b["'`\s]*[:=]\s*["'`][^\s"'`[\]{}]{8,}/i,
  ],
  [
    'credential',
    /\b[\w.-]*(?:api[_-]?key|token|password|secret)\b\s*=\s*(?!process\.env\.|(?:config|configuration)\.|[a-z_$][\w.$]*\s*\()[^\s"'`[\]{}]{8,}/i,
  ],
  [
    'authorization credential',
    /\bauthorization\b["'`\s]*[:=]["'`\s]*(?:Bearer|Basic)\s+[a-z0-9_+/.=-]{8,}/i,
  ],
  [
    'authorization credential',
    /\b(?:[Bb]earer|[Bb]asic)\s+(?=[a-zA-Z0-9_+/.=-]*(?:[0-9_+/.=-]|[A-Z][a-z]|[a-z][A-Z]))[a-zA-Z0-9_+/.=-]{8,}/,
  ],
];

// Scan the rendered payload so summaries, off-diff findings, commands and inline paths share the
// same publication boundary. Diagnostics identify fields, never the matched repository values.
export function assertSafeReview(request) {
  const fields = [['body', request.body]];
  request.comments.forEach((comment, index) => {
    fields.push(
      [`comments[${index}].body`, comment.body],
      [`comments[${index}].path`, comment.path]
    );
  });
  const detections = fields.flatMap(([field, text]) =>
    SENSITIVE_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(
      ([kind]) => `${field}: ${kind}`
    )
  );
  if (detections.length > 0) {
    throw new Error(
      `Review publication blocked (${detections.join('; ')}). No review was posted. Keep the original findings.json; create a separate sanitized copy, replace sensitive values with [REDACTED], and retry post-review.mjs with --sanitized-findings <file>. See tools/rival-agent/README.md for safe recovery.`
    );
  }
}

export function buildMarker({ rival, base, head, id }) {
  return `<!-- ${MARKER_PREFIX}:rival=${rival};base=${base};head=${head};id=${id} -->`;
}

export function markerScope({ base, head }) {
  return `base=${base};head=${head};`;
}

// Walks unified-diff hunks and records which line numbers each side renders, the set GitHub will
// accept an anchor on.
export function parseDiffAnchors(patch) {
  const anchors = new Map();
  let current;
  let inHunk = false;
  let leftLine = 0;
  let rightLine = 0;
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      current = undefined;
      inHunk = false;
      continue;
    }
    // A deleted file names its path only on the `---` line, an added file only on `+++`; a
    // rename names both, and the new path is what GitHub anchors comments to.
    if (!inHunk && (raw.startsWith('--- ') || raw.startsWith('+++ '))) {
      const path = raw.slice('--- '.length).replace(/^[ab]\//, '');
      if (path !== '/dev/null') {
        current = anchors.get(path) ?? { RIGHT: new Set(), LEFT: new Set() };
        anchors.set(path, current);
      }
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      inHunk = true;
      leftLine = Number(hunk[1]);
      rightLine = Number(hunk[2]);
      continue;
    }
    if (!current || raw.startsWith('\\')) continue;
    if (raw.startsWith('+')) {
      current.RIGHT.add(rightLine);
      rightLine += 1;
    } else if (raw.startsWith('-')) {
      current.LEFT.add(leftLine);
      leftLine += 1;
    } else if (raw.startsWith(' ')) {
      current.RIGHT.add(rightLine);
      current.LEFT.add(leftLine);
      rightLine += 1;
      leftLine += 1;
    }
  }
  return anchors;
}

function isAnchored(finding, anchors) {
  const lines = anchors.get(finding.path)?.[finding.side];
  if (!lines?.has(finding.line)) return false;
  return finding.startLine === null || finding.startLine === undefined
    ? true
    : finding.startLine <= finding.line && lines.has(finding.startLine);
}

export function partitionFindings(findings, anchors) {
  const anchored = [];
  const unanchored = [];
  for (const finding of findings)
    (isAnchored(finding, anchors) ? anchored : unanchored).push(finding);
  return { anchored, unanchored };
}

export function formatCommentBody(finding) {
  return `**${finding.severity}:** ${finding.body}`;
}

function describeLocation(finding) {
  const span =
    finding.startLine !== null &&
    finding.startLine !== undefined &&
    finding.startLine !== finding.line
      ? `${finding.startLine}-${finding.line}`
      : `${finding.line}`;
  return `\`${finding.path}:${span}\``;
}

export function buildReviewBody({ findings, unanchored, marker, rival, round, scope }) {
  const sections = [
    `_Independent review by the ${rival} rival agent, round ${round}, of ${scope}._`,
    findings.summary,
  ];
  if (unanchored.length > 0) {
    sections.push(
      '### Findings outside the diff',
      ...unanchored.map(
        (finding) => `- ${describeLocation(finding)} — ${formatCommentBody(finding)}`
      )
    );
  }
  if (findings.unverified.length > 0) {
    sections.push(
      '### Unverified',
      ...findings.unverified.map(
        (item) => `- ${item.claim} — wanted \`${item.command}\`; ${item.reason}`
      )
    );
  }
  sections.push(marker);
  return sections.join('\n\n');
}

export function buildReviewRequest({ findings, anchors, marker, rival, round, scope, head }) {
  const { anchored, unanchored } = partitionFindings(findings.findings, anchors);
  return {
    commit_id: head,
    event: 'COMMENT',
    body: buildReviewBody({ findings, unanchored, marker, rival, round, scope }),
    comments: anchored.map((finding) => ({
      path: finding.path,
      line: finding.line,
      side: finding.side,
      ...(finding.startLine !== null &&
      finding.startLine !== undefined &&
      finding.startLine !== finding.line
        ? { start_line: finding.startLine, start_side: finding.side }
        : {}),
      body: formatCommentBody(finding),
    })),
  };
}

export function matchingMarkedReviews(reviews, { base, head }) {
  const scope = markerScope({ base, head });
  return reviews.filter(
    (review) =>
      review.body?.includes(`<!-- ${MARKER_PREFIX}:`) &&
      review.body.includes(scope) &&
      review.commit_id === head &&
      review.state === 'COMMENTED'
  );
}

export function defaultGh(args, { input } = {}) {
  const result = spawnSync('gh', args, { encoding: 'utf8', input });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(' ')} exited ${result.status}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

export function readPullRequest(number, gh = defaultGh) {
  const metadata = JSON.parse(
    gh([
      'pr',
      'view',
      String(number),
      '--repo',
      REPOSITORY,
      '--json',
      'number,url,state,isCrossRepository,baseRefName,baseRefOid,headRefName,headRefOid',
    ])
  );
  if (metadata.number !== number) throw new Error(`gh returned pull request ${metadata.number}`);
  if (metadata.state !== 'OPEN') throw new Error(`pull request ${number} is ${metadata.state}`);
  if (metadata.isCrossRepository) throw new Error(`pull request ${number} is from a fork`);
  for (const oid of [metadata.baseRefOid, metadata.headRefOid]) {
    if (!OID_PATTERN.test(oid)) throw new Error(`pull request ${number} has a malformed OID`);
  }
  return metadata;
}

// `--paginate` alone concatenates one JSON array per page, which is not JSON; `--slurp` wraps the
// pages in an outer array. A PR with more than one page of reviews would otherwise fail to parse.
export function readReviews(number, gh = defaultGh) {
  return JSON.parse(
    gh(['api', '--paginate', '--slurp', `repos/${REPOSITORY}/pulls/${number}/reviews`])
  ).flat();
}

// Posting is one request, so GitHub either creates the whole review or none of it; the marker is
// what turns "did it post?" into a question the next call can answer by reading the PR.
export function postReview({
  number,
  findings,
  patch,
  rival,
  round,
  scope,
  base,
  head,
  gh = defaultGh,
  id = randomUUID(),
  sanitized = false,
}) {
  const metadata = readPullRequest(number, gh);
  if (metadata.headRefOid !== head) {
    throw new Error(
      `pull request ${number} head is ${metadata.headRefOid} but the review covered ${head}; review the new head instead`
    );
  }
  if (metadata.baseRefOid !== base) {
    throw new Error(
      `pull request ${number} base is ${metadata.baseRefOid} but the review covered ${base}; review the new range instead`
    );
  }
  const existing = matchingMarkedReviews(readReviews(number, gh), { base, head });
  if (existing.length > 1)
    throw new Error('multiple marked rival reviews already exist for this range');
  if (existing.length === 1) {
    return { state: 'adopted', reviewId: existing[0].id, url: existing[0].html_url };
  }
  const marker = buildMarker({ rival, base, head, id });
  const request = buildReviewRequest({
    findings,
    anchors: parseDiffAnchors(patch),
    marker,
    rival,
    round,
    scope,
    head,
  });
  if (sanitized) {
    request.body = `_Sanitized review: sensitive values removed by the handler; original findings retained locally._\n\n${request.body}`;
  }
  assertSafeReview(request);
  const created = JSON.parse(
    gh(['api', '--method', 'POST', `repos/${REPOSITORY}/pulls/${number}/reviews`, '--input', '-'], {
      input: JSON.stringify(request),
    })
  );
  const verified = readReviews(number, gh).filter((review) => review.body?.includes(marker));
  if (
    verified.length !== 1 ||
    verified[0].state !== 'COMMENTED' ||
    verified[0].commit_id !== head
  ) {
    throw new Error(
      'the rival review did not land as exactly one marked COMMENT on the reviewed head'
    );
  }
  return {
    state: 'posted',
    reviewId: created.id,
    url: created.html_url,
    comments: request.comments.length,
    unanchored: findings.findings.length - request.comments.length,
  };
}

export function parsePostArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      pr: { type: 'string' },
      session: { type: 'string' },
      'sanitized-findings': { type: 'string' },
    },
  });
  if (positionals.length > 0 || !/^\d+$/.test(values.pr ?? '') || !values.session) {
    throw new Error(
      'usage: post-review.mjs --pr <number> --session <dir> [--sanitized-findings <file>]'
    );
  }
  return {
    number: Number(values.pr),
    session: resolve(values.session),
    ...(values['sanitized-findings']
      ? { sanitizedFindings: resolve(values['sanitized-findings']) }
      : {}),
  };
}

function readValidatedFindings(path) {
  const parsed = parseFindings(readFileSync(path, 'utf8'));
  if (!parsed.ok)
    throw new Error('Findings do not match the schema; validate the local file before publishing.');
  return parsed.findings;
}

function readSanitizedFindings(path, original) {
  const sanitized = readValidatedFindings(path);
  const anchors = (document) =>
    document.findings.map(({ path, line, startLine, side, severity }) => [
      path,
      line,
      startLine,
      side,
      severity,
    ]);
  if (
    JSON.stringify(anchors(sanitized)) !== JSON.stringify(anchors(original)) ||
    sanitized.unverified.length !== original.unverified.length
  ) {
    throw new Error(
      'Sanitization must preserve every finding, anchor, severity and unverified entry.'
    );
  }
  return sanitized;
}

export function postFromSession({ number, session, sanitizedFindings, gh = defaultGh }) {
  const record = readSession(session);
  if (!record) throw new Error(`no session at ${session}`);
  const originalPath = join(session, SESSION_FILES.findings);
  const original = readValidatedFindings(originalPath);
  if (sanitizedFindings && resolve(sanitizedFindings) === resolve(originalPath)) {
    throw new Error('Use a separate sanitized findings file; retain the original findings.json.');
  }
  const findings = sanitizedFindings
    ? readSanitizedFindings(sanitizedFindings, original)
    : original;
  return postReview({
    number,
    findings,
    sanitized: Boolean(sanitizedFindings),
    patch: readFileSync(join(session, SESSION_FILES.packet, PACKET_FILES.diff), 'utf8'),
    rival: record.rival,
    round: record.round,
    scope: record.scope.description,
    base: record.scope.base,
    head: record.scope.head,
    gh,
  });
}

if (isEntryPoint(import.meta.url)) {
  try {
    const result = postFromSession(parsePostArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
