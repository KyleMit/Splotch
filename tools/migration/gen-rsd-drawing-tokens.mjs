import { writeFileSync } from 'node:fs';
import { RSD_DRAWING_TOKENS_URL, rsdTokenSource } from './lib/rsd-fixture-tokens.mjs';

writeFileSync(RSD_DRAWING_TOKENS_URL, await rsdTokenSource());
