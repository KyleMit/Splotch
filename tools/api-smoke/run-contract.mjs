import { readApiMode } from '../lib/api-mode.mjs';

if (readApiMode(process.env) === 'test') await import('./run-test-contract.mjs');
else await import('./run-local-contract.mjs');
