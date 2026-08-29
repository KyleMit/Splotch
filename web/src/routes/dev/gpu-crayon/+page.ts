// Dev-only viability harness for the GPU crayon spike. Client-only for the
// same reason /dev/engine is: it reads `window` and a WebGL2 context at
// component init, and under `vite dev` an SSR pass would throw before the
// harness ever mounts.
export const ssr = false;
