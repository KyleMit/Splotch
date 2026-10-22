export function requireTestApiEnvironment(env: Record<string, string>): void;
export function startTestApiEnvironment(env: Record<string, string>): Promise<{
  close: () => Promise<void>;
  issues: () => Promise<{ title: string; body: string; labels: string[] }[]>;
  storeNames: () => Promise<string[]>;
}>;
