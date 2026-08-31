#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { assertSubscriptionBilling, AUTH_PATH } from './codex-subscription-auth.mjs';

const SUBSCRIPTION_LOGIN_PATTERN = /logged in using chatgpt/i;

export function assertSubscriptionLogin(loginStatus) {
  if (!SUBSCRIPTION_LOGIN_PATTERN.test(loginStatus)) {
    throw new Error(
      `codex login status does not report a ChatGPT login: ${loginStatus.trim() || '(no output)'}`
    );
  }
}

function run(command, args, env) {
  const result = spawnSync(command, args, { encoding: 'utf8', env });
  if (result.error) throw new Error(`${command} is not on PATH: ${result.error.message}`);
  const output = `${result.stdout}${result.stderr}`.trim();
  // A probe that printed recognizable text and then failed is still a failed probe: without this
  // the login pattern could match stale output and the check would report a healthy install.
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited ${result.status ?? result.signal}: ${output || '(no output)'}`
    );
  }
  return output;
}

function main() {
  const { env, stripped } = assertSubscriptionBilling();
  const version = run('codex', ['--version'], env);
  assertSubscriptionLogin(run('codex', ['login', 'status'], env));
  process.stdout.write(
    `${JSON.stringify(
      { ok: true, version, authPath: AUTH_PATH, billing: 'chatgpt-plan', stripped },
      null,
      2
    )}\n`
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
