// Declares only the exports TypeScript imports (web/playwright.shared.ts); tools/ itself is untyped.
export const TCP_PORT: { readonly integer: boolean; readonly min: number; readonly max: number };

export function parseNumberFlag(
  name: string,
  raw: string,
  rule: { integer?: boolean; min?: number; above?: number; max?: number }
): number;
