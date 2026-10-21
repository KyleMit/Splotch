import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import sharp from 'sharp';

const out = resolve('docs/scratchpad/2026-10-21-rn-bug-hunt-web');
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
});
try {
  const { originalImageGrid } = await server.ssrLoadModule(
    resolve('experiments/native-architecture/src/ai/imageAdmission.ts')
  );
  const rows = [];
  for (const file of readdirSync(`${out}/evidence`).filter((name) =>
    /^webkit-ai-canvas-[12]-.*\.png$/.test(name)
  )) {
    const bytes = readFileSync(`${out}/evidence/${file}`);
    const chunks = [];
    const kept = [bytes.subarray(0, 8)];
    for (let offset = 8; offset < bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      chunks.push({ type, length });
      if (type !== 'eXIf') kept.push(bytes.subarray(offset, offset + length + 12));
      offset += length + 12;
    }
    assert(chunks.some((chunk) => chunk.type === 'eXIf'));
    let rejection;
    try {
      await originalImageGrid(new Uint8Array(bytes), () => true);
    } catch (error) {
      rejection = error.message;
    }
    assert(rejection, 'The original WebKit canvas PNG must reach the reader rejection.');
    const stripped = Buffer.concat(kept);
    const dimensions = await originalImageGrid(new Uint8Array(stripped), () => true);
    const decoded = await sharp(bytes).metadata();
    assert.equal(decoded.width, dimensions.width);
    assert.equal(decoded.height, dimensions.height);
    rows.push({
      file,
      chunks,
      rejection,
      withoutExifAccepted: dimensions,
      decodedBySharp: { width: decoded.width, height: decoded.height },
    });
  }
  assert(rows.length >= 2);
  writeFileSync(`${out}/evidence/webkit-png-reader.json`, JSON.stringify(rows, null, 2) + '\n');
  console.log(JSON.stringify(rows));
} finally {
  await server.close();
}
