import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import sharp from 'sharp';

const out = resolve('docs/scratchpad/2026-10-21-rn-bug-hunt-web');
const engine = process.env.HUNT_ENGINE ?? 'firefox';
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
  for (const file of readdirSync(`${out}/evidence`).filter(
    (name) => name.startsWith(`${engine}-ai-canvas-`) && name.endsWith('.png')
  )) {
    const bytes = readFileSync(`${out}/evidence/${file}`);
    const chunks = [];
    for (let offset = 8; offset < bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      chunks.push({ type: bytes.toString('ascii', offset + 4, offset + 8), length, offset });
      offset += length + 12;
    }
    let admitted = null,
      error = null;
    try {
      admitted = await originalImageGrid(new Uint8Array(bytes), () => true);
    } catch (failure) {
      error = { message: failure.message, stack: failure.stack };
    }
    const removalChecks = [];
    if (error) {
      for (const chunk of chunks.filter(
        (chunk) => !['IHDR', 'IDAT', 'IEND'].includes(chunk.type)
      )) {
        const copy = Buffer.concat([
          bytes.subarray(0, chunk.offset),
          bytes.subarray(chunk.offset + chunk.length + 12),
        ]);
        try {
          const dimensions = await originalImageGrid(new Uint8Array(copy), () => true);
          removalChecks.push({ removedOnly: chunk.type, admitted: dimensions });
        } catch (failure) {
          removalChecks.push({ removedOnly: chunk.type, error: failure.message });
        }
      }
    }
    const decoded = await sharp(bytes).metadata();
    rows.push({
      file,
      chunks,
      admitted,
      error,
      removalChecks,
      decoded: { width: decoded.width, height: decoded.height },
    });
  }
  if (!rows.length)
    throw new Error('No captured original PNGs found. Run the public AI diagnostic first.');
  writeFileSync(
    `${out}/evidence/${engine}-original-png-reader.json`,
    JSON.stringify(rows, null, 2) + '\n'
  );
  console.log(JSON.stringify(rows));
} finally {
  await server.close();
}
