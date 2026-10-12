import { readFileSync } from 'node:fs';
import { assertRsdTokenProjection, RSD_DRAWING_TOKENS_URL } from './lib/rsd-fixture-tokens.mjs';

await assertRsdTokenProjection(readFileSync(RSD_DRAWING_TOKENS_URL, 'utf8'));
