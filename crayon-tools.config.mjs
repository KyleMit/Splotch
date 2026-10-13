import config from './tools/vitest.config.mjs';
export default { ...config, cacheDir: new URL('./.crayon-vitest-cache', import.meta.url).pathname };
