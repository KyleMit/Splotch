#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { claudeVendor } from './launch-claude.mjs';
import { isEntryPoint } from '../../../../tools/rival-agent/broker-server.mjs';
import { launch, parseLaunchArgs } from '../../../../tools/rival-agent/launch.mjs';
import { postFromSession } from '../../../../tools/rival-agent/post-review.mjs';
import {
  pendingRequests,
  REPLY_POLL_MS,
  writeReply,
} from '../../../../tools/rival-agent/spool.mjs';

// The fixed path implement-issue-stack invokes. An orchestrated review has no native handler
// serving the broker, so every request the rival makes is declined with this reason and the review
// is what the rival can establish by reading alone.
export const ORCHESTRATED_DECLINE_REASON =
  'this orchestrated review runs without a native handler serving the broker; nothing can be executed';

export function parseReviewerArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      pr: { type: 'string' },
      'end-session': { type: 'boolean', default: false },
    },
  });
  if (positionals.length > 0 || !/^\d+$/.test(values.pr ?? '') || Number(values.pr) < 1) {
    throw new Error(
      'usage: splotch-claude-review-publish.mjs --pr <positive-integer> [--end-session]'
    );
  }
  return { prNumber: Number(values.pr), endSession: values['end-session'] };
}

export function declinePending(session) {
  let declined = 0;
  for (const request of pendingRequests(session)) {
    writeReply(session, request.seq, { declined: ORCHESTRATED_DECLINE_REASON });
    declined += 1;
  }
  return declined;
}

export async function publishReview(
  prNumber,
  { onProgress = (line) => process.stderr.write(`${line}\n`) } = {}
) {
  let session;
  let decliner;
  const watch = (line) => {
    onProgress(line);
    if (line.startsWith('session: ') && !decliner) {
      session = line.slice('session: '.length);
      decliner = setInterval(() => declinePending(session), REPLY_POLL_MS);
    }
  };
  try {
    const done = await launch(parseLaunchArgs(['--pr', String(prNumber)]), claudeVendor, {
      onProgress: watch,
    });
    return {
      ...postFromSession({ number: prNumber, session: done.session }),
      session: done.session,
    };
  } finally {
    if (decliner) clearInterval(decliner);
  }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseReviewerArgs(argv);
    if (options.endSession) {
      const ended = await launch(
        parseLaunchArgs(['--pr', String(options.prNumber), '--end-session']),
        claudeVendor
      );
      process.stdout.write(`${JSON.stringify(ended, null, 2)}\n`);
      return;
    }
    const result = await publishReview(options.prNumber);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url)) main();
