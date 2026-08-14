import { readFileSync } from 'node:fs';
import OpenAI from 'openai';
const SP = '/private/tmp/claude-501/-Users-kylemit-Code-Splotch/293e7df1-b7ee-4f59-ad84-f62c697a683a/scratchpad';
const key = readFileSync(`${SP}/oai.key`, 'utf8').trim();

const deadline = (ms) => ({ signal: AbortSignal.timeout(ms), timeout: ms });

for (const [label, run] of [
  ['plain', async () => new OpenAI({ apiKey: key }).models.retrieve('gpt-image-2')],
  ['with deadline opts (as shipped)', async () =>
    new OpenAI({ apiKey: key, timeout: 10_000, maxRetries: 1 }).models.retrieve('gpt-image-2', deadline(10_000))],
]) {
  const t = performance.now();
  try {
    const m = await run();
    console.log(`${label.padEnd(34)} OK   ${Math.round(performance.now()-t)}ms id=${m.id}`);
  } catch (e) {
    console.log(`${label.padEnd(34)} FAIL ${Math.round(performance.now()-t)}ms ${e.constructor.name} status=${e.status} ${(e.message||'').split('\n')[0].slice(0,100)}`);
  }
}
