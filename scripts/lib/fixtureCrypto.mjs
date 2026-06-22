// AES-256-GCM encrypt/decrypt for the red-team fixture corpus (ADR-0023).
// The unsafe/edge drawings under tests/redteam/ are committed as opaque .enc
// blobs so no viewable PNG of probe imagery ever lands in the tree. The key is
// derived from REDTEAM_FIXTURE_KEY (in .env, shared out-of-band — never
// committed). File layout: [12B iv][16B authTag][ciphertext].

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fail } from './utils.mjs';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENC_SUFFIX = '.enc';

// Pull REDTEAM_FIXTURE_KEY from .env if it isn't already exported. Node's loader
// throws when the file is absent; that's fine — we fall back to process.env and
// surface a clear error in getKey() if the key is still missing.
try {
  process.loadEnvFile('.env');
} catch {
  // no .env file — rely on an exported REDTEAM_FIXTURE_KEY
}

function getKey() {
  const secret = process.env.REDTEAM_FIXTURE_KEY;
  if (!secret) {
    fail(
      'Missing REDTEAM_FIXTURE_KEY. Set it in .env (see .env.example) or export it\n' +
        'before encrypting/decrypting the red-team fixtures.'
    );
  }
  // A fixed salt keeps the key stable across machines that share the secret —
  // the passphrase is the entropy; this is at-rest obfuscation for a test
  // corpus, not key-management for production secrets.
  return scryptSync(secret, 'splotch-redteam', 32);
}

export function encryptBuffer(plain, key = getKey()) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBuffer(payload, key = getKey()) {
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function listFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

// Encrypt every file in `inputDir` into `outputDir`, appending `.enc`.
export function encryptDir(inputDir, outputDir) {
  const key = getKey();
  const files = listFiles(inputDir).filter((f) => !f.endsWith(ENC_SUFFIX));
  for (const file of files) {
    const out = join(outputDir, `${relative(inputDir, file)}${ENC_SUFFIX}`);
    ensureDir(out);
    writeFileSync(out, encryptBuffer(readFileSync(file), key));
    console.log(`🔒 ${file} -> ${out}`);
  }
  return files.length;
}

// Decrypt every `.enc` file in `inputDir` into `outputDir`, stripping `.enc`.
export function decryptDir(inputDir, outputDir) {
  const key = getKey();
  const files = listFiles(inputDir).filter((f) => f.endsWith(ENC_SUFFIX));
  for (const file of files) {
    const rel = relative(inputDir, file).slice(0, -ENC_SUFFIX.length);
    const out = join(outputDir, rel);
    ensureDir(out);
    try {
      writeFileSync(out, decryptBuffer(readFileSync(file), key));
    } catch {
      fail(`Failed to decrypt ${file} — wrong REDTEAM_FIXTURE_KEY or corrupt file.`);
    }
    console.log(`🔓 ${file} -> ${out}`);
  }
  return files.length;
}
