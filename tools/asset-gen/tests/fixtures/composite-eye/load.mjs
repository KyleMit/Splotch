import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const FIXTURES = dirname(fileURLToPath(import.meta.url));

export async function loadTrio(name) {
  const [comp, light, pen] = await Promise.all([
    readFile(join(FIXTURES, `${name}.comp.webp`)),
    readFile(join(FIXTURES, `${name}.light.webp`)),
    readFile(join(FIXTURES, `${name}.pen.webp`)),
  ]);
  return { comp, light, pen };
}
