#!/usr/bin/env node
// CLI to encrypt/decrypt the red-team fixture corpus (ADR-0023).
//
//   node tools/redteam/manage-encrypted-fixtures.mjs encrypt   # source/    -> encrypted/ (commit these)
//   node tools/redteam/manage-encrypted-fixtures.mjs decrypt   # encrypted/ -> decrypted/ (gitignored)
//
// Requires REDTEAM_FIXTURE_KEY (in web/.env or exported). source/ and decrypted/
// are gitignored; only encrypted/*.enc is committed.

import { join } from 'node:path';
import { ROOT, fail, requireEnv } from '../lib/proc.mjs';
import { REDTEAM_ENV_HINT, decryptDir, encryptDir, loadRedteamEnv } from './lib/fixture-crypto.mjs';

const BASE = join(ROOT, 'tools', 'redteam');
const SOURCE = join(BASE, 'source');
const ENCRYPTED = join(BASE, 'encrypted');
const DECRYPTED = join(BASE, 'decrypted');

const command = process.argv[2];

function readFixtureKey() {
  loadRedteamEnv();
  return requireEnv('REDTEAM_FIXTURE_KEY', REDTEAM_ENV_HINT);
}

try {
  if (command === 'encrypt') {
    const count = encryptDir(SOURCE, ENCRYPTED, readFixtureKey());
    console.log(
      count
        ? `\nEncrypted ${count} file(s) into tools/redteam/encrypted/. Commit the .enc files.`
        : `\nNothing to encrypt — add source PNGs to tools/redteam/source/ first.`
    );
  } else if (command === 'decrypt') {
    const count = decryptDir(ENCRYPTED, DECRYPTED, readFixtureKey());
    console.log(
      count
        ? `\nDecrypted ${count} file(s) into tools/redteam/decrypted/ (gitignored).`
        : `\nNothing to decrypt — tools/redteam/encrypted/ has no .enc files yet.`
    );
  } else {
    fail('Usage: node tools/redteam/manage-encrypted-fixtures.mjs <encrypt|decrypt>');
  }
} catch (err) {
  fail(err.message);
}
