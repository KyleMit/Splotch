// The parity settle rule: frames every >= 250 ms, settled after three consecutive byte-identical
// frames all taken >= 1000 ms after the last input; no settle within 10 s records `unsettled`.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const SETTLE_DELAY_MS = 1000;
const SETTLE_INTERVAL_MS = 250;
const SETTLE_LIMIT_MS = 10_000;
const IDENTICAL_FRAMES_NEEDED = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function settleCapture(takeShot, outPng, lastInputAt) {
  const wait = lastInputAt + SETTLE_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  let previous = null;
  let identical = 0;
  let frames = 0;
  for (;;) {
    const takenAt = Date.now();
    const buffer = takeShot();
    frames += 1;
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    identical = sha256 === previous ? identical + 1 : 1;
    previous = sha256;
    const settled = identical >= IDENTICAL_FRAMES_NEEDED;
    if (settled || Date.now() - lastInputAt > SETTLE_LIMIT_MS + SETTLE_DELAY_MS) {
      writeFileSync(outPng, buffer);
      return { settled, frames, settleMs: Date.now() - lastInputAt, sha256 };
    }
    const elapsed = Date.now() - takenAt;
    if (elapsed < SETTLE_INTERVAL_MS) await sleep(SETTLE_INTERVAL_MS - elapsed);
  }
}
