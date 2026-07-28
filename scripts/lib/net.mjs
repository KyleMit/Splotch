import { sleep } from './proc.mjs';

// Poll a URL until `ready(res)` (plain HTTP reachability by default) or throw
// at the deadline.
export async function waitForUrl(url, timeoutMs, ready = (res) => res.ok) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (ready(await fetch(url))) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error(`${url} did not become ready within ${timeoutMs}ms`);
}
