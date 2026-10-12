// AES-256-GCM encrypt/decrypt for the red-team fixture corpus (ADR-0023).
// The unsafe/edge drawings under tools/redteam/ are committed as opaque .enc
// blobs so no viewable PNG of probe imagery ever lands in the tree. The key is
// derived from the REDTEAM_FIXTURE_KEY secret (shared out-of-band — never
// committed), which each entry script reads and passes in; this module reads no
// environment and never exits the process. File layout: [12B iv][16B authTag][ciphertext].

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENC_SUFFIX = '.enc';

// Both red-team keys live in the app's env file: the one web/.env.example
// documents and the one .worktreeinclude carries into an agent worktree.
export const REDTEAM_ENV_FILE = join(ROOT, 'web', '.env');
export const REDTEAM_ENV_HINT = 'set it in web/.env (see web/.env.example) or export it';

// Each entry script calls this before reading a key. A variable already exported
// in the shell wins over the file.
export function loadRedteamEnv() {
  if (existsSync(REDTEAM_ENV_FILE)) process.loadEnvFile(REDTEAM_ENV_FILE);
}

function deriveKey(secret) {
  // A fixed salt keeps the key stable across machines that share the secret —
  // the passphrase is the entropy; this is at-rest obfuscation for a test
  // corpus, not key-management for production secrets.
  return scryptSync(secret, 'splotch-redteam', 32);
}

function encryptBuffer(plain, key) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decryptBuffer(payload, key) {
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
export function encryptDir(inputDir, outputDir, secret) {
  const key = deriveKey(secret);
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
export function decryptDir(inputDir, outputDir, secret) {
  const key = deriveKey(secret);
  const files = listFiles(inputDir).filter((f) => f.endsWith(ENC_SUFFIX));
  for (const file of files) {
    const rel = relative(inputDir, file).slice(0, -ENC_SUFFIX.length);
    const out = join(outputDir, rel);
    let plain;
    try {
      plain = decryptBuffer(readFileSync(file), key);
    } catch (err) {
      throw new Error(`Failed to decrypt ${file} — wrong REDTEAM_FIXTURE_KEY or corrupt file.`, {
        cause: err,
      });
    }
    ensureDir(out);
    writeFileSync(out, plain);
    console.log(`🔓 ${file} -> ${out}`);
  }
  return files.length;
}
