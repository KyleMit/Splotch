// Declares only the exports TypeScript imports (web/netlifyFunctionsHost.ts); tools/ itself is untyped.
export function netlifyFunctionRoutes(dir: string): { file: string; path: string }[];
