#!/usr/bin/env node
// CLI to encrypt/decrypt the red-team fixture corpus (ADR-0023).
//
//   node scripts/redteam-fixtures.mjs encrypt   # source/    -> encrypted/ (commit these)
//   node scripts/redteam-fixtures.mjs decrypt   # encrypted/ -> decrypted/ (gitignored)
//
// Requires REDTEAM_FIXTURE_KEY (in .env or exported). source/ and decrypted/
// are gitignored; only encrypted/*.enc is committed.

import { join } from 'node:path';
import { ROOT, fail } from './lib/utils.mjs';
import { encryptDir, decryptDir } from './lib/fixtureCrypto.mjs';

const BASE = join(ROOT, 'web', 'tests', 'redteam');
const SOURCE = join(BASE, 'source');
const ENCRYPTED = join(BASE, 'encrypted');
const DECRYPTED = join(BASE, 'decrypted');

const command = process.argv[2];

if (command === 'encrypt') {
  const count = encryptDir(SOURCE, ENCRYPTED);
  console.log(
    count
      ? `\nEncrypted ${count} file(s) into tests/redteam/encrypted/. Commit the .enc files.`
      : `\nNothing to encrypt — add source PNGs to tests/redteam/source/ first.`
  );
} else if (command === 'decrypt') {
  const count = decryptDir(ENCRYPTED, DECRYPTED);
  console.log(
    count
      ? `\nDecrypted ${count} file(s) into tests/redteam/decrypted/ (gitignored).`
      : `\nNothing to decrypt — tests/redteam/encrypted/ has no .enc files yet.`
  );
} else {
  fail('Usage: node scripts/redteam-fixtures.mjs <encrypt|decrypt>');
}
