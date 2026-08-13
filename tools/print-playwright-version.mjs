import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('@playwright/test/package.json');

process.stdout.write(`version=${version}\n`);
