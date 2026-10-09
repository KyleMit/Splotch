import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASE_SCRATCH_GAIN,
  FULL_VOLUME_SPEED,
  GAIN_RAMP_S,
  STOP_DECLICK_S,
  TEARDOWN_SLACK_MS,
} from '../../experiments/native-architecture/src/audio/drawingAudio.ts';
import { SETTINGS_METRICS } from '../../experiments/native-architecture/src/drawing/theme.ts';
import { scale } from '../../web/src/lib/design/tokens.ts';
const root = join(import.meta.dirname, '../..');
const shippingAudio = readFileSync(join(root, 'web/src/lib/audio/drawingSound.ts'), 'utf8');
const mapping = {
  BASE_SCRATCH_GAIN,
  FULL_VOLUME_SPEED,
  GAIN_RAMP_S,
  STOP_DECLICK_S,
  TEARDOWN_SLACK_MS,
};
function assertScratchProjection(source) {
  const projected = Object.fromEntries(
    Object.keys(mapping).map((name) => {
      const match = new RegExp(`const ${name} = ([0-9.]+);`).exec(source);
      assert.ok(match, `Missing shipping scratch constant ${name}`);
      return [name, Number(match[1])];
    })
  );
  assert.deepEqual(mapping, projected);
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const shippingAsset = readFileSync(join(root, 'web/static/sounds/pencil-1.mp3'));
const candidateAsset = readFileSync(
  join(root, 'experiments/native-architecture/src/audio/pencil-1.mp3')
);
describe('candidate-owned audio and Settings projections', () => {
  it('pins the portable scratch mapping to the actual shipping owner', () => {
    expect(() => assertScratchProjection(shippingAudio)).not.toThrow();
  });
  it('rejects a changed shipping scratch mapping', () => {
    const changed = shippingAudio.replace(
      'const BASE_SCRATCH_GAIN = 0.2;',
      'const BASE_SCRATCH_GAIN = 0.9;'
    );
    expect(changed).not.toBe(shippingAudio);
    expect(() => assertScratchProjection(changed)).toThrow();
  });
  it('pins the bundled native clip to the reused portable MP3 bytes', () => {
    expect(digest(candidateAsset)).toBe(digest(shippingAsset));
  });
  it('rejects changed MP3 bytes', () => {
    const changed = Buffer.from(candidateAsset);
    changed[0] ^= 1;
    expect(digest(changed)).not.toBe(digest(shippingAsset));
  });
  it('pins the Settings scale projection to the design owner', () => {
    expect(SETTINGS_METRICS).toEqual({
      radius: parseFloat(scale.radiusLg),
      padding: parseFloat(scale.space6),
      titleSize: parseFloat(scale.fontSizeXl),
      textSize: parseFloat(scale.fontSizeMd),
      gap: parseFloat(scale.space2),
    });
  });
});
